import { AppDownloadQr } from "@/components/venue-screen/AppDownloadQr";
import { TvDesignFrame } from "@/components/venue-screen/TvSlideCanvas";

/* ------------------------------------------------------------------ *
 * The "Get the app" corner (docs/fire-tv-app-plan.md D16, Phase 11): one QR, one fixed place, the same size on every
 * screen that carries it. `AppDownloadQr`'s rules apply: it never moves, is never covered and never animates; nothing
 * here has motion at all. Drawn in the mockups' 1920×1080 design pixels (`TvAppDock`), or alone over a full canvas
 * (`TvAppCorner`).
 *
 * Where it goes: every carousel slide but "Get the app" (that one has a big QR), the Live Trivia pre-game (its step 1
 * is the QR), the Live Trivia round break and final standings. Never on a question, an answer reveal, a Category
 * Blitz round or the Connect screen. Category Blitz, Squares and Bracket get it in reserved phase R2 (D21).
 * ------------------------------------------------------------------ */

// AppDownloadQr's plate is the QR plus a 14% quiet zone on each side; this QR side makes the mockups' 210 plate.
const QR_SIDE_PX = 164;
const RIGHT_PX = 70;
const BOTTOM_PX = 130;
const BOTTOM_LOW_PX = 44;

/** The dock's test id: effects measure its box (`appDockClearArea`), so nothing falls over the QR (CR2.1 F52). */
export const TV_APP_DOCK_TEST_ID = "tv-app-dock";

/**
 * The part of the viewport above the dock, as an FX area: confetti falls in it and never reaches the QR (D16: never
 * covered). Measured from the dock itself, so letterboxing and the stage scale are already in it. Without a dock on
 * screen (or in a test) the whole viewport.
 */
export const appDockClearArea = (): { x: number; y: number; w: number; h: number } => {
  const whole = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const dock = document.querySelector(`[data-testid="${TV_APP_DOCK_TEST_ID}"]`);
  if (!dock) return whole;
  const top = dock.getBoundingClientRect().top;
  return top > 0 && top < whole.h ? { ...whole, h: top } : whole;
};

type TvAppDockProps = {
  /** Sits lower (44 px up), for screens with no dots or ticker. */
  low?: boolean;
};

export const TvAppDock = ({ low = false }: TvAppDockProps) => (
  <div
    data-testid={TV_APP_DOCK_TEST_ID}
    className="absolute flex items-center"
    style={{ right: RIGHT_PX, bottom: low ? BOTTOM_LOW_PX : BOTTOM_PX, gap: 26, zIndex: 3 }}
  >
    <div style={{ textAlign: "right", fontSize: 46, fontWeight: 900, lineHeight: 1.05, color: "#f8fafc" }}>
      Get the app
      <small style={{ display: "block", fontSize: 30, fontWeight: 700, color: "#94a3b8", marginTop: 8 }}>
        Scan to play
      </small>
    </div>
    <AppDownloadQr size={QR_SIDE_PX} caption={false} />
  </div>
);

/** The dock alone over a full canvas, for screens drawn at the stage's own size (Live Trivia). */
export const TvAppCorner = ({ low = false }: TvAppDockProps) => (
  <TvDesignFrame className="pointer-events-none">
    <TvAppDock low={low} />
  </TvDesignFrame>
);
