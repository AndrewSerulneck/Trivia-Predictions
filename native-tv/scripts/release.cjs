#!/usr/bin/env node
/*
 * Hands-off Fire TV release: bump version → build + sign → verify → upload to Amazon → submit for review.
 *
 *   npm run fire-tv:release              # full release (patch bump, e.g. 1.0.0 → 1.0.1)
 *   npm run fire-tv:release -- --minor   # 1.0.3 → 1.1.0
 *   npm run fire-tv:release -- --dry-run # build + verify + API check; no upload, version bump reverted
 *
 * Needs AMAZON_APPSTORE_CLIENT_ID / AMAZON_APPSTORE_CLIENT_SECRET in .env.local (App Submission API security
 * profile, set up 2026-11-23) and the upload key in ~/Library/Application Support/Hightop Challenge/signing/.
 * Amazon refuses a new edit while a release is in review: the script stops if an edit is already open.
 * Only the shell app ever needs this; website changes reach every TV with a normal deploy.
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
const APKSIGNER = path.join(HOME, "Library/Android/sdk/build-tools/36.0.0/apksigner");
const JAVA_HOME = "/opt/homebrew/opt/openjdk@21";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bumpMinor = args.includes("--minor");

const log = (msg) => console.log(`[fire-tv-release] ${msg}`);
const fail = (msg) => {
  console.error(`[fire-tv-release] FAILED: ${msg}`);
  process.exit(1);
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
  const json = await res.json();
  if (!json.access_token) fail(`Amazon token refused (${res.status} ${json.error ?? ""}).`);
  return json.access_token;
};

const api = async (token, method, urlPath, { body, headers = {} } = {}) => {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
    body,
  });
  const text = await res.text();
  if (!res.ok) fail(`${method} ${urlPath} → ${res.status} ${text.slice(0, 500)}`);
  return { json: text ? JSON.parse(text) : {}, etag: res.headers.get("etag") };
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
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, JAVA_HOME } },
  );
  const out = execFileSync(APKSIGNER, ["verify", "--print-certs", APK_OUT], { encoding: "utf8" });
  const sha = /SHA-256 digest: ([0-9a-f]+)/.exec(out)?.[1];
  if (sha !== CERT_SHA256) fail(`APK signed with an unexpected certificate (${sha ?? "none"}).`);
  log("Signature verified (upload key).");
};

const main = async () => {
  const original = fs.readFileSync(GRADLE_FILE, "utf8");
  const current = readVersion(original);
  const next = { code: current.code + 1, name: nextName(current.name) };

  // Check Amazon first: no point building if a release is already in review.
  const token = await getToken();
  const open = await api(token, "GET", "/edits");
  if (open.json.id) {
    fail(
      `An edit is already open on Amazon (id ${open.json.id}, status ${open.json.status ?? "?"}). ` +
        "Wait for the current release to finish review, or finish/delete that edit in the console.",
    );
  }
  log(`Amazon API OK. Releasing ${current.name} (vc${current.code}) → ${next.name} (vc${next.code}).`);

  const bumped = original
    .replace(/versionCode = \d+/, `versionCode = ${next.code}`)
    .replace(/versionName = "\d+\.\d+\.\d+"/, `versionName = "${next.name}"`);
  fs.writeFileSync(GRADLE_FILE, bumped);

  try {
    build();
  } catch (err) {
    fs.writeFileSync(GRADLE_FILE, original);
    fail(`Build failed; version bump reverted. ${err.message}`);
  }

  fs.mkdirSync(RELEASES, { recursive: true });
  const saved = path.join(RELEASES, `hightop-challenge-tv-${next.name}-vc${next.code}.apk`);
  fs.copyFileSync(APK_OUT, saved);
  log(`Saved ${saved}`);

  if (dryRun) {
    fs.writeFileSync(GRADLE_FILE, original);
    log("Dry run: nothing uploaded; version bump reverted.");
    return;
  }

  const edit = await api(token, "POST", "/edits");
  const editId = edit.json.id;
  log(`Opened edit ${editId}.`);

  const apks = await api(token, "GET", `/edits/${editId}/apks`);
  const apkId = Array.isArray(apks.json) ? apks.json[0]?.id : undefined;
  if (!apkId) fail(`Edit ${editId} has no APK to replace. Delete the edit in the console and check the release.`);

  const apk = await api(token, "GET", `/edits/${editId}/apks/${apkId}`);
  await api(token, "PUT", `/edits/${editId}/apks/${apkId}/replace`, {
    body: fs.readFileSync(saved),
    headers: { "content-type": "application/vnd.android.package-archive", "if-match": apk.etag },
  });
  log("APK uploaded (device targeting and listing kept from the live release).");

  await api(token, "POST", `/edits/${editId}/validate`);
  const current_edit = await api(token, "GET", `/edits/${editId}`);
  await api(token, "POST", `/edits/${editId}/commit`, { headers: { "if-match": current_edit.etag } });
  log(`Submitted ${next.name} (vc${next.code}) for Amazon review. Commit the version bump in app/build.gradle.kts.`);
};

main().catch((err) => fail(err.stack ?? String(err)));
