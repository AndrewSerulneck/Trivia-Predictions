import type { ReactNode } from "react";
import { Basketball, Football, SoccerBall } from "@/components/game-themes/sportBalls";
import { GAME_TITLE_LINES_BY_KEY } from "@/components/venue/venueHubShared";
import type { VenueGameKey } from "@/lib/venueGameCards";

// THE GAME THEMES on the Venue Home game buttons (docs/game-themes-plan.md, Phase 1; Andrew approved the
// mockups 2026-11-04). One entry per game: a `Record<VenueGameKey, …>`, so a new game does not compile
// until it has a theme. The tile's colours are fixed artwork, the same in dark and light (light-theme
// plan decision 5). The words always come from GAME_TITLE_LINES_BY_KEY; a theme only styles them.
// All artwork is decoration (aria-hidden). No team, league or event logos.
//
// Sizes use `cqw` (per cent of the tile's width; the tile is the size container), so the same design
// fits a 288 px tile on a 320 px phone and a 448 px tile on a tablet.

export type GameTileTheme = {
  /** Background classes for the tile. */
  surfaceClass: string;
  /** Full-bleed decoration behind everything (stripes, beams, a floor). */
  backdrop?: ReactNode;
  /** The game's picture, in the tile's right-hand column. */
  art: ReactNode;
  /** One-line names ("Live Trivia") are split after the first word into two styled lines. */
  splitTitle: boolean;
  /** Draws the title from its lines (1 or 2). */
  renderTitle: (lines: readonly string[]) => ReactNode;
  /** Extra classes for the subtitle (shadow on busy backgrounds). */
  subtitleClass?: string;
};

/** The tile's title lines: the on-screen name, split after the first word when the theme asks. */
export const gameTileTitleLines = (key: VenueGameKey): string[] => {
  const [first, second] = GAME_TITLE_LINES_BY_KEY[key];
  if (second) return [first, second];
  if (!GAME_TILE_THEMES[key].splitTitle) return [first];
  const space = first.indexOf(" ");
  return space < 0 ? [first] : [first.slice(0, space), first.slice(space + 1)];
};

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────────────

const BIG = "text-[clamp(28px,11.5cqw,44px)]";
const MEDIUM = "text-[clamp(25px,9.5cqw,36px)]";
const SMALL = "text-[clamp(16px,6.2cqw,26px)]";
const LINE = "block font-black uppercase leading-none";

/** The picture column: viewBox x 208–358 of the 358 × 176 mockup, so mockup coordinates carry over. */
const Art = ({ children }: { children: ReactNode }) => (
  <svg aria-hidden="true" viewBox="208 0 150 176" className="h-auto max-h-full w-full overflow-visible">
    {children}
  </svg>
);

/** Full-bleed decoration, anchored to the right edge so it lines up with the picture. */
const Backdrop = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 358 176"
    preserveAspectRatio="xMaxYMid slice"
    className="pointer-events-none absolute inset-0 h-full w-full"
  >
    {children}
  </svg>
);

const twoLines = (lines: readonly string[], topClass: string, bottomClass: string): ReactNode => (
  <>
    <span className={`${LINE} ${topClass}`}>{lines[0]}</span>
    {lines[1] ? <span className={`${LINE} ${bottomClass}`}>{lines[1]}</span> : null}
  </>
);

const Glyph = ({ x, y, size, fill, opacity = 1, rotate = 0 }: { x: number; y: number; size: number; fill: string; opacity?: number; rotate?: number }) => (
  <text x={x} y={y} fontSize={size} fontWeight="900" fill={fill} fillOpacity={opacity} transform={`rotate(${rotate} ${x} ${y})`}>
    ?
  </text>
);

// ── The nine themes ──────────────────────────────────────────────────────────────────────────────────

const liveTrivia: GameTileTheme = {
  surfaceClass: "bg-[radial-gradient(ellipse_90%_120%_at_80%_0%,#3B1D8F_0%,#1C1257_55%,#0B0826_100%)]",
  backdrop: (
    <Backdrop>
      <polygon points="290,0 320,0 358,176 210,176" fill="#FFFFFF" fillOpacity="0.12" />
    </Backdrop>
  ),
  art: (
    <Art>
      <Glyph x={262} y={138} size={130} fill="#22D3EE" opacity={0.35} />
      <Glyph x={266} y={134} size={122} fill="#22D3EE" />
      <Glyph x={228} y={62} size={38} fill="#F472B6" opacity={0.8} rotate={-16} />
      <Glyph x={330} y={40} size={28} fill="#FBBF24" opacity={0.8} rotate={14} />
      <circle cx="216" cy="120" r="3" fill="#FBBF24" />
      <circle cx="340" cy="150" r="3" fill="#FBBF24" />
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) => (
    <>
      {/* The marquee sign: a gold frame with a ring of bulbs (a dotted border). */}
      <span className="inline-flex items-center rounded-[10px] border-4 border-dotted border-amber-100 bg-[#2A0F4D] px-[2.4cqw] py-[0.6cqw] ring-2 ring-amber-400">
        <span className={`${LINE} text-[clamp(17px,6.2cqw,24px)] tracking-[0.08em] text-pink-400 [text-shadow:0_0_10px_rgba(244,114,182,0.7)]`}>
          {lines[0]}
        </span>
      </span>
      {lines[1] ? (
        <span className={`${LINE} mt-1 ${BIG} text-cyan-400 [text-shadow:0_3px_0_#0E7490]`}>{lines[1]}</span>
      ) : null}
    </>
  ),
};

const speedTrivia: GameTileTheme = {
  surfaceClass: "bg-[linear-gradient(135deg,#431407_0%,#9A3412_55%,#EA580C_100%)]",
  art: (
    <Art>
      <g stroke="#FDE68A" strokeOpacity="0.6" strokeWidth="5" strokeLinecap="round">
        <line x1="214" y1="72" x2="242" y2="72" />
        <line x1="210" y1="94" x2="238" y2="94" />
        <line x1="216" y1="116" x2="242" y2="116" />
      </g>
      <g transform="translate(298 96) rotate(12)">
        <rect x="-10" y="-64" width="20" height="14" rx="4" fill="#FEF3C7" />
        <rect x="30" y="-50" width="14" height="10" rx="3" fill="#FEF3C7" transform="rotate(40 37 -45)" />
        <circle cx="0" cy="0" r="50" fill="#FEF3C7" stroke="#1C1917" strokeWidth="6" />
        <g stroke="#1C1917" strokeWidth="4" strokeLinecap="round">
          <line x1="0" y1="-40" x2="0" y2="-32" />
          <line x1="40" y1="0" x2="32" y2="0" />
          <line x1="0" y1="40" x2="0" y2="32" />
          <line x1="-40" y1="0" x2="-32" y2="0" />
        </g>
        <path d="M 0 0 L 0 -38 A 38 38 0 0 1 33 19 Z" fill="#F59E0B" fillOpacity="0.55" />
        <line x1="0" y1="0" x2="22" y2="-28" stroke="#DC2626" strokeWidth="5" strokeLinecap="round" />
        <circle cx="0" cy="0" r="6" fill="#1C1917" />
      </g>
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) =>
    twoLines(
      lines,
      `${BIG} italic text-amber-200 [text-shadow:0_3px_0_#7C2D12]`,
      `${MEDIUM} text-white [text-shadow:0_3px_0_#7C2D12]`,
    ),
};

const BINGO_DAUBS: readonly { cx: number; cy: number; fill: string }[] = [
  { cx: -46, cy: -26, fill: "#EC4899" },
  { cx: 0, cy: -2, fill: "#EC4899" },
  { cx: 23, cy: 24, fill: "#EC4899" },
  { cx: -23, cy: 24, fill: "#F59E0B" },
  { cx: 46, cy: 50, fill: "#EC4899" },
];

const bingo: GameTileTheme = {
  surfaceClass: "bg-[linear-gradient(160deg,#022C22_0%,#065F46_60%,#047857_100%)]",
  art: (
    <Art>
      <g transform="translate(286 92) rotate(8)">
        <rect x="-62" y="-70" width="124" height="140" rx="12" fill="#FFFFFF" />
        <rect x="-62" y="-70" width="124" height="28" rx="12" fill="#10B981" />
        <rect x="-62" y="-52" width="124" height="10" fill="#10B981" />
        <g fontSize="16" fontWeight="900" fill="#FFFFFF" textAnchor="middle">
          {["B", "I", "N", "G", "O"].map((letter, index) => (
            <text key={letter} x={-46 + index * 23} y="-50">
              {letter}
            </text>
          ))}
        </g>
        <g stroke="#D1D5DB" strokeWidth="2">
          <line x1="-57" y1="-15" x2="57" y2="-15" />
          <line x1="-57" y1="11" x2="57" y2="11" />
          <line x1="-57" y1="37" x2="57" y2="37" />
          <line x1="-34" y1="-38" x2="-34" y2="64" />
          <line x1="-11" y1="-38" x2="-11" y2="64" />
          <line x1="12" y1="-38" x2="12" y2="64" />
          <line x1="35" y1="-38" x2="35" y2="64" />
        </g>
        {BINGO_DAUBS.map((daub) => (
          <circle key={`${daub.cx}-${daub.cy}`} cx={daub.cx} cy={daub.cy} r="9" fill={daub.fill} fillOpacity="0.85" />
        ))}
        <path d="M -5 -2 L -1 3 L 6 -6" stroke="#FFFFFF" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) =>
    twoLines(lines, `${SMALL} tracking-[0.15em] text-white`, `${BIG} text-emerald-300 [text-shadow:0_3px_0_#064E3B]`),
};

const pickem: GameTileTheme = {
  surfaceClass:
    "bg-[repeating-linear-gradient(180deg,#166534_0px,#166534_22px,#15803D_22px,#15803D_44px)]",
  backdrop: (
    <Backdrop>
      <defs>
        <linearGradient id="gt-pickem-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#03140A" stopOpacity="0.6" />
          <stop offset="0.6" stopColor="#03140A" stopOpacity="0.2" />
          <stop offset="1" stopColor="#03140A" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2">
        <line x1="0" y1="44" x2="358" y2="44" />
        <line x1="0" y1="88" x2="358" y2="88" />
        <line x1="0" y1="132" x2="358" y2="132" />
      </g>
      <rect x="0" y="0" width="358" height="176" fill="url(#gt-pickem-shade)" />
    </Backdrop>
  ),
  art: (
    <Art>
      <Football x={298} y={58} rotate={-28} scale={0.92} />
      <SoccerBall x={284} y={128} rotate={14} clipId="gt-pickem-soccer" />
    </Art>
  ),
  splitTitle: false,
  renderTitle: (lines) => (
    <>
      <span className={`${LINE} ${BIG} italic text-white [text-shadow:0_3px_0_#052E16]`}>{lines[0]}</span>
      <svg aria-hidden="true" viewBox="0 0 150 12" className="mt-0.5 block h-auto w-[42cqw] max-w-[150px]">
        <path d="M 3 9 Q 75 1 147 6" stroke="#FACC15" strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
    </>
  ),
  subtitleClass: "[text-shadow:0_1px_4px_rgba(0,0,0,0.5)]",
};

const JERSEY = "M -18 -22 L -8 -30 H 8 L 18 -22 L 13 -14 L 9 -16 V 10 H -9 V -16 L -13 -14 Z";
const FANTASY_CARDS: readonly { x: number; y: number; rotate: number; scale: number; card: string; ink: string; number: string }[] = [
  { x: 250, y: 96, rotate: -14, scale: 1, card: "#C4B5FD", ink: "#4C1D95", number: "12" },
  { x: 320, y: 96, rotate: 14, scale: 1, card: "#F9A8D4", ink: "#831843", number: "7" },
  { x: 285, y: 88, rotate: 0, scale: 1.12, card: "#FBBF24", ink: "#78350F", number: "23" },
];

const fantasy: GameTileTheme = {
  surfaceClass: "bg-[linear-gradient(150deg,#1E0A4A_0%,#4C1D95_60%,#6D28D9_100%)]",
  art: (
    <Art>
      <path d="M 220 30 l 3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 z" fill="#FBBF24" />
      <path d="M 346 150 l 2 5 5 1 -4 3 1 5 -4 -2 -4 2 1 -5 -4 -3 5 -1 z" fill="#FBBF24" fillOpacity="0.7" />
      {FANTASY_CARDS.map((card) => (
        <g key={card.number} transform={`translate(${card.x} ${card.y}) rotate(${card.rotate}) scale(${card.scale})`}>
          <rect x="-34" y="-48" width="68" height="96" rx="10" fill={card.card} stroke="#FFFFFF" strokeWidth="3" />
          <path d={JERSEY} fill={card.ink} />
          <text x="0" y="36" textAnchor="middle" fontWeight="900" fontSize="20" fill={card.ink}>
            {card.number}
          </text>
        </g>
      ))}
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) =>
    twoLines(
      lines,
      `${MEDIUM} text-white [text-shadow:0_3px_0_#2E1065]`,
      `${MEDIUM} text-amber-400 [text-shadow:0_3px_0_#2E1065]`,
    ),
};

const TILE_TILTS = ["-rotate-[4deg]", "rotate-[3deg]", "-rotate-[2deg]", "rotate-[4deg]", "-rotate-[3deg]", "rotate-[2deg]"];

const categoryBlitz: GameTileTheme = {
  surfaceClass: "bg-[radial-gradient(ellipse_100%_120%_at_30%_20%,#0F5132_0%,#083323_55%,#04190F_100%)]",
  art: (
    <Art>
      <polygon points="330,18 312,58 328,58 316,92 350,48 332,48 346,18" fill="#FDE047" />
      <g transform="translate(286 112) rotate(-8)">
        <rect x="-38" y="-38" width="76" height="76" rx="14" fill="#4ADE80" />
        <rect x="-38" y="32" width="76" height="8" rx="4" fill="#15803D" />
        <text x="0" y="22" textAnchor="middle" fontWeight="900" fontSize="60" fill="#04190F">
          B
        </text>
      </g>
      <g transform="translate(234 40) rotate(14)" opacity="0.4">
        <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#FEF9E7" />
        <text x="0" y="8" textAnchor="middle" fontWeight="900" fontSize="20" fill="#065F46">
          S
        </text>
      </g>
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) => (
    <>
      {/* The first word on letter tiles; screen readers get the word itself. */}
      <span className="sr-only">{lines[0]}</span>
      <span aria-hidden="true" className="flex gap-[0.6cqw]">
        {[...lines[0].toUpperCase()].map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className={`flex h-[clamp(20px,7.6cqw,28px)] w-[clamp(17px,6.4cqw,24px)] items-center justify-center rounded-[6px] bg-[#FEF9E7] text-[clamp(14px,5cqw,18px)] font-black leading-none text-[#065F46] ${TILE_TILTS[index % TILE_TILTS.length]}`}
          >
            {letter}
          </span>
        ))}
      </span>
      {lines[1] ? (
        <span className={`${LINE} mt-1 ${BIG} italic text-green-400 [text-shadow:0_3px_0_#166534]`}>{lines[1]}</span>
      ) : null}
    </>
  ),
};

const nflPickem: GameTileTheme = {
  surfaceClass: "bg-[linear-gradient(180deg,#050A1F_0%,#0B1A45_100%)]",
  backdrop: (
    <Backdrop>
      <defs>
        <linearGradient id="gt-nfl-beam" x1="1" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#E0F2FE" stopOpacity="0.3" />
          <stop offset="1" stopColor="#E0F2FE" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="300,26 350,22 340,176 190,176" fill="url(#gt-nfl-beam)" />
      <polygon points="250,140 358,140 358,176 220,176" fill="#15803D" />
      <line x1="240" y1="152" x2="358" y2="152" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2" />
    </Backdrop>
  ),
  art: (
    <Art>
      <rect x="300" y="10" width="50" height="26" rx="4" fill="#1E293B" />
      <g fill="#F8FAFC">
        {[311, 325, 339].flatMap((cx) => [18, 29].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />))}
      </g>
      <Football x={282} y={96} rotate={-24} />
    </Art>
  ),
  splitTitle: false,
  renderTitle: (lines) => (
    <>
      <span className="inline-flex items-center rounded-[9px] bg-blue-600 px-[3.4cqw] py-[0.8cqw] shadow-[0_3px_0_#1E3A8A]">
        <span className={`${LINE} text-[clamp(18px,6.6cqw,24px)] tracking-[0.08em] text-white`}>{lines[0]}</span>
      </span>
      {lines[1] ? (
        <span className={`${LINE} mt-1 ${BIG} italic text-white [text-shadow:0_0_14px_rgba(96,165,250,0.6),0_3px_0_#1E3A8A]`}>
          {lines[1]}
        </span>
      ) : null}
    </>
  ),
};

const SQUARE_TOP = ["7", "3", "0", "9"];
const SQUARE_SIDE = ["4", "0", "7", "2"];
const SQUARE_FILLS: readonly (readonly string[])[] = [
  ["#F1F5F9", "#2563EB", "#F1F5F9", "#DB2777"],
  ["#0891B2", "#F1F5F9", "#FBBF24", "#F1F5F9"],
  ["#F1F5F9", "#7C3AED", "#F1F5F9", "#2563EB"],
  ["#DB2777", "#F1F5F9", "#0891B2", "#F1F5F9"],
];

const squares: GameTileTheme = {
  surfaceClass: "bg-[radial-gradient(ellipse_100%_120%_at_30%_30%,#0E4D2E_0%,#06301C_55%,#03180E_100%)]",
  art: (
    <Art>
      <g transform="translate(286 92) rotate(6)">
        <rect x="-64" y="-64" width="128" height="128" rx="10" fill="#0B1220" />
        <g fontWeight="900" fontSize="13" fill="#FBBF24" textAnchor="middle">
          {SQUARE_TOP.map((digit, index) => (
            <text key={`top-${index}`} x={-30 + index * 24} y="-44">
              {digit}
            </text>
          ))}
          {SQUARE_SIDE.map((digit, index) => (
            <text key={`side-${index}`} x="-54" y={-20 + index * 24}>
              {digit}
            </text>
          ))}
        </g>
        {SQUARE_FILLS.flatMap((row, rowIndex) =>
          row.map((fill, colIndex) => (
            <rect key={`${rowIndex}-${colIndex}`} x={-41 + colIndex * 24} y={-35 + rowIndex * 24} width="22" height="22" rx="4" fill={fill} />
          )),
        )}
        <text x="18" y="5" textAnchor="middle" fontWeight="900" fontSize="16" fill="#0B1220">
          ?
        </text>
      </g>
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) =>
    twoLines(lines, `${SMALL} tracking-[0.12em] text-white`, `mt-0.5 ${MEDIUM} text-amber-400 [text-shadow:0_3px_0_#92400E]`),
};

const bracket: GameTileTheme = {
  surfaceClass: "bg-[linear-gradient(160deg,#0A1230_0%,#111C46_100%)]",
  backdrop: (
    <Backdrop>
      <defs>
        <linearGradient id="gt-bracket-wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#B9773C" />
          <stop offset="0.5" stopColor="#D4955A" />
          <stop offset="1" stopColor="#B9773C" />
        </linearGradient>
      </defs>
      <polygon points="200,128 358,128 358,176 180,176" fill="url(#gt-bracket-wood)" />
      <g stroke="#8A5527" strokeOpacity="0.5" strokeWidth="1.5">
        <line x1="230" y1="128" x2="226" y2="176" />
        <line x1="270" y1="128" x2="268" y2="176" />
        <line x1="310" y1="128" x2="310" y2="176" />
        <line x1="350" y1="128" x2="352" y2="176" />
      </g>
    </Backdrop>
  ),
  art: (
    <Art>
      <g stroke="#FB923C" strokeOpacity="0.4" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M 358 18 H 336 V 40 H 358" />
        <path d="M 358 62 H 336 V 84 H 358" />
        <path d="M 336 29 H 316 V 73 H 336" />
        <path d="M 316 51 H 296" />
        <path d="M 220 18 H 242 V 40 H 220" />
        <path d="M 242 29 H 262 V 51 H 296" />
      </g>
      <Basketball x={290} y={112} />
    </Art>
  ),
  splitTitle: true,
  renderTitle: (lines) =>
    twoLines(lines, `${SMALL} tracking-[0.15em] text-white`, `${MEDIUM} italic text-orange-400 [text-shadow:0_3px_0_#9A3412]`),
};

export const GAME_TILE_THEMES: Record<VenueGameKey, GameTileTheme> = {
  live_trivia: liveTrivia,
  "speed-trivia": speedTrivia,
  bingo,
  pickem,
  fantasy,
  "category-blitz": categoryBlitz,
  "nfl-pickem": nflPickem,
  squares,
  bracket,
};
