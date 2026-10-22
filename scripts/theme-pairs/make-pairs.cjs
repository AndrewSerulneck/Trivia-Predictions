/**
 * Old-class vs new-class check for a colour-to-token conversion (docs/light-theme-plan.md Phase 4).
 * The harness screenshots only reach some states; this proves the rest. Each pair is [what the
 * component used to say, what it says now]; in DARK their computed colours, border and shadow must
 * match. Edit the pairs below for the phase you are on (Phase 4's pairs are kept as the example), then:
 *
 *   node scripts/theme-pairs/make-pairs.cjs <outDir>
 *   npx tailwindcss -c tailwind.config.ts -i app/globals.css -o <outDir>/pairs.css --content <outDir>/pairs.html
 *   node scripts/theme-pairs/compare-pairs.cjs <outDir>
 *
 * Run the tailwindcss step in a tree that has the NEW tailwind config AND still compiles the old
 * classes (old arbitrary classes compile from the pairs file itself, so any tree works).
 */
const fs = require("fs");
const here = require("path").resolve(process.argv[2] || require("os").tmpdir() + "/theme-pairs");
fs.mkdirSync(here, { recursive: true });
// `expected` marks a documented, accepted dark difference: it is printed but does not fail the run.
const P = (old, neu, oldStyle = "", newStyle = "", expected = "") => ({ old, neu, oldStyle, newStyle, expected });
const pairs = [
  P("border border-white/10 bg-[rgba(2,6,23,0.92)]", "border border-ht-overlay/10 bg-ht-hub-bar"),
  P("border border-white/10 bg-ht-surface text-ht-fg-primary", "border border-ht-overlay/10 bg-ht-surface text-ht-fg-primary"),
  P("text-cyan-300", "text-ht-venue-accent"),
  P("border border-cyan-400/35 bg-slate-900/90 shadow-[0_8px_24px_rgba(2,6,23,0.45)]", "border border-ht-tab-track-edge bg-ht-tab-track shadow-ht-tab-track"),
  P("bg-cyan-400 text-slate-950", "bg-ht-accent text-ht-on-fill"),
  P("bg-slate-800/80 text-slate-200", "bg-ht-tab-idle text-ht-fg-secondary"),
  P("border border-slate-700 bg-slate-800/80 text-slate-300", "border border-ht-field-border bg-ht-panel-soft text-ht-fg-soft"),
  P("text-slate-400", "text-ht-fg-muted"),
  P("border border-amber-400/60 bg-ht-surface shadow-[0_8px_24px_rgba(0,0,0,0.4)]", "border border-ht-countdown-edge/60 bg-ht-surface shadow-ht-card"),
  P("text-amber-300", "text-ht-countdown-label"),
  P("text-amber-200", "text-ht-countdown"),
  P("text-amber-100/90", "text-ht-countdown-soft/90"),
  P("border border-rose-300/60 bg-rose-400/20 text-rose-200 shadow-[0_0_0_1px_rgba(252,165,165,0.3)]", "border border-ht-danger-fg/60 bg-ht-loss-fg/20 text-ht-danger-soft shadow-[0_0_0_1px_rgb(var(--ht-danger-ring-rgb)/0.3)]"),
  P("border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.28)]", "border border-ht-accent/40 bg-ht-accent/10 text-ht-accent-soft shadow-[0_0_0_1px_rgb(var(--ht-accent-rgb)/0.28)]"),
  P("bg-cyan-400/10 hover:bg-cyan-400/15", "bg-ht-accent/10 hover:bg-ht-accent/15"),
  P("shadow-[0_12px_26px_rgba(15,23,42,0.5)]", "shadow-ht-tile"),
  P("border border-slate-600 bg-slate-800 text-slate-300", "border border-ht-edge-mid bg-ht-elevated text-ht-fg-soft"),
  P("border border-cyan-400/30 bg-slate-900", "border border-ht-panel-edge bg-ht-surface shadow-ht-panel"),
  P("border border-cyan-400/35 bg-ht-elevated hover:border-cyan-300/70 hover:text-cyan-100", "border border-ht-accent/35 bg-ht-elevated hover:border-ht-venue-accent/70 hover:text-ht-accent-pale"),
  P("text-cyan-300", "text-ht-venue-accent"),
  P("border border-cyan-400/35 bg-slate-950 shadow-ht-modal", "border border-ht-accent/35 bg-ht-menu-bg shadow-ht-modal"),
  P("bg-cyan-400/15 text-cyan-200", "bg-ht-accent/15 text-ht-accent-soft"),
  P("border border-amber-400/40 bg-amber-500/10 text-amber-300", "border border-ht-warn-edge/40 bg-amber-500/10 text-ht-warn-fg"),
  P("border border-amber-400/40 bg-amber-500/15 text-amber-300", "border border-ht-warn-edge/40 bg-amber-500/15 text-ht-warn-fg"),
  P("bg-ht-elevated", "bg-ht-table-head-bg"),
  P("", "", "color: var(--ht-amber-500)", "color: var(--ht-table-head)"),
  P("border border-amber-400/60 bg-amber-500/20 text-amber-300", "border border-ht-rank-1-edge bg-ht-rank-1-bg text-ht-rank-1-fg"),
  P("border border-slate-400/50 bg-slate-500/20 text-slate-300", "border border-ht-rank-2-edge bg-ht-rank-2-bg text-ht-rank-2-fg"),
  P("border border-orange-400/50 bg-orange-500/20 text-orange-300", "border border-ht-rank-3-edge bg-ht-rank-3-bg text-ht-rank-3-fg"),
  P("text-cyan-400", "text-ht-accent"),
  P("border border-slate-700/60 bg-slate-800/40", "border border-ht-skeleton/60 bg-ht-skeleton-bg/40"),
  P("bg-slate-700", "bg-ht-skeleton"),
  P("bg-slate-700/70", "bg-ht-skeleton/70"),
  P("bg-slate-700/50", "bg-ht-skeleton/50"),
  P("text-slate-500", "text-ht-fg-faint"),
  P("text-slate-100", "text-ht-fg-strong"),
  P("text-amber-300", "text-ht-chip-won-fg"),
  P("text-amber-300", "text-ht-warn-fg"),
  P("text-amber-300/80", "text-ht-warn-fg/80"),
  // chips that moved from inline style to classes
  P("text-amber-300", "border border-ht-chip-won-edge bg-ht-chip-won-bg text-ht-chip-won-fg", "background: rgba(251,191,36,0.18); border: 1px solid rgba(251,191,36,0.3)"),
  P("text-slate-400", "border border-ht-chip-neutral-edge bg-ht-chip-neutral-bg text-ht-fg-muted", "background: rgba(51,65,85,0.5); border: 1px solid rgba(71,85,105,0.5)"),
  P("border border-slate-600/50 bg-slate-700/50 text-slate-400", "border border-ht-chip-neutral-edge bg-ht-chip-neutral-bg text-ht-fg-muted"),
  P("text-slate-400", "border border-ht-note-edge bg-ht-note-bg text-ht-fg-muted", "background: rgba(30,41,59,0.7); border: 1px solid rgba(71,85,105,0.4)"),
  P("text-amber-300", "border border-ht-claim-edge bg-ht-claim-bg text-ht-chip-won-fg", "border: 1px solid rgba(251,191,36,0.35); background: rgba(251,191,36,0.12)"),
  P("border border-amber-300/35 bg-amber-300/10 text-amber-300", "border border-ht-claim-edge bg-ht-claim-bg text-ht-chip-won-fg", "", "", "ranked-places claim pill unified with the points-target one: 2/255 levels at 10-12% alpha (Phase 4 handoff)"),
  P("border border-rose-400/60 bg-rose-950/30 text-rose-300", "border border-ht-loss-fg/60 bg-ht-danger-wash text-ht-danger-fg"),
  P("bg-slate-800/80", "bg-ht-panel-soft"),
  // prize card inline background / border
  P("", "", "background: #111827; border: 1.5px solid rgba(251,191,36,0.4)", "background: var(--ht-prize-card-bg); border: 1.5px solid rgba(251,191,36,0.4)"),
  P("", "", "background: linear-gradient(135deg, #1c1400, #2d1f00); border: 1.5px solid rgba(251,191,36,0.4)", "background: var(--ht-prize-won-bg); border: 1.5px solid var(--ht-prize-won-edge)"),
  // VenueHubClient
  P("border border-cyan-400/45 bg-cyan-400/10", "border border-ht-accent/45 bg-ht-accent/10"),
  P("text-amber-200/85", "text-ht-countdown/85"),
  P("", "text-ht-gold-fg", "color: var(--ht-accent-gold, #fbbf24)", ""),
  P("border border-cyan-400/50 bg-cyan-400/15 text-cyan-200", "border border-ht-accent/50 bg-ht-accent/15 text-ht-accent-soft"),
  P("border border-rose-400/50 bg-rose-900/30 text-rose-200", "border border-ht-loss-fg/50 bg-ht-danger-wash-strong text-ht-danger-soft"),
  P("border border-emerald-400/50 bg-emerald-900/30 text-emerald-200", "border border-ht-gain-fg/50 bg-ht-success-wash text-ht-success-soft"),
  P("border border-cyan-400/40 bg-slate-900 shadow-[0_24px_48px_rgba(0,0,0,0.6)]", "border border-ht-accent/40 bg-ht-surface shadow-ht-popup"),
  P("bg-slate-800 text-slate-300", "bg-ht-elevated text-ht-fg-soft", "border: 1px solid rgba(255,255,255,0.12)", "border: 1px solid var(--ht-border-soft)"),
  P("text-white", "text-ht-fg-bright"),
  P("text-slate-300", "text-ht-fg-soft"),
  P("shadow-[0_12px_28px_rgba(0,0,0,0.5)]", "shadow-ht-loader"),
];
const rows = pairs
  .map((p, i) => `<div data-pair="${i}"><span class="${p.old}" style="${p.oldStyle}" data-side="old">x</span><span class="${p.neu}" style="${p.newStyle}" data-side="new">x</span></div>`)
  .join("\n");
fs.writeFileSync(`${here}/pairs.html`, `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="pairs.css"></head><body style="background:#020617">\n${rows}\n</body></html>`);
fs.writeFileSync(`${here}/pairs.json`, JSON.stringify(pairs, null, 1));
console.log(pairs.length, "pairs");
