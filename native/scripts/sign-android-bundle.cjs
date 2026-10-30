#!/usr/bin/env node
// Signs an already-built release AAB. Secrets stay outside the repository and logs.
// First use only: node native/scripts/sign-android-bundle.cjs --create-upload-key INPUT.aab OUTPUT.aab
// Later releases: node native/scripts/sign-android-bundle.cjs INPUT.aab OUTPUT.aab
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const javaBin = path.join(process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21', 'bin');
const directory = path.join(os.homedir(), 'Library/Application Support/Hightop Challenge/signing');
const keystore = path.join(directory, 'android-upload.p12');
const credentialsFile = path.join(directory, 'android-upload-credentials.json');
const certificate = path.join(directory, 'android-upload-certificate.pem');
const args = process.argv.slice(2);
const create = args[0] === '--create-upload-key';
if (create) args.shift();

function run(tool, toolArgs, credentials) {
  return execFileSync(path.join(javaBin, tool), toolArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HIGHTOP_UPLOAD_STORE_PASSWORD: credentials.storePassword,
      HIGHTOP_UPLOAD_KEY_PASSWORD: credentials.keyPassword,
    },
  });
}

function main() {
  if (args.length !== 2) throw new Error('Provide INPUT.aab and OUTPUT.aab; --create-upload-key is for first use only.');
  const input = path.resolve(args[0]);
  const output = path.resolve(args[1]);
  if (!fs.existsSync(input) || !input.endsWith('.aab')) throw new Error('Input AAB not found.');
  if (fs.existsSync(output)) throw new Error('Output already exists; choose another filename.');
  let credentials;
  if (create) {
    if (fs.existsSync(keystore) || fs.existsSync(credentialsFile)) throw new Error('Upload-key files already exist; refusing to replace them.');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const password = crypto.randomBytes(32).toString('base64url');
    credentials = { alias: 'hightop-upload', storeType: 'PKCS12', storePassword: password, keyPassword: password };
    // Restrictive permissions are in force before the key tool creates its file.
    process.umask(0o077);
    fs.writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    run('keytool', ['-genkeypair', '-noprompt', '-keystore', keystore, '-storetype', credentials.storeType,
      '-storepass:env', 'HIGHTOP_UPLOAD_STORE_PASSWORD', '-keypass:env', 'HIGHTOP_UPLOAD_KEY_PASSWORD',
      '-alias', credentials.alias, '-keyalg', 'RSA', '-keysize', '3072', '-sigalg', 'SHA256withRSA',
      '-validity', '10000', '-dname', 'CN=Hightop Challenge, O=Hightop Challenge LLC, C=US'], credentials);
    fs.chmodSync(keystore, 0o600);
  } else {
    if (!fs.existsSync(keystore) || !fs.existsSync(credentialsFile)) throw new Error('Existing upload key/credentials not found.');
    credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  }
  if (!fs.existsSync(certificate)) {
    run('keytool', ['-exportcert', '-rfc', '-keystore', keystore, '-storetype', credentials.storeType,
      '-storepass:env', 'HIGHTOP_UPLOAD_STORE_PASSWORD', '-alias', credentials.alias, '-file', certificate], credentials);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  run('jarsigner', ['-keystore', keystore, '-storetype', credentials.storeType,
    '-storepass:env', 'HIGHTOP_UPLOAD_STORE_PASSWORD', '-keypass:env', 'HIGHTOP_UPLOAD_KEY_PASSWORD',
    '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', '-signedjar', output, input, credentials.alias], credentials);
  const verification = run('jarsigner', ['-verify', output], credentials);
  if (!verification.includes('jar verified.') || /unsigned entries|jar is unsigned|disabled algorithm/i.test(verification)) {
    throw new Error('Bundle signature verification failed.');
  }
  const certPem = fs.readFileSync(certificate, 'utf8');
  const cert = new crypto.X509Certificate(certPem);
  const certificateDetails = run('keytool', ['-list', '-v', '-keystore', keystore, '-storetype', credentials.storeType,
    '-storepass:env', 'HIGHTOP_UPLOAD_STORE_PASSWORD', '-alias', credentials.alias], credentials);
  if (!certificateDetails.includes(cert.fingerprint256)) throw new Error('Exported public certificate does not match keystore.');
  fs.chmodSync(output, 0o644);
  console.log(JSON.stringify({ output, bytes: fs.statSync(output).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
    signatureVerified: true, uploadCertificateSha256: cert.fingerprint256,
    certificateValidTo: cert.validTo, keystore, credentialsFile, certificate,
    note: 'Back up keystore and credentials in your password manager. This is the upload certificate, not the Play app-signing certificate.' }, null, 2));
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
