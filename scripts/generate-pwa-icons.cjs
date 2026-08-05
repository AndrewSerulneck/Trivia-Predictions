// Regenerates public/icons/* from the brand mark. Re-run after the source logo changes.
// Usage: node scripts/generate-pwa-icons.cjs
const path = require("node:path");
const sharp = require("sharp");

const SOURCE = path.join(__dirname, "..", "public", "brand", "htc-logo.png");
const OUT_DIR = path.join(__dirname, "..", "public", "icons");
// Matches app/layout.tsx's viewport.themeColor / the manifest's background_color.
const BACKGROUND = { r: 2, g: 6, b: 23, alpha: 1 };

// These are flat-background brand marks, not photographs — a 256-colour palette is
// lossless to the eye and cuts the 512px icons from ~300KB to a few tens of KB. Size
// matters here: Android fetches them at install time and again at every cold launch.
const PNG_OPTIONS = {
  compressionLevel: 9,
  effort: 10,
  palette: true,
  quality: 90,
};

const flattenOnBackground = (size) =>
  sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .png(PNG_OPTIONS)
    .toBuffer();

// Maskable icons must keep all content inside a centered safe-zone circle;
// insetting to ~80% of the canvas keeps the logo clear of that circle's edge.
const maskableOnBackground = async (size) => {
  const inner = Math.round(size * 0.8);
  const logo = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: BACKGROUND })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png(PNG_OPTIONS)
    .toBuffer();
};

const targets = [
  { file: "icon-192.png", build: () => flattenOnBackground(192) },
  { file: "icon-512.png", build: () => flattenOnBackground(512) },
  { file: "icon-512-maskable.png", build: () => maskableOnBackground(512) },
  { file: "apple-touch-icon.png", build: () => flattenOnBackground(180) },
];

const run = async () => {
  for (const target of targets) {
    const buffer = await target.build();
    // `toFile` re-encodes, so the options have to be restated here — without them this
    // step would silently undo the compression the builders just applied.
    await sharp(buffer).png(PNG_OPTIONS).toFile(path.join(OUT_DIR, target.file));
    console.log(`Wrote public/icons/${target.file}`);
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
