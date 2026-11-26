#!/usr/bin/env node
// Creates the Fire TV app's upload key ONCE (docs/fire-tv-app-plan.md Phase 6). Separate from the phone app's key.
//   node native-tv/scripts/create-upload-key.cjs
// Writes, outside the repo, folder 0700 and files 0600:
//   ~/Library/Application Support/Hightop Challenge/signing/fire-tv-upload.p12
//   ~/Library/Application Support/Hightop Challenge/signing/fire-tv-upload-credentials.json
//   ~/Library/Application Support/Hightop Challenge/signing/fire-tv-upload-certificate.pem   (public)
// Refuses to run if the key or credentials already exist: losing or replacing this key means the app can never be
// updated on the Amazon Appstore. Passwords travel only in child-process environment variables; nothing secret is
// printed. app/build.gradle.kts reads the credentials file to sign release builds.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const javaBin = path.join(process.env.JAVA_HOME || "/opt/homebrew/opt/openjdk@21", "bin");
const directory = path.join(os.homedir(), "Library/Application Support/Hightop Challenge/signing");
const keystore = path.join(directory, "fire-tv-upload.p12");
const credentialsFile = path.join(directory, "fire-tv-upload-credentials.json");
const certificate = path.join(directory, "fire-tv-upload-certificate.pem");

const run = (tool, toolArgs, credentials) =>
  execFileSync(path.join(javaBin, tool), toolArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HIGHTOP_TV_STORE_PASSWORD: credentials.storePassword,
      HIGHTOP_TV_KEY_PASSWORD: credentials.keyPassword,
    },
  });

const createKeystore = (credentials) =>
  run("keytool", [
    "-genkeypair", "-noprompt", "-keystore", keystore, "-storetype", credentials.storeType,
    "-storepass:env", "HIGHTOP_TV_STORE_PASSWORD", "-keypass:env", "HIGHTOP_TV_KEY_PASSWORD",
    "-alias", credentials.alias, "-keyalg", "RSA", "-keysize", "3072", "-sigalg", "SHA256withRSA",
    "-validity", "10000", "-dname", "CN=Hightop Challenge, O=Hightop Challenge LLC, C=US",
  ], credentials);

const main = () => {
  if (fs.existsSync(keystore) || fs.existsSync(credentialsFile)) {
    throw new Error("Fire TV upload key files already exist; refusing to replace them.");
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const password = crypto.randomBytes(32).toString("base64url");
  const credentials = { alias: "hightop-tv-upload", storeType: "PKCS12", storePassword: password, keyPassword: password };
  process.umask(0o077);
  fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  try {
    createKeystore(credentials);
  } catch (error) {
    // A half-made key must not block the re-run: no keystore means no key was made, so the credentials go too.
    if (!fs.existsSync(keystore)) fs.rmSync(credentialsFile, { force: true });
    throw error;
  }
  fs.chmodSync(keystore, 0o600);
  run("keytool", [
    "-exportcert", "-rfc", "-keystore", keystore, "-storetype", credentials.storeType,
    "-storepass:env", "HIGHTOP_TV_STORE_PASSWORD", "-alias", credentials.alias, "-file", certificate,
  ], credentials);
  fs.chmodSync(certificate, 0o600);
  const cert = new crypto.X509Certificate(fs.readFileSync(certificate, "utf8"));
  console.log(JSON.stringify({
    keystore, credentialsFile, certificate,
    alias: credentials.alias,
    uploadCertificateSha256: cert.fingerprint256,
    validTo: cert.validTo,
    note: "Back up the .p12 and the credentials .json in your password manager now.",
  }, null, 2));
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
