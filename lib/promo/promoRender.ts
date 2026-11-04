import { loadCanvasFonts, renderStoryImage, resolveCanvasFont } from "@/lib/socialShare/storyCanvas";
import { buildPromoEndCardSpec, PROMO_END_CARD_FONTS, type PromoEndCardInput } from "@/lib/promo/promoEndCard";

// Browser-only: draws the Share to social end card (lib/promo/promoEndCard.ts) to a JPEG. Instagram's
// publishing API takes JPEG only (plan §4.3), so the Post/Story picture is JPEG from day one.
// Runs entirely on the partner's device: no server work, no cost (plan D6).

export const PROMO_JPEG_QUALITY = 0.92;

let measureContext: CanvasRenderingContext2D | null = null;

/** Real text widths for the end card (shared with the Reel so both lay out identically). */
export const measurePromoText = (text: string, font: string): number => {
  if (!measureContext) measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 30;
  measureContext.font = resolveCanvasFont(font);
  return measureContext.measureText(text).width;
};

/** The end card as a JPEG blob. Fonts are loaded first so text is measured in Nunito, not a fallback. */
export const renderPromoPicture = async (input: Omit<PromoEndCardInput, "measure">): Promise<Blob> => {
  await loadCanvasFonts(PROMO_END_CARD_FONTS.map(resolveCanvasFont));
  const spec = buildPromoEndCardSpec({ ...input, measure: measurePromoText });
  return renderStoryImage({ spec, outputType: "image/jpeg", quality: PROMO_JPEG_QUALITY });
};
