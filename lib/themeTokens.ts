/**
 * Static accent theme maps — all class strings are complete literals so Tailwind
 * can statically scan this file and include every class in the production bundle.
 * Never use dynamic string interpolation (e.g. `text-${color}-300`) in this file
 * or in any component that derives classes from these maps.
 */

export const THEME = {
  /** Venue hub, lobby, and any pre-game context */
  hub: {
    label:    "text-cyan-300 tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-cyan-400/60",
    card:     "border-cyan-400/30",
    text:     "text-cyan-200",
    fill:     "bg-cyan-500",
    tint:     "bg-cyan-950/30",
    primary:  "bg-cyan-400 text-slate-950 font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-cyan-400/50 text-cyan-300 rounded-xl",
  },
  /** Login / join flow */
  login: {
    label:    "text-cyan-300 tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-cyan-400/60",
    card:     "border-cyan-400/40",
    text:     "text-cyan-300",
    fill:     "bg-cyan-400",
    tint:     "bg-cyan-950/30",
    primary:  "bg-cyan-400 text-slate-950 font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-cyan-400/50 text-cyan-300 rounded-xl",
  },
  /** Leaderboard */
  leaderboard: {
    label:    "text-amber-300 tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-amber-400/60",
    card:     "border-amber-400/30",
    text:     "text-amber-200",
    fill:     "bg-amber-500",
    tint:     "bg-amber-950/30",
    primary:  "bg-amber-400 text-slate-950 font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-amber-400/50 text-amber-300 rounded-xl",
  },
  /** Profile / activity / career */
  activity: {
    label:    "text-blue-300 tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-blue-400/60",
    card:     "border-blue-400/30",
    text:     "text-blue-200",
    fill:     "bg-blue-500",
    tint:     "bg-blue-950/30",
    primary:  "bg-blue-400 text-slate-950 font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-blue-400/50 text-blue-300 rounded-xl",
  },
  /** Prizes / redeem */
  prizes: {
    label:    "text-[#d89a4f] tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-[#d89a4f]/60",
    card:     "border-[#d89a4f]/50",
    text:     "text-[#d89a4f]",
    fill:     "bg-[#d89a4f]",
    tint:     "bg-[#5c3a12]/30",
    primary:  "bg-[#d89a4f] text-slate-950 font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-[#d89a4f]/50 text-[#d89a4f] rounded-xl",
  },
  /** FAQs / info pages */
  faq: {
    label:    "text-slate-400 tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-slate-600",
    card:     "border-slate-600",
    text:     "text-slate-300",
    fill:     "bg-slate-600",
    tint:     "bg-slate-800/50",
    primary:  "bg-slate-600 text-white font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-slate-600 text-slate-300 rounded-xl",
  },
  /** Error / danger states (universal — not overridden per game) */
  error: {
    label:    "text-rose-300 tracking-[0.14em] uppercase font-black text-sm",
    border:   "border-rose-400/60",
    card:     "border-rose-400/30",
    text:     "text-rose-200",
    fill:     "bg-rose-500",
    tint:     "bg-rose-950/30",
    primary:  "bg-rose-500 text-white font-black rounded-xl py-3 px-4 active:translate-y-[1px] disabled:opacity-50",
    secondary:"bg-transparent border border-rose-400/50 text-rose-300 rounded-xl",
  },
} as const;

export const GAME_THEME = {
  /** Live Trivia — "The Broadcast": cyan→sky→blue */
  liveTrivia: {
    gradient:  "from-cyan-500 via-sky-500 to-blue-600",
    label:     "text-cyan-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-cyan-400/60",
    card:      "border-cyan-400/30",
    fill:      "bg-cyan-400",
    tint:      "bg-cyan-950/30",
    primary:   "bg-cyan-400 text-slate-950 font-black rounded-xl",
    phases: {
      lobby:        { border: "border-cyan-400/60",    fill: "bg-cyan-500",        text: "text-cyan-300"    },
      answering:    { border: "border-emerald-400/60", fill: "bg-emerald-500",      text: "text-emerald-300" },
      reveal:       { border: "border-fuchsia-400/60", fill: "bg-fuchsia-500",      text: "text-fuchsia-300" },
      intermission: { border: "border-fuchsia-400/60", fill: "bg-fuchsia-500",      text: "text-fuchsia-300" },
      countdown:    { border: "border-amber-400/60",   fill: "bg-amber-500",        text: "text-amber-300"   },
      correct:      { border: "border-emerald-400/60", fill: "bg-emerald-500/20",   text: "text-emerald-300" },
      wrong:        { border: "border-rose-400/60",    fill: "bg-rose-500/20",      text: "text-rose-300"    },
    },
  },
  /** Speed Trivia — "The Sprint": sky→blue→violet */
  speedTrivia: {
    gradient:  "from-sky-500 via-blue-600 to-violet-700",
    label:     "text-blue-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-blue-400/60",
    card:      "border-blue-400/30",
    fill:      "bg-blue-500",
    tint:      "bg-blue-950/30",
    primary:   "bg-blue-500 text-white font-black rounded-xl",
    phases: {
      answering: { border: "border-blue-400/60",    fill: "bg-blue-500",       text: "text-blue-300"    },
      correct:   { border: "border-emerald-400/60", fill: "bg-emerald-500/20", text: "text-emerald-300" },
      wrong:     { border: "border-rose-400/60",    fill: "bg-rose-500/20",    text: "text-rose-300"    },
      next:      { border: "border-violet-400/60",  fill: "bg-violet-500",     text: "text-violet-300"  },
    },
  },
  /** Sports Bingo — "The Wild Card": orange→red→pink */
  bingo: {
    gradient:  "from-orange-500 via-red-500 to-pink-500",
    label:     "text-orange-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-orange-400/60",
    card:      "border-orange-400/30",
    fill:      "bg-orange-500",
    tint:      "bg-orange-950/30",
    primary:   "bg-orange-500 text-white font-black rounded-xl",
    phases: {
      idle:   { border: "border-orange-400/60", fill: "bg-slate-900",  text: "text-orange-300" },
      marked: { border: "border-orange-300",    fill: "bg-orange-500", text: "text-white"       },
      bingo:  { border: "border-rose-400/60",   fill: "bg-rose-500",   text: "text-rose-300"   },
    },
  },
  /** Pick 'Em — "The Rival": blue→violet→pink */
  pickem: {
    gradient:  "from-blue-600 via-violet-700 to-pink-500",
    label:     "text-indigo-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-indigo-400/60",
    card:      "border-indigo-400/30",
    fill:      "bg-indigo-500",
    tint:      "bg-indigo-950/30",
    primary:   "bg-indigo-500 text-white font-black rounded-xl",
    phases: {
      default:  { border: "border-indigo-400/60", fill: "bg-slate-900",      text: "text-indigo-300"  },
      selected: { border: "border-cyan-300/80",   fill: "bg-cyan-500/15",    text: "text-cyan-200"    },
      winner:   { border: "border-emerald-400/60",fill: "bg-emerald-500/20", text: "text-emerald-300" },
      loser:    { border: "border-rose-400/60",   fill: "bg-rose-500/20",    text: "text-rose-300"    },
    },
  },
  /** Fantasy — "The Dynasty": violet→blue→cyan */
  fantasy: {
    gradient:  "from-violet-700 via-blue-600 to-cyan-500",
    label:     "text-violet-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-violet-400/60",
    card:      "border-violet-400/30",
    fill:      "bg-violet-500",
    tint:      "bg-violet-950/30",
    primary:   "bg-violet-500 text-white font-black rounded-xl",
    phases: {
      filled:  { border: "border-violet-300/60", fill: "bg-violet-900/30", text: "text-violet-300"  },
      empty:   { border: "border-slate-600",      fill: "bg-slate-800/50", text: "text-slate-400"   },
      points:  { border: "border-cyan-400/60",    fill: "bg-cyan-500",     text: "text-cyan-300"    },
      top:     { border: "border-[#d89a4f]/60",   fill: "bg-[#d89a4f]",    text: "text-[#d89a4f]"  },
    },
  },
  /** Category Blitz — "The Word Rush": emerald→green→teal */
  "category-blitz": {
    gradient:  "from-emerald-500 via-green-500 to-teal-500",
    label:     "text-emerald-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-emerald-400/60",
    card:      "border-emerald-400/30",
    fill:      "bg-emerald-500",
    tint:      "bg-emerald-950/30",
    primary:   "bg-emerald-500 text-slate-950 font-black rounded-xl",
    phases: {
      lobby:    { border: "border-emerald-400/60", fill: "bg-emerald-500",     text: "text-emerald-300" },
      answering:{ border: "border-green-400/60",   fill: "bg-green-500",       text: "text-green-300"   },
      scoring:  { border: "border-teal-400/60",    fill: "bg-teal-500",        text: "text-teal-300"    },
      unique:   { border: "border-emerald-400/60", fill: "bg-emerald-500/20",  text: "text-emerald-300" },
      duplicate:{ border: "border-slate-600",      fill: "bg-slate-800/50",    text: "text-slate-400"   },
    },
  },
  /**
   * Category Blitz "Be Unique!" round — the standard scoring world (score by
   * uniqueness). Mirrors "category-blitz" above; kept as its own key so
   * lib/categoryBlitzModes.ts MODE_CONFIG.standard.themeKey can look it up
   * without the game surface needing a fallback branch.
   */
  blitzStandard: {
    /** Full-page canvas behind the board for the round's duration (§4c). */
    pageBg:        "bg-slate-950",
    gradient:      "from-emerald-500 via-green-500 to-teal-500",
    letterGradient:"bg-[linear-gradient(132deg,#10b981_0%,#22c55e_50%,#14b8a6_100%)]",
    letterGlow:    "shadow-[0_0_18px_rgba(16,185,129,0.35)]",
    borderActive:  "border-emerald-400/60",
    borderCard:    "border-emerald-400/30",
    textAccent:    "text-emerald-300",
    textLabel:     "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs",
    bgTint:        "bg-emerald-500/10",
    bgTintDeep:    "bg-emerald-950/30",
    progressFill:  "bg-emerald-500",
    spinnerRing:   "border-emerald-400/40 border-t-emerald-400",
    filledBorder:  "border-emerald-400/50",
    filledBg:      "bg-emerald-950/30",
    filledText:    "text-emerald-200",
    borderSoft:    "border-emerald-400/20",
    textSoft:      "text-emerald-100/70",
    textAccentSoft:"text-emerald-300/70",
  },
  /**
   * Category Blitz "Blend In!" round — the reverse/consensus scoring world
   * (score by matching the crowd). Hot magenta/gold vs. the standard round's
   * cool emerald, so the flip reads as an unmistakable full color-world swap
   * per docs/category-blitz-mode-b-plan.md §4c — never a hardcoded color in
   * the component, always this token set via MODE_CONFIG.reverse.themeKey.
   */
  blitzReverse: {
    /** Deep magenta/violet canvas — the ambient "sustained cue" a player who
     *  missed the flip takeover still reads as "different mode" (§4c). */
    pageBg:        "bg-[#1a0b2e]",
    gradient:      "from-fuchsia-600 via-pink-500 to-amber-400",
    letterGradient:"bg-[linear-gradient(132deg,#d946ef_0%,#ec4899_50%,#f59e0b_100%)]",
    letterGlow:    "shadow-[0_0_18px_rgba(217,70,239,0.45)]",
    borderActive:  "border-fuchsia-400/60",
    borderCard:    "border-fuchsia-400/30",
    textAccent:    "text-fuchsia-300",
    textLabel:     "text-fuchsia-300 tracking-[0.14em] uppercase font-black text-xs",
    bgTint:        "bg-fuchsia-500/10",
    bgTintDeep:    "bg-fuchsia-950/30",
    progressFill:  "bg-fuchsia-500",
    spinnerRing:   "border-fuchsia-400/40 border-t-fuchsia-400",
    filledBorder:  "border-fuchsia-400/50",
    filledBg:      "bg-fuchsia-950/30",
    filledText:    "text-fuchsia-200",
    borderSoft:    "border-fuchsia-400/20",
    textSoft:      "text-fuchsia-100/70",
    textAccentSoft:"text-fuchsia-300/70",
  },
  /** Predictions — "The Oracle": slate-950→deep navy→sky */
  predictions: {
    gradient:  "from-slate-950 via-[#1e3a5f] to-sky-700",
    label:     "text-sky-300 tracking-[0.14em] uppercase font-black text-sm",
    border:    "border-sky-400/60",
    card:      "border-sky-400/30",
    fill:      "bg-sky-700",
    tint:      "bg-sky-950/30",
    primary:   "bg-sky-700 text-white font-black rounded-xl",
    phases: {
      prediction: { border: "border-sky-400/60",     fill: "bg-slate-900",      text: "text-sky-300"     },
      locked:     { border: "border-sky-300/80",      fill: "bg-sky-950/30",     text: "text-sky-200"     },
      correct:    { border: "border-emerald-400/60",  fill: "bg-emerald-500/20", text: "text-emerald-300" },
      wrong:      { border: "border-rose-400/60",     fill: "bg-rose-500/20",    text: "text-rose-300"    },
    },
  },
} as const;

export type ThemeKey = keyof typeof THEME;
export type GameThemeKey = keyof typeof GAME_THEME;
