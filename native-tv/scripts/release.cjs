#!/usr/bin/env node
/*
 * Hands-off Fire TV release: open an Amazon edit → bump version → build + sign → verify → upload → submit for review.
 *
 *   npm run fire-tv:release              # full release (patch bump, e.g. 1.0.0 → 1.0.1)
 *   npm run fire-tv:release -- --minor   # 1.0.3 → 1.1.0
 *   npm run fire-tv:release -- --dry-run # build + verify + API read; no edit, no upload, bump reverted, APK not kept
 *
 * Needs AMAZON_APPSTORE_CLIENT_ID / AMAZON_APPSTORE_CLIENT_SECRET in .env.local (App Submission API security
 * profile, set up 2026-11-23) and the upload key in ~/Library/Application Support/Hightop Challenge/signing/.
 * Only the shell app ever needs this; website changes reach every TV with a normal deploy.
 *
 * Safety rules (docs/fire-tv-app-plan.md Phase CR2.2):
 *  - Nothing below main() calls process.exit: helpers throw, and ONE cleanup undoes everything that was started.
 *    On any failure (or Ctrl-C / SIGTERM) before Amazon accepts the commit, app/build.gradle.kts goes back
 *    byte-for-byte and an edit this run opened is deleted on Amazon (documented: a draft edit can be deleted).
 *  - A version code is never reused: next = max(app/build.gradle.kts, highest vcN saved in the releases folder) + 1,
 *    and the run stops if Amazon's live APK already has that code or higher (the local file is out of date).
 *  - Amazon's answers are trusted only when they have a known shape; anything else stops the run.
 *  - Gradle and apksigner get the environment WITHOUT any AMAZON_* variable.
 *  - After a successful submit the bump stays in the file: commit it (the exact command is printed).
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP_ID = "amzn1.devportal.mobileapp.40a765b23bb84ce49109cafe420be156";
const API = `https://developer.amazon.com/api/appstore/v1/applications/${APP_ID}`;
const CERT_SHA256 = "8122da95844a42c11090e00efa2f73a81d82402d23b0039f32f30a90800baa01";

const ROOT = path.resolve(__dirname, "..");
const GRADLE_FILE = path.join(ROOT, "app/build.gradle.kts");
const HOME = os.homedir();
const APK_OUT = path.join(HOME, "Library/Caches/hightop-native-tv/app/outputs/apk/release/app-release.apk");
const RELEASES = path.join(HOME, "Library/Application Support/Hightop Challenge/releases/fire-tv");
const LOCK_FILE = path.join(RELEASES, ".release.lock");
const APKSIGNER = path.join(HOME, "Library/Android/sdk/build-tools/36.0.0/apksigner");
const JAVA_HOME = "/opt/homebrew/opt/openjdk@21";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bumpMinor = args.includes("--minor");

const log = (msg) => console.log(`[fire-tv-release] ${msg}`);
const warn = (msg) => console.error(`[fire-tv-release] ${msg}`);

class ReleaseError extends Error {}
const fail = (msg) => {
  throw new ReleaseError(msg);
};

// What a child process (Gradle, apksigner) may see: everything except the Amazon credentials.
const childEnv = () => {
  const env = { ...process.env, JAVA_HOME };
  for (const key of Object.keys(env)) if (key.startsWith("AMAZON_")) delete env[key];
  return env;
};

// Keys only, never values: enough to see what Amazon sent without printing anything sensitive.
const shapeOf = (value) => {
  if (Array.isArray(value)) return `array of ${value.length}`;
  if (value && typeof value === "object") return `object with keys [${Object.keys(value).join(", ")}]`;
  return typeof value;
};

const getToken = async () => {
  const id = process.env.AMAZON_APPSTORE_CLIENT_ID;
  const secret = process.env.AMAZON_APPSTORE_CLIENT_SECRET;
  if (!id || !secret) fail("AMAZON_APPSTORE_CLIENT_ID / _SECRET missing (run via npm so .env.local loads).");
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
      scope: "appstore::apps:readwrite",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) fail(`Amazon token refused (${res.status} ${json.error ?? ""}).`);
  return json.access_token;
};

const api = async (token, method, urlPath, { body, headers = {}, allow404 = false } = {}) => {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  });
  const text = await res.text();
  if (allow404 && res.status === 404) return { json: {}, etag: null, status: 404 };
  if (!res.ok) fail(`${method} ${urlPath} → ${res.status} ${text.slice(0, 500)}`);
  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      fail(`${method} ${urlPath} → ${res.status} but the body is not JSON: ${text.slice(0, 200)}`);
    }
  }
  return { json, etag: res.headers.get("etag"), status: res.status };
};

const readVersion = (src) => {
  const code = Number(/versionCode = (\d+)/.exec(src)?.[1]);
  const name = /versionName = "(\d+\.\d+\.\d+)"/.exec(src)?.[1];
  if (!code || !name) fail("Could not read versionCode / versionName in app/build.gradle.kts.");
  return { code, name };
};

const nextName = (name) => {
  const [maj, min, pat] = name.split(".").map(Number);
  return bumpMinor ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
};

// Highest version code of any APK ever saved here (a failed run keeps its APK, so its code is never reused).
const highestSavedCode = () => {
  if (!fs.existsSync(RELEASES)) return 0;
  const codes = fs
    .readdirSync(RELEASES)
    .map((file) => Number(/-vc(\d+)\.apk$/.exec(file)?.[1]))
    .filter((code) => Number.isInteger(code) && code > 0);
  return codes.length ? Math.max(...codes) : 0;
};

const processAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
};

// One release at a time. A lock left by a dead process is replaced.
const takeLock = () => {
  fs.mkdirSync(RELEASES, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
      state.hasLock = true;
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
      if (Number.isInteger(pid) && pid > 0 && processAlive(pid)) {
        fail(`Another Fire TV release is running (process ${pid}). Wait for it to finish.`);
      }
      fs.rmSync(LOCK_FILE, { force: true });
    }
  }
  fail(`Could not take the release lock ${LOCK_FILE}.`);
};

const build = () => {
  log("Building (lint, unit tests, signed release APK)…");
  execFileSync(
    "./gradlew",
    [
      "--project-cache-dir",
      path.join(HOME, "Library/Caches/hightop-native-tv/gradle-project"),
      "clean",
      "lintRelease",
      "testReleaseUnitTest",
      "assembleRelease",
    ],
    { cwd: ROOT, stdio: "inherit", env: childEnv() },
  );
  const out = execFileSync(APKSIGNER, ["verify", "--print-certs", APK_OUT], { encoding: "utf8", env: childEnv() });
  const sha = /SHA-256 digest: ([0-9a-f]+)/.exec(out)?.[1];
  if (sha !== CERT_SHA256) fail(`APK signed with an unexpected certificate (${sha ?? "none"}).`);
  log("Signature verified (upload key).");
};

const state = {
  original: null, // app/build.gradle.kts as it was, restored on failure
  hasLock: false, // this run holds the lock file (never delete another run's)
  bumped: false, // the bump is written to app/build.gradle.kts
  apkEtag: null,
  token: null,
  editId: null, // an edit THIS run opened on Amazon
  committed: false, // Amazon accepted the commit: nothing is undone any more
  cleanup: null,
};

// Undo everything this run started, once. Never throws, never exits.
const cleanup = () => {
  if (state.cleanup) return state.cleanup;
  state.cleanup = (async () => {
    try {
      if (!state.committed) {
        if (state.bumped) {
          try {
            fs.writeFileSync(GRADLE_FILE, state.original);
          } catch (err) {
            warn(`Could not restore app/build.gradle.kts: ${err.message}. Restore it with git.`);
          }
        }
        if (state.editId) {
          try {
            const current = await api(state.token, "GET", `/edits/${state.editId}`);
            await api(state.token, "DELETE", `/edits/${state.editId}`, { headers: { "if-match": current.etag ?? "" } });
            log(`Deleted the unfinished Amazon edit ${state.editId}.`);
          } catch (err) {
            warn(
              `Could not delete the Amazon edit ${state.editId} (${err.message}). Delete it in the Amazon console ` +
                "before the next release.",
            );
          }
        }
      }
    } finally {
      if (state.hasLock) fs.rmSync(LOCK_FILE, { force: true });
    }
  })();
  return state.cleanup;
};

const release = async () => {
  takeLock();
  state.original = fs.readFileSync(GRADLE_FILE, "utf8");
  const current = readVersion(state.original);

  state.token = await getToken();

  // "No edit" is exactly an empty answer (200 {} / empty body) or a 404. An open edit has an id. Anything else is
  // a shape nobody has checked: stop and show it rather than guess.
  const open = await api(state.token, "GET", "/edits", { allow404: true });
  const isEmpty = open.json && typeof open.json === "object" && !Array.isArray(open.json) && !Object.keys(open.json).length;
  if (!isEmpty) {
    if (open.json && typeof open.json === "object" && !Array.isArray(open.json) && open.json.id) {
      fail(
        `An edit is already open on Amazon (id ${open.json.id}, status ${open.json.status ?? "?"}). ` +
          "Wait for the current release to finish review, or finish/delete that edit in the console.",
      );
    }
    fail(`GET /edits returned an unexpected answer (${shapeOf(open.json)}). Check the Amazon console; nothing was changed.`);
  }

  // The next code is above everything this machine has built; Amazon's live code must be below it.
  const next = { code: Math.max(current.code, highestSavedCode()) + 1, name: nextName(current.name) };

  let apkId = null;
  let saved = null;
  if (!dryRun) {
    // Opening the edit first reads Amazon's live APK and finds out early if a release is still in review.
    const edit = await api(state.token, "POST", "/edits");
    state.editId = edit.json.id;
    if (!state.editId) fail(`POST /edits returned no id (${shapeOf(edit.json)}).`);
    log(`Opened edit ${state.editId}.`);

    const apks = await api(state.token, "GET", `/edits/${state.editId}/apks`);
    apkId = Array.isArray(apks.json) ? apks.json[0]?.id : undefined;
    if (!apkId) fail(`Edit ${state.editId} has no APK to replace. Check the release in the Amazon console.`);
    const live = await api(state.token, "GET", `/edits/${state.editId}/apks/${apkId}`);
    state.apkEtag = live.etag;
    const liveCode = Number(live.json.versionCode);
    if (Number.isInteger(liveCode) && liveCode >= next.code) {
      fail(
        `Amazon's live APK is already version code ${liveCode}, but this checkout would release ${next.code}. ` +
          "app/build.gradle.kts is out of date: bring versionCode / versionName up to what is live, then run again.",
      );
    }
    if (!Number.isInteger(liveCode)) warn("Amazon did not report the live version code; Amazon will refuse a repeat at upload.");
  }
  log(`Releasing ${current.name} (vc${current.code}) → ${next.name} (vc${next.code})${dryRun ? " [dry run]" : ""}.`);

  state.bumped = true;
  fs.writeFileSync(
    GRADLE_FILE,
    state.original
      .replace(/versionCode = \d+/, `versionCode = ${next.code}`)
      .replace(/versionName = "\d+\.\d+\.\d+"/, `versionName = "${next.name}"`),
  );

  build();

  if (dryRun) {
    log("Dry run: nothing uploaded, no edit opened, APK not kept; version bump reverted.");
    return;
  }

  saved = path.join(RELEASES, `hightop-challenge-tv-${next.name}-vc${next.code}.apk`);
  try {
    fs.copyFileSync(APK_OUT, saved, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    fail(`Could not save the APK to ${saved}: ${err.code === "EEXIST" ? "that file already exists" : err.message}.`);
  }
  log(`Saved ${saved}`);

  log("Uploading APK…");
  await api(state.token, "PUT", `/edits/${state.editId}/apks/${apkId}/replace`, {
    body: fs.readFileSync(saved),
    headers: { "content-type": "application/vnd.android.package-archive", "if-match": state.apkEtag },
  });
  log("APK uploaded (device targeting and listing kept from the live release).");

  const validation = await api(state.token, "POST", `/edits/${state.editId}/validate`);
  const problems = validation.json && !Array.isArray(validation.json) ? validation.json.errors : undefined;
  if (Array.isArray(problems) ? problems.length : problems) {
    fail(`Amazon validation failed: ${JSON.stringify(problems).slice(0, 500)}`);
  }
  const edited = await api(state.token, "GET", `/edits/${state.editId}`);
  await api(state.token, "POST", `/edits/${state.editId}/commit`, { headers: { "if-match": edited.etag ?? "" } });
  state.committed = true;
  log(`Submitted ${next.name} (vc${next.code}) for Amazon review. Commit the version bump now:`);
  log(`  git add native-tv/app/build.gradle.kts && git commit -m "Fire TV ${next.name} (vc${next.code})"`);
};

const onSignal = (signal, code) => {
  warn(`${signal} received; undoing the release.`);
  cleanup().finally(() => process.exit(code));
};
process.on("SIGINT", () => onSignal("SIGINT", 130));
process.on("SIGTERM", () => onSignal("SIGTERM", 143));

const main = async () => {
  let exitCode = 0;
  try {
    await release();
  } catch (err) {
    exitCode = 1;
    console.error(`[fire-tv-release] FAILED: ${err instanceof ReleaseError ? err.message : (err.stack ?? String(err))}`);
  } finally {
    await cleanup();
  }
  if (exitCode) warn("Release stopped; app/build.gradle.kts is as it was.");
  process.exitCode = exitCode;
};

main();
