#!/usr/bin/env node
/**
 * Store release helper (Google Play + App Store Connect). No dependencies: Node crypto + fetch.
 * Keys live OUTSIDE the repo in ~/Library/Application Support/Hightop Challenge/signing/ and are never printed.
 * Runbook: docs/native-app-release-runbook.md ("Automated uploads").
 *
 *   node native/scripts/store-release.cjs play-status
 *   node native/scripts/store-release.cjs play-upload <file.aab> [--track internal] [--notes "…"]
 *   node native/scripts/store-release.cjs play-promote --code 3 [--from internal] [--track production] [--fraction 0.2] [--notes "…"]
 *   node native/scripts/store-release.cjs asc-status [--version 2.0.1]
 *   node native/scripts/store-release.cjs asc-prepare --version 2.0.1 --build 3 [--notes "…"]
 *   node native/scripts/store-release.cjs asc-submit --version 2.0.1
 */
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PACKAGE = "com.hightopchallenge.app";
const SIGNING_DIR = path.join(os.homedir(), "Library", "Application Support", "Hightop Challenge", "signing");
const PLAY_KEY_FILE = process.env.PLAY_SERVICE_ACCOUNT_FILE || path.join(SIGNING_DIR, "hightop-challenge-a1e76242aee3.json");
const ASC_KEY_ID = process.env.ASC_KEY_ID || "AFVL66FJLV";
const ASC_ISSUER_ID = process.env.ASC_ISSUER_ID || "e8e0f94c-bb12-41fc-b555-feb2a1ba0956";
const ASC_KEY_FILE = process.env.ASC_KEY_FILE || path.join(SIGNING_DIR, `AuthKey_${ASC_KEY_ID}.p8`);
const PLAY_API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;
const PLAY_UPLOAD_API = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}`;
const ASC_API = "https://api.appstoreconnect.apple.com";

const b64url = (input) => Buffer.from(input).toString("base64url");

const parseArgs = (argv) => {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[arg.slice(2)] = true;
      else { flags[arg.slice(2)] = next; i += 1; }
    } else positional.push(arg);
  }
  return { positional, flags };
};

const requireFlag = (flags, name) => {
  const value = flags[name];
  if (typeof value !== "string" || !value) throw new Error(`Missing --${name}`);
  return value;
};

const readJson = async (response, label) => {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${text.slice(0, 2000)}`);
  return text ? JSON.parse(text) : {};
};

// ---------- Google Play ----------

const playToken = async () => {
  const key = JSON.parse(fs.readFileSync(PLAY_KEY_FILE, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: key.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), key.private_key).toString("base64url");
  const response = await fetch(key.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const body = await readJson(response, "Google token");
  return body.access_token;
};

const playClient = async () => {
  const token = await playToken();
  const call = async (method, url, body, label) => readJson(await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), label);
  const openEdit = async () => (await call("POST", `${PLAY_API}/edits`, {}, "Open edit")).id;
  const deleteEdit = async (editId) => {
    await fetch(`${PLAY_API}/edits/${editId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  };
  return { token, call, openEdit, deleteEdit };
};

const releaseNotes = (notes) => (typeof notes === "string" && notes ? [{ language: "en-US", text: notes }] : undefined);

const playStatus = async () => {
  const play = await playClient();
  const editId = await play.openEdit();
  try {
    const { tracks = [] } = await play.call("GET", `${PLAY_API}/edits/${editId}/tracks`, null, "List tracks");
    const { bundles = [] } = await play.call("GET", `${PLAY_API}/edits/${editId}/bundles`, null, "List bundles");
    console.log(JSON.stringify({
      highestVersionCode: Math.max(0, ...bundles.map((b) => Number(b.versionCode))),
      tracks: tracks.map((t) => ({
        track: t.track,
        releases: (t.releases || []).map((r) => ({ name: r.name, versionCodes: r.versionCodes, status: r.status, userFraction: r.userFraction })),
      })),
    }, null, 2));
  } finally {
    await play.deleteEdit(editId);
  }
};

const playUpload = async (file, flags) => {
  if (!file || !fs.existsSync(file)) throw new Error(`No bundle at ${file}`);
  const track = typeof flags.track === "string" ? flags.track : "internal";
  if (track === "production") throw new Error("Upload to a testing track; promote the tested code with play-promote.");
  const play = await playClient();
  const editId = await play.openEdit();
  try {
    const bytes = fs.readFileSync(file);
    const bundle = await readJson(await fetch(`${PLAY_UPLOAD_API}/edits/${editId}/bundles?uploadType=media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${play.token}`, "Content-Type": "application/octet-stream" },
      body: bytes,
    }), "Upload bundle");
    const code = String(bundle.versionCode);
    await play.call("PUT", `${PLAY_API}/edits/${editId}/tracks/${track}`, {
      track,
      releases: [{ versionCodes: [code], status: "completed", releaseNotes: releaseNotes(flags.notes) }],
    }, `Set ${track} track`);
    await play.call("POST", `${PLAY_API}/edits/${editId}:commit`, null, "Commit edit");
    console.log(JSON.stringify({ uploaded: true, versionCode: code, sha256: bundle.sha256, track }, null, 2));
  } catch (error) {
    await play.deleteEdit(editId);
    throw error;
  }
};

// A code already uploaded (e.g. by hand in Play Console) goes to a testing track without re-uploading.
const playRelease = async (flags) => {
  const code = requireFlag(flags, "code");
  const track = typeof flags.track === "string" ? flags.track : "internal";
  if (track === "production") throw new Error("Release to a testing track; promote the tested code with play-promote.");
  const play = await playClient();
  const editId = await play.openEdit();
  try {
    const { bundles = [] } = await play.call("GET", `${PLAY_API}/edits/${editId}/bundles`, null, "List bundles");
    if (!bundles.some((b) => String(b.versionCode) === code)) throw new Error(`Code ${code} has not been uploaded.`);
    await play.call("PUT", `${PLAY_API}/edits/${editId}/tracks/${track}`, {
      track,
      releases: [{ versionCodes: [code], status: "completed", releaseNotes: releaseNotes(flags.notes) }],
    }, `Set ${track} track`);
    await play.call("POST", `${PLAY_API}/edits/${editId}:commit`, null, "Commit edit");
    console.log(JSON.stringify({ released: true, versionCode: code, track }, null, 2));
  } catch (error) {
    await play.deleteEdit(editId);
    throw error;
  }
};

const playPromote = async (flags) => {
  const code = requireFlag(flags, "code");
  const from = typeof flags.from === "string" ? flags.from : "internal";
  const track = typeof flags.track === "string" ? flags.track : "production";
  const fraction = flags.fraction === undefined ? undefined : Number(flags.fraction);
  if (fraction !== undefined && !(fraction > 0 && fraction <= 1)) throw new Error("--fraction must be in (0, 1]");
  const play = await playClient();
  const editId = await play.openEdit();
  try {
    const source = await play.call("GET", `${PLAY_API}/edits/${editId}/tracks/${from}`, null, `Read ${from}`);
    const tested = (source.releases || []).some((r) => (r.versionCodes || []).includes(code));
    if (!tested) throw new Error(`Code ${code} is not on the ${from} track; promote only a tested code.`);
    const staged = fraction !== undefined && fraction < 1;
    await play.call("PUT", `${PLAY_API}/edits/${editId}/tracks/${track}`, {
      track,
      releases: [{
        versionCodes: [code],
        status: staged ? "inProgress" : "completed",
        ...(staged ? { userFraction: fraction } : {}),
        releaseNotes: releaseNotes(flags.notes),
      }],
    }, `Set ${track} track`);
    await play.call("POST", `${PLAY_API}/edits/${editId}:commit`, null, "Commit edit");
    console.log(JSON.stringify({ promoted: true, versionCode: code, track, userFraction: staged ? fraction : 1 }, null, 2));
  } catch (error) {
    await play.deleteEdit(editId);
    throw error;
  }
};

// ---------- App Store Connect ----------

const ascToken = () => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }));
  const signature = crypto.sign("SHA256", Buffer.from(`${header}.${claims}`), {
    key: fs.readFileSync(ASC_KEY_FILE, "utf8"),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${header}.${claims}.${signature}`;
};

const ascCall = async (method, pathAndQuery, body, label) => readJson(await fetch(`${ASC_API}${pathAndQuery}`, {
  method,
  headers: { Authorization: `Bearer ${ascToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), label);

const ascApp = async () => {
  const { data = [] } = await ascCall("GET", `/v1/apps?filter[bundleId]=${PACKAGE}`, null, "Find app");
  if (!data[0]) throw new Error(`No App Store Connect app for ${PACKAGE}`);
  return data[0];
};

const ascVersions = async (appId) => (await ascCall(
  "GET",
  `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`,
  null,
  "List versions",
)).data || [];

const ascBuild = async (appId, version, build) => {
  const { data = [] } = await ascCall(
    "GET",
    `/v1/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=1`,
    null,
    "Find build",
  );
  return data[0];
};

const ascStatus = async (flags) => {
  const app = await ascApp();
  const versions = await ascVersions(app.id);
  const { data: builds = [] } = await ascCall("GET", `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5&include=preReleaseVersion`, null, "List builds");
  const { data: groups = [] } = await ascCall("GET", `/v1/apps/${app.id}/betaGroups?limit=20`, null, "List beta groups");
  console.log(JSON.stringify({
    appId: app.id,
    versions: versions.map((v) => ({ version: v.attributes.versionString, state: v.attributes.appStoreState || v.attributes.appVersionState })),
    recentBuilds: builds.map((b) => ({ build: b.attributes.version, state: b.attributes.processingState, uploaded: b.attributes.uploadedDate, expired: b.attributes.expired })),
    betaGroups: groups.map((g) => ({ name: g.attributes.name, internal: g.attributes.isInternalGroup, allBuilds: g.attributes.hasAccessToAllBuilds })),
    ...(typeof flags.version === "string" ? { checked: flags.version } : {}),
  }, null, 2));
};

const ascPrepare = async (flags) => {
  const version = requireFlag(flags, "version");
  const buildNumber = requireFlag(flags, "build");
  const app = await ascApp();
  const build = await ascBuild(app.id, version, buildNumber);
  if (!build) throw new Error(`Build ${version} (${buildNumber}) not found yet.`);
  if (build.attributes.processingState !== "VALID") throw new Error(`Build is ${build.attributes.processingState}; wait for VALID.`);
  let target = (await ascVersions(app.id)).find((v) => v.attributes.versionString === version);
  if (!target) {
    target = (await ascCall("POST", "/v1/appStoreVersions", {
      data: {
        type: "appStoreVersions",
        attributes: { platform: "IOS", versionString: version, releaseType: "AFTER_APPROVAL" },
        relationships: { app: { data: { type: "apps", id: app.id } } },
      },
    }, "Create version")).data;
  }
  await ascCall("PATCH", `/v1/appStoreVersions/${target.id}/relationships/build`, { data: { type: "builds", id: build.id } }, "Attach build");
  if (typeof flags.notes === "string" && flags.notes) {
    const { data: locs = [] } = await ascCall("GET", `/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations`, null, "List localizations");
    for (const loc of locs) {
      await ascCall("PATCH", `/v1/appStoreVersionLocalizations/${loc.id}`, {
        data: { type: "appStoreVersionLocalizations", id: loc.id, attributes: { whatsNew: flags.notes } },
      }, `Set What's New (${loc.attributes.locale})`);
    }
  }
  console.log(JSON.stringify({ prepared: true, version, build: buildNumber, versionId: target.id, state: target.attributes.appStoreState }, null, 2));
};

// Makes sure an internal TestFlight group with access to every build exists and holds every App Store Connect
// user (emails come from Apple's own user list, never typed here).
const ascTestFlight = async () => {
  const app = await ascApp();
  const { data: groups = [] } = await ascCall("GET", `/v1/apps/${app.id}/betaGroups?limit=20`, null, "List beta groups");
  let group = groups.find((g) => g.attributes.isInternalGroup);
  if (!group) {
    group = (await ascCall("POST", "/v1/betaGroups", {
      data: {
        type: "betaGroups",
        attributes: { name: "Team", isInternalGroup: true, hasAccessToAllBuilds: true },
        relationships: { app: { data: { type: "apps", id: app.id } } },
      },
    }, "Create internal group")).data;
  }
  const { data: users = [] } = await ascCall("GET", "/v1/users?limit=50", null, "List users");
  const { data: members = [] } = await ascCall("GET", `/v1/betaGroups/${group.id}/betaTesters?limit=200`, null, "List group testers");
  const memberEmails = new Set(members.map((m) => String(m.attributes.email || "").toLowerCase()));
  let added = 0;
  for (const user of users) {
    const email = String(user.attributes.username || "");
    if (!email || memberEmails.has(email.toLowerCase())) continue;
    await ascCall("POST", "/v1/betaTesters", {
      data: {
        type: "betaTesters",
        attributes: { email, firstName: user.attributes.firstName, lastName: user.attributes.lastName },
        relationships: { betaGroups: { data: [{ type: "betaGroups", id: group.id }] } },
      },
    }, "Add tester");
    added += 1;
  }
  console.log(JSON.stringify({ group: group.attributes.name, allBuilds: group.attributes.hasAccessToAllBuilds, testers: members.length + added, added }, null, 2));
};

const ascSubmit = async (flags) => {
  const version = requireFlag(flags, "version");
  const app = await ascApp();
  const target = (await ascVersions(app.id)).find((v) => v.attributes.versionString === version);
  if (!target) throw new Error(`No version ${version}; run asc-prepare first.`);
  const submission = (await ascCall("POST", "/v1/reviewSubmissions", {
    data: { type: "reviewSubmissions", attributes: { platform: "IOS" }, relationships: { app: { data: { type: "apps", id: app.id } } } },
  }, "Create review submission")).data;
  await ascCall("POST", "/v1/reviewSubmissionItems", {
    data: {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
        appStoreVersion: { data: { type: "appStoreVersions", id: target.id } },
      },
    },
  }, "Add version to submission");
  await ascCall("PATCH", `/v1/reviewSubmissions/${submission.id}`, {
    data: { type: "reviewSubmissions", id: submission.id, attributes: { submitted: true } },
  }, "Submit for review");
  console.log(JSON.stringify({ submitted: true, version, submissionId: submission.id }, null, 2));
};

const main = async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, file] = positional;
  switch (command) {
    case "play-status": return playStatus();
    case "play-upload": return playUpload(file, flags);
    case "play-release": return playRelease(flags);
    case "play-promote": return playPromote(flags);
    case "asc-testflight": return ascTestFlight(flags);
    case "asc-status": return ascStatus(flags);
    case "asc-prepare": return ascPrepare(flags);
    case "asc-submit": return ascSubmit(flags);
    default:
      throw new Error("Commands: play-status, play-upload, play-promote, asc-status, asc-prepare, asc-submit");
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
