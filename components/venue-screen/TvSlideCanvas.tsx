import type { ReactNode } from "react";

// The carousel's board slides are drawn at the approved mockups' 1920×1080 and scaled up to the stage's
// 2304×1296 canvas (VenueScreenClient), so every size in them is the mockup's. Layout facts for Phase 11
// (design px, before the scale):
//   - the bottom 96 is the ticker and the dots sit at 120 from the bottom: slides keep 150 free below their content;
//   - the "Get the app" QR is bottom-right (right 70, bottom 130, plate 210): slides keep that corner empty.
export const TV_SLIDE_DESIGN_WIDTH = 1920;
export const TV_SLIDE_DESIGN_HEIGHT = 1080;
const STAGE_WIDTH = 2304;
export const TV_SLIDE_SCALE = STAGE_WIDTH / TV_SLIDE_DESIGN_WIDTH;

type TvSlideCanvasProps = {
  background: string;
  testId: string;
  children: ReactNode;
};

export const TvSlideCanvas = ({ background, testId, children }: TvSlideCanvasProps) => (
  <div data-testid={testId} className="relative h-full w-full overflow-hidden" style={{ background, color: "#f8fafc" }}>
    {/* Dim accent rule, same as the idle screen: a bright full-width line would burn in. */}
    <div
      aria-hidden
      className="absolute inset-x-0 top-0"
      style={{ height: 6, opacity: 0.5, background: "linear-gradient(90deg, #06b6d4, #f59e0b 85%)" }}
    />
    <div
      className="absolute left-0 top-0"
      style={{
        width: TV_SLIDE_DESIGN_WIDTH,
        height: TV_SLIDE_DESIGN_HEIGHT,
        transform: `scale(${TV_SLIDE_SCALE})`,
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  </div>
);

type TvSlideHeaderProps = {
  title: string;
  subtitle: string;
  right?: string | null;
};

/** Mockup `.hd`: title 80, venue 40, optional right label 40. */
export const TvSlideHeader = ({ title, subtitle, right = null }: TvSlideHeaderProps) => (
  <div className="flex items-end justify-between">
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1 }}>{title}</div>
      <div style={{ fontSize: 40, fontWeight: 800, color: "#94a3b8", marginTop: 8 }}>{subtitle}</div>
    </div>
    {right ? (
      <div style={{ fontSize: 40, fontWeight: 800, color: "#cbd5e1", textAlign: "right" }}>{right}</div>
    ) : null}
  </div>
);
