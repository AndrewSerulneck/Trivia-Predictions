import { readFileSync } from "node:fs";
import { join } from "node:path";
import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { JOIN_QR_FILES, JOIN_QR_PNG_MIN_PX, JOIN_QR_URL } from "@/lib/joinQr";

// docs/join-merch-store-plan.md: the free-download QR in the store, and the
// code printed on Join Merch. Decodes the committed files so a URL change in
// lib/joinQr.ts without `npm run store:qr` (or a hand-edited file) fails here.

const publicFile = (src: string) => join(process.cwd(), "public", src);

const decode = async (src: string): Promise<string | null> => {
  const { data, info } = await sharp(readFileSync(publicFile(src)))
    .flatten({ background: "#ffffff" })
    .resize(512, 512, { kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
};

describe("join QR code", () => {
  it("points at play.hightopchallenge.com — printed merch can never be updated", () => {
    expect(JOIN_QR_URL).toBe("https://play.hightopchallenge.com");
  });

  it.each(["png", "svg"] as const)("the committed %s decodes to JOIN_QR_URL", async (kind) => {
    expect(await decode(JOIN_QR_FILES[kind].src)).toBe(JOIN_QR_URL);
  });

  it("the PNG is square and print-sized", async () => {
    const { width, height } = await sharp(publicFile(JOIN_QR_FILES.png.src)).metadata();
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(JOIN_QR_PNG_MIN_PX);
  });

  it("download names match the files", () => {
    for (const file of Object.values(JOIN_QR_FILES)) {
      expect(file.src.endsWith(`/${file.download}`)).toBe(true);
    }
  });
});
