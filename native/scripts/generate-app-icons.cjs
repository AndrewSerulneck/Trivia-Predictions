// Generates the native app's icons and launch screens from the brand logo
// (docs/native-app-store-plan.md Phase 3). Re-run after the logo changes, then
// `npx cap sync` and rebuild:
//   cd native && node scripts/generate-app-icons.cjs
//
// Uses the repo root's `sharp` (already a dependency for scripts/generate-pwa-icons.cjs)
// instead of @capacitor/assets, whose bundled sharp 0.32 needs install scripts this
// machine's npm blocks. The source logo is read, never written: public/brand/ files
// are served (and /brand/web/ is cached for a year), so nothing under public/ changes.
// Every file written here lives inside the native projects and ships in the app bundle.

const path = require("node:path");
const fs = require("node:fs");
const sharp = require(require.resolve("sharp", { paths: [path.join(__dirname, "..", "..")] }));

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "..", "public", "brand", "htc-logo.png");
// The site's dark navy (#020617) — app/layout.tsx themeColor, the status bar, the web view.
const NAVY = { r: 2, g: 6, b: 23, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const IOS_ASSETS = path.join(ROOT, "ios", "App", "App", "Assets.xcassets");
const ANDROID_RES = path.join(ROOT, "android", "app", "src", "main", "res");

const logoAt = (size) => sharp(SOURCE).resize(size, size, { fit: "contain", background: CLEAR }).png().toBuffer();

/** `logoFraction` of the shorter side, centred on `background`. */
const canvas = async (width, height, logoFraction, background) => {
  const logoSize = Math.round(Math.min(width, height) * logoFraction);
  return sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: await logoAt(logoSize), gravity: "center" }])
    .png({ compressionLevel: 9 });
};

const write = async (image, file, { opaque = false } = {}) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // The App Store rejects an app icon with an alpha channel.
  const out = opaque ? image.flatten({ background: NAVY }).removeAlpha() : image;
  await out.toFile(file);
  console.log("wrote", path.relative(ROOT, file));
};

const roundMask = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);

const main = async () => {
  // iOS: one 1024 opaque icon (Xcode derives every size); the system rounds the corners.
  await write(await canvas(1024, 1024, 0.9, NAVY), path.join(IOS_ASSETS, "AppIcon.appiconset", "AppIcon-512@2x.png"), {
    opaque: true,
  });
  // iOS launch screen: LaunchScreen.storyboard aspect-fills the "Splash" image, so a
  // square canvas with a modest logo stays centred and uncropped on every phone.
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    await write(await canvas(2732, 2732, 0.3, NAVY), path.join(IOS_ASSETS, "Splash.imageset", name), { opaque: true });
  }

  // Android legacy icons (pre-8.0) and the round variant.
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [density, scale] of Object.entries(densities)) {
    const icon = Math.round(48 * scale);
    const dir = path.join(ANDROID_RES, `mipmap-${density}`);
    await write(await canvas(icon, icon, 0.9, NAVY), path.join(dir, "ic_launcher.png"), { opaque: true });
    const round = await (await canvas(icon, icon, 0.9, NAVY)).toBuffer();
    await write(
      sharp(round).composite([{ input: roundMask(icon), blend: "dest-in" }]).png(),
      path.join(dir, "ic_launcher_round.png"),
    );
    // Adaptive icon foreground (8.0+): 108dp canvas, the launcher masks it to ~66%,
    // so the logo sits inside the middle 61% and is never clipped.
    const foreground = Math.round(108 * scale);
    await write(await canvas(foreground, foreground, 0.61, CLEAR), path.join(dir, "ic_launcher_foreground.png"));
  }

  // Android launch images for pre-12 phones (Theme.SplashScreen's android:background).
  const splashes = {
    drawable: [480, 320],
    "drawable-port-mdpi": [320, 480],
    "drawable-port-hdpi": [480, 800],
    "drawable-port-xhdpi": [720, 1280],
    "drawable-port-xxhdpi": [960, 1600],
    "drawable-port-xxxhdpi": [1280, 1920],
    "drawable-land-mdpi": [480, 320],
    "drawable-land-hdpi": [800, 480],
    "drawable-land-xhdpi": [1280, 720],
    "drawable-land-xxhdpi": [1600, 960],
    "drawable-land-xxxhdpi": [1920, 1280],
  };
  for (const [dir, [width, height]] of Object.entries(splashes)) {
    await write(await canvas(width, height, 0.5, NAVY), path.join(ANDROID_RES, dir, "splash.png"), { opaque: true });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
