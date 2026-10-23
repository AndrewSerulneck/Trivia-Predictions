import { readFileSync } from "node:fs";
import { join } from "node:path";
import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { APP_DOWNLOAD_URL } from "@/lib/appDownloadLink";
import { buildShareDesignSpec, STORY_SHARE_SIZE_ORDER, type StoryShareDesign } from "@/lib/socialShare/shareDesigns";
import {
  SHARE_QR_MODULES,
  SHARE_QR_PX_PER_MODULE,
  SHARE_QR_SRC,
  SHARE_QR_VALUE,
} from "@/lib/socialShare/shareQr";
import { buildLiveTriviaStorySharePayload, buildPrizeStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";

// docs/native-app-store-plan.md Phase 9a/9b: every share picture's QR is the permanent
// `hightopchallenge.com/app` link. A posted Story can't be updated, so the committed file is
// decoded here and must equal the one constant; every design must draw that file.

const decode = async (): Promise<string | null> => {
  const { data, info } = await sharp(readFileSync(join(process.cwd(), "public", SHARE_QR_SRC)))
    .flatten({ background: "#ffffff" })
    .resize(512, 512, { kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
};

const DESIGNS: StoryShareDesign[] = ["spotlight", "card", "night", "selfie"];

describe("share card QR", () => {
  it("encodes the app download link — the one constant", () => {
    expect(SHARE_QR_VALUE).toBe(APP_DOWNLOAD_URL);
    expect(APP_DOWNLOAD_URL).toBe("https://hightopchallenge.com/app");
  });

  it("the committed file decodes to APP_DOWNLOAD_URL (run `npm run share:qr` after a change)", async () => {
    expect(await decode()).toBe(APP_DOWNLOAD_URL);
  });

  it("the file is square, whole pixels per module", async () => {
    const { width, height } = await sharp(join(process.cwd(), "public", SHARE_QR_SRC)).metadata();
    expect(width).toBe(height);
    expect(width).toBe(SHARE_QR_MODULES * SHARE_QR_PX_PER_MODULE);
  });

  it("every design at every size draws that QR, unsmoothed, and nothing else encodes a link", () => {
    const payloads = [
      buildLiveTriviaStorySharePayload({ venueId: "v1", venueName: "The Pour House", userId: "u1", username: "ace", finalRank: 1 }),
      buildPrizeStorySharePayload({
        venueId: "v1",
        venueName: "The Pour House",
        userId: "u1",
        username: "ace",
        prize: { headline: "$15", headlineKind: "amount", label: "GIFT CARD" },
      }),
    ];
    for (const payload of payloads) {
      for (const size of STORY_SHARE_SIZE_ORDER) {
        const prepared = prepareStorySharePayload(payload, { size });
        for (const design of DESIGNS) {
          const images = buildShareDesignSpec(prepared, design, size).images ?? [];
          const qr = images.filter((image) => image.src === SHARE_QR_SRC);
          expect(qr, `${design} ${size}`).toHaveLength(1);
          expect(qr[0].smoothing).toBe(false);
          expect(qr[0].width % SHARE_QR_MODULES, `${design} ${size}: whole px per module`).toBe(0);
        }
      }
    }
  });
});
