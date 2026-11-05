// Sport balls shared by the game themes (docs/game-themes-plan.md). SVG groups only: place them inside
// an <svg>. Generic shapes, never a team's or league's mark.

type Placement = {
  x: number;
  y: number;
  /** Degrees. */
  rotate?: number;
  /** 1 = the size the shape is drawn at below. */
  scale?: number;
};

const placement = ({ x, y, rotate = 0, scale = 1 }: Placement): string =>
  `translate(${x} ${y}) rotate(${rotate}) scale(${scale})`;

/** An American football, 96 × 58 at scale 1. */
export const Football = (props: Placement) => (
  <g transform={placement(props)}>
    <ellipse cx="0" cy="0" rx="48" ry="29" fill="#92400E" />
    <path d="M -36 -17 Q -44 0 -36 17" stroke="#FFFFFF" strokeWidth="4" fill="none" />
    <path d="M 36 -17 Q 44 0 36 17" stroke="#FFFFFF" strokeWidth="4" fill="none" />
    <line x1="-17" y1="0" x2="17" y2="0" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
    <g stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round">
      <line x1="-10" y1="-5" x2="-10" y2="5" />
      <line x1="-3" y1="-5" x2="-3" y2="5" />
      <line x1="4" y1="-5" x2="4" y2="5" />
      <line x1="11" y1="-5" x2="11" y2="5" />
    </g>
  </g>
);

const PATCH = "M 0 -9 L 8.6 -2.8 L 5.3 7.3 L -5.3 7.3 L -8.6 -2.8 Z";
const PATCHES: readonly { x: number; y: number; r: number }[] = [
  { x: 17, y: -24, r: 36 },
  { x: 28, y: 9, r: 108 },
  { x: 0, y: 29, r: 180 },
  { x: -28, y: 9, r: 252 },
  { x: -17, y: -24, r: 324 },
];

/** A soccer ball, radius 30 at scale 1. `clipId` must be unique on the page. */
export const SoccerBall = ({ clipId, ...props }: Placement & { clipId: string }) => (
  <g transform={placement(props)}>
    <defs>
      <clipPath id={clipId}>
        <circle cx="0" cy="0" r="30" />
      </clipPath>
    </defs>
    <circle cx="0" cy="0" r="30" fill="#F8FAFC" />
    <g clipPath={`url(#${clipId})`} fill="#0F172A">
      <path d="M 0 -10.5 L 10 -3.3 L 6.2 8.5 L -6.2 8.5 L -10 -3.3 Z" />
      {PATCHES.map((patch) => (
        <path key={patch.r} d={PATCH} transform={`translate(${patch.x} ${patch.y}) rotate(${patch.r})`} />
      ))}
    </g>
    <g stroke="#0F172A" strokeWidth="1.6" strokeLinecap="round">
      <line x1="0" y1="-10.5" x2="0" y2="-21" />
      <line x1="10" y1="-3.3" x2="20" y2="-6.5" />
      <line x1="6.2" y1="8.5" x2="12.5" y2="17" />
      <line x1="-6.2" y1="8.5" x2="-12.5" y2="17" />
      <line x1="-10" y1="-3.3" x2="-20" y2="-6.5" />
    </g>
  </g>
);

/** A basketball, radius 42 at scale 1. */
export const Basketball = (props: Placement) => (
  <g transform={placement(props)}>
    <circle cx="0" cy="0" r="42" fill="#EA580C" />
    <circle cx="-12" cy="-14" r="24" fill="#FB923C" fillOpacity="0.55" />
    <g stroke="#431407" strokeWidth="3.5" fill="none">
      <line x1="-42" y1="0" x2="42" y2="0" />
      <line x1="0" y1="-42" x2="0" y2="42" />
      <path d="M -30 -30 Q -11 0 -30 30" />
      <path d="M 30 -30 Q 11 0 30 30" />
    </g>
  </g>
);
