import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { BRAND_LOGO_DOWNLOAD, BRAND_LOGO_DOWNLOAD_MIN_PX, BRAND_LOGO_PREVIEW_SRC } from "@/lib/brandLogoDownload";

// docs/join-merch-store-plan.md: the free logo download in the store. Partners
// put it on menus, so it must be a large PNG with a see-through background.

const publicFile = (src: string) => join(process.cwd(), "public", src);

describe("free logo download", () => {
  it("is a large PNG with a transparent background", async () => {
    const image = sharp(readFileSync(publicFile(BRAND_LOGO_DOWNLOAD.src)));
    const meta = await image.metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeGreaterThanOrEqual(BRAND_LOGO_DOWNLOAD_MIN_PX);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Every corner pixel is fully transparent.
    for (const [x, y] of [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ]) {
      expect(data[(y * info.width + x) * info.channels + 3]).toBe(0);
    }
  });

  it("downloads under the file name it is served as", () => {
    expect(BRAND_LOGO_DOWNLOAD.src.endsWith(`/${BRAND_LOGO_DOWNLOAD.download}`)).toBe(true);
    expect(() => readFileSync(publicFile(BRAND_LOGO_PREVIEW_SRC))).not.toThrow();
  });
});
