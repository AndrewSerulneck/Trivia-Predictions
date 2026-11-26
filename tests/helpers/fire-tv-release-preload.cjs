// Preloaded (node --require) by tests/fire-tv-release-script.test.ts. Replaces `fetch` and child_process.execFileSync
// so native-tv/scripts/release.cjs runs end to end without touching Amazon, Gradle or any key.
// Scenario comes from RELEASE_MOCK (JSON); every call is appended to RELEASE_MOCK_LOG (one JSON object per line).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const config = JSON.parse(process.env.RELEASE_MOCK || "{}");
const record = (entry) => fs.appendFileSync(process.env.RELEASE_MOCK_LOG, `${JSON.stringify(entry)}\n`);
const CERT = "8122da95844a42c11090e00efa2f73a81d82402d23b0039f32f30a90800baa01";
const API_PREFIX = "https://developer.amazon.com/api/appstore/v1/applications/";

const routes = {
  "POST token": { body: { access_token: "SENTINEL-TOKEN" } },
  "GET /edits": { body: {} },
  "POST /edits": { body: { id: "E1", status: "IN_PROGRESS" }, etag: "e0" },
  "GET /edits/E1/apks": { body: [{ id: "A1" }] },
  "GET /edits/E1/apks/A1": { body: { id: "A1", versionCode: 1 }, etag: "apk-etag" },
  "PUT /edits/E1/apks/A1/replace": { body: {} },
  "POST /edits/E1/validate": { body: {} },
  "GET /edits/E1": { body: { id: "E1" }, etag: "e1" },
  "POST /edits/E1/commit": { body: {} },
  "DELETE /edits/E1": { status: 204, body: null },
  ...(config.routes || {}),
};

globalThis.fetch = async (url, init = {}) => {
  const method = init.method || "GET";
  const isToken = String(url).startsWith("https://api.amazon.com/auth/o2/token");
  const route = isToken ? "token" : String(url).slice(API_PREFIX.length).replace(/^[^/]*/, "");
  const key = isToken ? "POST token" : `${method} ${route}`;
  record({ kind: "fetch", method, route: isToken ? "token" : route, ifMatch: init.headers?.["if-match"] ?? null });
  const hit = routes[key];
  if (!hit) return new Response(JSON.stringify({ message: `unmocked ${key}` }), { status: 599 });
  // A real socket keeps Node alive; a bare pending promise would let it exit.
  if (hit.hang) return new Promise(() => setInterval(() => {}, 1000));
  const headers = hit.etag ? { etag: hit.etag } : {};
  const body = hit.body === null || hit.body === undefined ? null : JSON.stringify(hit.body);
  return new Response(body, { status: hit.status ?? 200, headers });
};

const envReport = (env) => ({ hasJavaHome: Boolean(env?.JAVA_HOME), amazonKeys: Object.keys(env || {}).filter((k) => k.startsWith("AMAZON_")) });

const realExecFileSync = childProcess.execFileSync;
childProcess.execFileSync = (file, argv, options = {}) => {
  if (file === "./gradlew") {
    const gradle = fs.readFileSync(path.join(options.cwd, "app/build.gradle.kts"), "utf8");
    record({ kind: "gradle", ...envReport(options.env), versionCode: Number(/versionCode = (\d+)/.exec(gradle)?.[1]) });
    if (config.gradleFails) throw new Error("gradle exploded");
    const apk = path.join(os.homedir(), "Library/Caches/hightop-native-tv/app/outputs/apk/release/app-release.apk");
    fs.mkdirSync(path.dirname(apk), { recursive: true });
    fs.writeFileSync(apk, "apk-bytes");
    return "";
  }
  if (String(file).endsWith("apksigner")) {
    record({ kind: "apksigner", ...envReport(options.env) });
    return `Signer #1 certificate SHA-256 digest: ${config.cert || CERT}\n`;
  }
  return realExecFileSync(file, argv, options);
};
