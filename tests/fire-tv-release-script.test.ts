import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// docs/fire-tv-app-plan.md Phase CR2.2 (F55–F63): `npm run fire-tv:release` runs here in a child process with
// `fetch` and `execFileSync` mocked (tests/helpers/fire-tv-release-preload.cjs), against a copy of the script in a
// temp "repo" and a temp HOME. Nothing touches Amazon, Gradle or a real key.
//
// FIRE_TV_RELEASE_SCRIPT / FIRE_TV_KEY_SCRIPT point the tests at another copy of the scripts (used to prove each test
// fails against the old code).

const repoRoot = process.cwd();
const releaseScript = process.env.FIRE_TV_RELEASE_SCRIPT ?? path.join(repoRoot, "native-tv/scripts/release.cjs");
const keyScript = process.env.FIRE_TV_KEY_SCRIPT ?? path.join(repoRoot, "native-tv/scripts/create-upload-key.cjs");
const preload = path.join(repoRoot, "tests/helpers/fire-tv-release-preload.cjs");

const SECRET = "SENTINEL-SECRET-9f3a";
const TOKEN = "SENTINEL-TOKEN";
const GRADLE_FIXTURE = 'android {\r\n  defaultConfig {\r\n    versionCode = 1\r\n    versionName = "1.0.0"\r\n  }\r\n}\r\n// é\r\n';
const RELEASES = "Library/Application Support/Hightop Challenge/releases/fire-tv";

const tmpDirs: string[] = [];
afterAll(() => tmpDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

type Mock = {
  routes?: Record<string, { status?: number; body?: unknown; etag?: string; hang?: boolean }>;
  gradleFails?: boolean;
  cert?: string;
};
type LogEntry = {
  kind: string;
  method?: string;
  route?: string;
  amazonKeys?: string[];
  hasJavaHome?: boolean;
  versionCode?: number;
};

const setup = (mock: Mock = {}, savedApks: string[] = []) => {
  const home = mkdtempSync(path.join(os.tmpdir(), "fire-tv-release-"));
  tmpDirs.push(home);
  const scripts = path.join(home, "native-tv/scripts");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(path.join(home, "native-tv/app"), { recursive: true });
  copyFileSync(releaseScript, path.join(scripts, "release.cjs"));
  const gradleFile = path.join(home, "native-tv/app/build.gradle.kts");
  writeFileSync(gradleFile, GRADLE_FIXTURE);
  mkdirSync(path.join(home, RELEASES), { recursive: true });
  savedApks.forEach((name) => writeFileSync(path.join(home, RELEASES, name), "old"));
  const logFile = path.join(home, "mock.log");
  writeFileSync(logFile, "");
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    AMAZON_APPSTORE_CLIENT_ID: "client-id",
    AMAZON_APPSTORE_CLIENT_SECRET: SECRET,
    RELEASE_MOCK: JSON.stringify(mock),
    RELEASE_MOCK_LOG: logFile,
    NODE_ENV: "test",
  } satisfies NodeJS.ProcessEnv;
  const argsFor = (extra: string[]) => ["--require", preload, path.join(scripts, "release.cjs"), ...extra];
  const calls = (): LogEntry[] =>
    readFileSync(logFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEntry);
  const result = (status: number | null, output: string) => {
    const all = calls();
    return {
      status,
      output,
      gradle: readFileSync(gradleFile, "utf8"),
      calls: all,
      fetches: all.filter((c) => c.kind === "fetch").map((c) => `${c.method} ${c.route}`),
      saved: readdirSync(path.join(home, RELEASES)).filter((f) => f.endsWith(".apk") && !savedApks.includes(f)),
      lockLeft: existsSync(path.join(home, RELEASES, ".release.lock")),
    };
  };
  const run = (extra: string[] = []) => {
    const out = spawnSync(process.execPath, argsFor(extra), { env, encoding: "utf8", cwd: home, timeout: 20000 });
    return result(out.status, `${out.stdout}${out.stderr}`);
  };
  return { home, env, argsFor, run, result, releasesDir: path.join(home, RELEASES) };
};

type Result = ReturnType<ReturnType<typeof setup>["run"]>;

const expectUntouched = (r: Result) => {
  expect(r.status).toBe(1);
  expect(r.gradle).toBe(GRADLE_FIXTURE);
  expect(r.lockLeft).toBe(false);
  expect(r.output).not.toContain(SECRET);
  expect(r.output).not.toContain(TOKEN);
};

describe("fire-tv:release — happy path", () => {
  it("bumps, builds, uploads, commits, prints the commit line, and keeps Amazon's secret away from Gradle", () => {
    const r = setup().run();
    expect(r.output).not.toContain(SECRET);
    expect(r.output).not.toContain(TOKEN);
    expect(r.status).toBe(0);
    expect(r.gradle).toContain("versionCode = 2");
    expect(r.gradle).toContain('versionName = "1.0.1"');
    expect(r.fetches).toEqual([
      "POST token",
      "GET /edits",
      "POST /edits",
      "GET /edits/E1/apks",
      "GET /edits/E1/apks/A1",
      "PUT /edits/E1/apks/A1/replace",
      "POST /edits/E1/validate",
      "GET /edits/E1",
      "POST /edits/E1/commit",
    ]);
    expect(r.saved).toEqual(["hightop-challenge-tv-1.0.1-vc2.apk"]);
    expect(r.output).toContain('git add native-tv/app/build.gradle.kts && git commit -m "Fire TV 1.0.1 (vc2)"');
    const children = r.calls.filter((c) => c.kind === "gradle" || c.kind === "apksigner");
    expect(children.map((c) => c.kind)).toEqual(["gradle", "apksigner"]);
    children.forEach((c) => {
      expect(c.amazonKeys).toEqual([]);
      expect(c.hasJavaHome).toBe(true);
    });
    expect(r.lockLeft).toBe(false);
  });

  it("never reuses a code: the releases folder's highest vcN wins over the local file (F57)", () => {
    const r = setup({}, ["hightop-challenge-tv-1.0.5-vc7.apk"]).run();
    expect(r.status).toBe(0);
    expect(r.gradle).toContain("versionCode = 8");
    expect(r.calls.find((c) => c.kind === "gradle")?.versionCode).toBe(8);
  });
});

describe("fire-tv:release — every failure undoes the bump and the open edit (F55, F56)", () => {
  it("wrong signing certificate", () => {
    const r = setup({ cert: "00".repeat(32) }).run();
    expectUntouched(r);
    expect(r.output).toContain("unexpected certificate");
    expect(r.fetches).toContain("DELETE /edits/E1");
    expect(r.fetches).not.toContain("PUT /edits/E1/apks/A1/replace");
  });

  it("Gradle failure", () => {
    const r = setup({ gradleFails: true }).run();
    expectUntouched(r);
    expect(r.fetches).toContain("DELETE /edits/E1");
  });

  it("upload fails with a 500", () => {
    const r = setup({ routes: { "PUT /edits/E1/apks/A1/replace": { status: 500, body: { message: "boom" } } } }).run();
    expectUntouched(r);
    expect(r.fetches).toContain("DELETE /edits/E1");
    expect(r.fetches).not.toContain("POST /edits/E1/commit");
  });

  it("validate lists errors (F59)", () => {
    const r = setup({
      routes: { "POST /edits/E1/validate": { body: { errors: [{ errorCode: "bad", errorMessage: "No" }] } } },
    }).run();
    expectUntouched(r);
    expect(r.output).toContain("validation failed");
    expect(r.fetches).toContain("DELETE /edits/E1");
    expect(r.fetches).not.toContain("POST /edits/E1/commit");
  });

  it("commit fails", () => {
    const r = setup({ routes: { "POST /edits/E1/commit": { status: 500, body: { message: "no" } } } }).run();
    expectUntouched(r);
    expect(r.fetches).toContain("DELETE /edits/E1");
  });

  it("deleting the edit fails too: still restores the file and says to use the console", () => {
    const r = setup({ cert: "00".repeat(32), routes: { "DELETE /edits/E1": { status: 500, body: { message: "no" } } } }).run();
    expectUntouched(r);
    expect(r.output).toContain("Delete it in the Amazon console");
  });

  it("Ctrl-C during the upload undoes everything", async () => {
    const s = setup({ routes: { "PUT /edits/E1/apks/A1/replace": { hang: true } } });
    const child = spawn(process.execPath, s.argsFor([]), { env: s.env, cwd: s.home });
    let output = "";
    let interrupted = false;
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (!interrupted && output.includes("Uploading APK")) {
        interrupted = true;
        setTimeout(() => child.kill("SIGINT"), 200);
      }
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    const r = s.result(code, output);
    expect(interrupted).toBe(true);
    expect(r.status).toBe(130);
    expect(r.gradle).toBe(GRADLE_FIXTURE);
    expect(r.fetches).toContain("DELETE /edits/E1");
    expect(r.lockLeft).toBe(false);
    expect(r.output).not.toContain(SECRET);
  }, 30000);
});

describe("fire-tv:release — stops before changing anything when Amazon's state is unclear (F57, F58)", () => {
  it("GET /edits returns an array", () => {
    const r = setup({ routes: { "GET /edits": { body: [] } } }).run();
    expectUntouched(r);
    expect(r.output).toContain("unexpected answer");
    expect(r.fetches).not.toContain("POST /edits");
    expect(r.calls.some((c) => c.kind === "gradle")).toBe(false);
  });

  it("GET /edits returns an object without an id", () => {
    const r = setup({ routes: { "GET /edits": { body: { edits: [{ id: "x" }] } } } }).run();
    expectUntouched(r);
    expect(r.fetches).not.toContain("POST /edits");
  });

  it("an edit is already open", () => {
    const r = setup({ routes: { "GET /edits": { body: { id: "E9", status: "IN_REVIEW" } } } }).run();
    expectUntouched(r);
    expect(r.output).toContain("already open");
    expect(r.fetches).not.toContain("POST /edits");
  });

  it("GET /edits answers 404: no edit", () => {
    const r = setup({ routes: { "GET /edits": { status: 404, body: { message: "none" } } } }).run();
    expect(r.status).toBe(0);
  });

  it("Amazon's live version code is not below the next one", () => {
    const r = setup({ routes: { "GET /edits/E1/apks/A1": { body: { id: "A1", versionCode: 2 }, etag: "x" } } }).run();
    expectUntouched(r);
    expect(r.output).toContain("out of date");
    expect(r.fetches).toContain("DELETE /edits/E1");
    expect(r.fetches).not.toContain("PUT /edits/E1/apks/A1/replace");
    expect(r.calls.some((c) => c.kind === "gradle")).toBe(false);
  });

  it("another release is running", () => {
    const s = setup();
    writeFileSync(path.join(s.releasesDir, ".release.lock"), String(process.pid));
    const r = s.run();
    expect(r.status).toBe(1);
    expect(r.gradle).toBe(GRADLE_FIXTURE);
    expect(r.output).toContain("Another Fire TV release is running");
    expect(r.fetches).toEqual([]);
    expect(r.lockLeft).toBe(true); // not ours: left alone
  });

  it("a lock left by a dead process is replaced", () => {
    const s = setup();
    writeFileSync(path.join(s.releasesDir, ".release.lock"), "999999999");
    expect(s.run().status).toBe(0);
  });
});

describe("fire-tv:release --dry-run", () => {
  it("builds and reverts: no edit, no upload, no saved APK", () => {
    const r = setup().run(["--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.gradle).toBe(GRADLE_FIXTURE);
    expect(r.fetches).toEqual(["POST token", "GET /edits"]);
    expect(r.saved).toEqual([]);
    expect(r.calls.some((c) => c.kind === "gradle")).toBe(true);
    expect(r.lockLeft).toBe(false);
  });
});

describe("create-upload-key.cjs (F62)", () => {
  it("removes the credentials file when keytool fails, so the re-run isn't refused", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "fire-tv-key-"));
    tmpDirs.push(home);
    const java = path.join(home, "fakejava/bin");
    mkdirSync(java, { recursive: true });
    writeFileSync(path.join(java, "keytool"), "#!/bin/sh\nexit 1\n");
    chmodSync(path.join(java, "keytool"), 0o755);
    const out = spawnSync(process.execPath, [keyScript], {
      env: { PATH: process.env.PATH ?? "", HOME: home, JAVA_HOME: path.join(home, "fakejava"), NODE_ENV: "test" },
      encoding: "utf8",
    });
    const signing = path.join(home, "Library/Application Support/Hightop Challenge/signing");
    expect(out.status).toBe(1);
    expect(existsSync(path.join(signing, "fire-tv-upload-credentials.json"))).toBe(false);
    expect(existsSync(path.join(signing, "fire-tv-upload.p12"))).toBe(false);
  });
});

describe("app/build.gradle.kts (F63)", () => {
  it("stops release APK and bundle tasks when the upload key is missing; debug and lint stay free", () => {
    const gradle = readFileSync(path.join(repoRoot, "native-tv/app/build.gradle.kts"), "utf8");
    expect(gradle).toMatch(/gradle\.taskGraph\.whenReady/);
    expect(gradle).toMatch(/"assembleRelease", "bundleRelease", "packageRelease"/);
    expect(gradle).toMatch(/needsKey && uploadSecrets == null/);
    expect(gradle).toMatch(/throw GradleException\(/);
    expect(gradle).not.toMatch(/"lintRelease"|"assembleDebug"/);
  });
});
