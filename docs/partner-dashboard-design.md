# Partner Dashboard — Design Spec

Mobile-first console a venue owner ("partner") uses to run Hightop Challenge from
their phone. Dark-native, 390px-first, degrading up to tablet. This doc is the
source of truth Phases 3–5 reference; the full annotated mockups live in the
"Hightop Challenge Design System" Claude Design project (`Partner Dashboard.html`).

> **Brand-centralization rule:** every color/spacing value below is a design token.
> Consume them through the `ht-*` Tailwind utilities (backed by the `--ht-*` CSS
> vars in `app/globals.css` and mapped in `tailwind.config.ts`). **Never hardcode a
> hex** in a component — if a value isn't a token yet, add it to `globals.css` +
> `tailwind.config.ts` first.

---

## 1. Foundations

| Token | Value | Tailwind utility (repo) |
|---|---|---|
| canvas | `#020617` | `bg-ht-canvas` |
| surface (card) | `#0f172a` | `bg-ht-surface` |
| elevated (input/nested) | `#1e293b` | `bg-ht-elevated` |
| elevated-2 (input border) | `#334155` | `border-ht-elevated-2` |
| hairline border | `rgba(255,255,255,.08)` | `border-ht-hairline` |
| soft border | `rgba(255,255,255,.12)` | `border-ht-soft` |
| fg primary | `#f8fafc` | `text-ht-primary` |
| fg secondary | `#e2e8f0` | `text-ht-secondary` |
| fg muted | `#94a3b8` | `text-ht-muted` |
| card radius | 16px | `rounded-2xl` |
| input radius | 12px | `rounded-xl` |
| card shadow | `0 8px 24px rgba(0,0,0,.4)` | `shadow-ht-card` |
| focus ring | `border-cyan-400` + cyan halo | `focus:border-ht-cyan-400` |

**Type:** headings/game titles = **Bree Serif** (via `.ht-display` / `.ht-h1` /
`.ht-h2`, or any `font-black` element — globals maps those to Bree Serif); body/UI
= **Nunito** (UI 600, buttons & feedback 900). Changing numbers (amounts, invoices,
codes) use tabular mono (`--ht-font-mono`).

### Accent per screen — "the accent tells you where you are"

| Surface | Accent | Utility |
|---|---|---|
| Hub, Venue Display, focus rings | Cyan (home base) | `bg-ht-game-live` / `bg-ht-game-display` |
| Live Games — **Live Trivia** | Cyan → blue → violet | `bg-ht-game-live` |
| Live Games — **Category Blitz** *(new)* | Fuchsia → violet | `bg-ht-game-blitz` |
| Billing | Indigo (neutral) | `bg-ht-game-billing` |

> **Back / Exit is NOT an accent color anymore.** The warm red-orange "exit pill"
> (`--ht-exit-*` / `from-ht-exit-from …`) is **retired** — the navigation
> unification (`docs/navigation-unification-plan.md` §1a, §11b) replaced it
> app-wide, partner surfaces included, with the neutral dark slate circle
> `ExitBackButton` (`components/navigation/ExitBackButton.tsx`). The `--ht-exit-*`
> tokens and the Tailwind `ht.exit` scale were removed. See §2 "Back / Exit".

> **Category Blitz accent decision:** Category Blitz takes **fuchsia→violet** —
> distinct from Live Trivia's cyan while staying inside the game-identity gradient
> family. (Historically red-orange was "reserved for exit"; that constraint is
> gone now that exit is a neutral circle, but the fuchsia→violet choice stands.)
> These gradients were added to `app/globals.css` (`--ht-game-blitz`,
> `--ht-game-billing`, `--ht-game-display`) and `tailwind.config.ts`
> (`backgroundImage`).

---

## 2. Component Inventory

### Card
Default panel. `bg-ht-surface rounded-2xl border border-ht-hairline shadow-ht-card`.
Swaps the border to an accent at ~40% alpha when it carries section meaning
(e.g. `border-indigo-400/40` on the billing plan card).

### Status pill
`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black
uppercase tracking-wider` + leading dot. **Color = state:**
- emerald → `Live` / `Active` (dot pulses via `animate-ht-pulse` when live)
- cyan → `Scheduled`
- amber → `Next up`
- slate → `Ended` / `Coming soon`
- rose → `Payment due` (rose is errors/attention only — never back/exit)

### Buttons
All: `rounded-xl font-black min-h-11 border transition active:translate-y-px`.
- **Primary** — `bg-ht-cyan-500 text-slate-950` + cyan glow. The one committing action per screen.
- **Secondary** — `bg-ht-elevated border-ht-soft text-ht-primary`.

### Back / Exit
`ExitBackButton` (`components/navigation/ExitBackButton.tsx`) — a 34px
`border-white/10 bg-slate-900 text-slate-300` circle with a Lucide `ChevronLeft`,
**no warm tint**, never a raw `←` glyph. It renders in `OwnerShell`'s header back
slot (`backTo` prop), leading, above the logo block; `OwnerAccountMenu` (with
`SignOutButton variant="partner"`) sits trailing in the same row. On every
`/owner/*` page the header row sits on a dark background, so the default `dark`
tone is correct — no page passes `tone`. The retired warm "exit pill" is gone.

### List row
`flex gap-3 items-center bg-ht-surface rounded-[14px] border border-ht-hairline p-3`.
Left **date chip** (`bg-ht-elevated`, mono cyan month + Bree Serif day), center title +
sub-line with a game-type pill, trailing chevron `text-slate-500`. Past rows drop to
`opacity-70` and swap the pill to slate `Ended`. Invoice rows reuse the pattern
(date · description · mono amount · PDF link).

### Input & segmented control
Input: `bg-ht-elevated border border-ht-elevated-2 rounded-xl font-bold text-base`
(16px min — no iOS zoom). Focus: `border-ht-cyan-400` + cyan halo. Segmented control =
two option tiles; the selected tile previews its game accent (cyan / fuchsia).

### QR panel
The **one white surface** in the system (documented exception — QR needs quiet-zone
contrast to scan across a room). White plate `rounded-[14px]` with 12px quiet zone,
inside a surface card, above a mono copyable-URL row with a one-tap Copy button.

---

## 3. Screen Specs

### Hub  *(implemented — `app/owner/dashboard/page.tsx`)*
Venue switcher (multi-venue owners get a native-select overlay; single-venue owners
see a static header, no caret), then 3 tap targets, each with a live status line:
1. **Live Games** → amber "Next up · <game> <time>" (or nothing scheduled).
2. **Venue Display** → emerald "Display ready" (pulsing) / rose "Needs setup".
3. **Billing** → emerald "Active · Renews <date>" / rose "Payment due".

### Section 1 — Live Games  *(stub — `app/owner/schedule/page.tsx`; Phase 4)*
Header back circle (`OwnerShell backTo`) → primary "Schedule a game" → **Upcoming** list → **Past** list
(dimmed). Rows carry the game-type accent pill. **Empty state:** icon tile + "No
games on the board" + "Schedule a game" CTA (header CTA also persists).

**Schedule / edit form:** game-type segmented control (accent previews) · title
(optional, defaults to `<Game type> · <Date>`) · date (focus ring, native picker) ·
time + timezone paired row (tz defaults to venue zone) · primary "Schedule game" +
secondary "Save as draft". Edit reuses the layout; header verb + CTA swap.

### Section 2 — Venue Display  *(stub — `app/owner/display/page.tsx`; Phase 5)*
Large QR + copyable `hightop.gg/tv/<slug>` URL + numbered "open on the TV" steps
(with a short pairing code as no-camera fallback) + a live preview thumbnail of the
guest leaderboard. **Empty state:** "No display running yet" + "Start a display".

### Section 3 — Billing (Stripe)  *(backend done Phase 3; UI light-themed, re-skin pending)*
Subscription card (plan name, big amount, status pill, next billing date, cycle) ·
payment method row (brand ···· last4, expiry, "Update" → Stripe-hosted portal, no raw
card fields in-app) · invoice list (newest first, per-row PDF). Status pill maps to
Stripe: `active`→emerald, `past_due`→rose "Payment due", `cancelled`→slate.

---

## 4. Interaction Notes

**Loading**
- Skeletons (not spinners) for lists — shimmer ~1.4s on elevated surfaces.
- Buttons: label → centered spinner, width held, disabled.
- QR/display shows a shimmer plate until the session token resolves.
- Optimistic scheduling: new row inserts immediately, reconciles on ack.

**Error**
- Blunt, human copy — "Couldn't schedule that game." not "An error occurred."
- Inline field errors = rose 1px border + short reason under the field; toast summarizes.
- Stripe failures surface the real reason and route to Update payment method.
- Rose is errors only — never used for back/exit (which is the neutral dark circle).

**Success**
- Emerald toast, auto-dismiss ~3.5s, swipe/tap to clear.
- Echo the specifics (game name + time, copied URL, "Payment method updated").
- Bottom-anchored, `max(env(safe-area-inset-bottom),16px)`.
- Copy-to-clipboard fires a toast **and** flips the button to "Copied ✓" for 2s.

---

## Implementation status
- ✅ Foundations wired: `--ht-game-blitz` / `--ht-game-billing` / `--ht-game-display`
  added to `app/globals.css`; `backgroundImage` utilities in `tailwind.config.ts`.
- ✅ `OwnerShell` gained a `variant="dark"` (canvas, no white card); auth/billing
  pages keep `variant="light"`.
- ✅ Hub re-skinned to these tokens (`app/owner/dashboard/page.tsx`).
- ✅ Live Games / Venue Display stubs re-skinned (dark, empty state).
- ⏳ Billing UI (`app/owner/billing/*`) still light-themed — re-skin alongside Phase 4/5.
- ✅ Nav unification (`docs/navigation-unification-plan.md` Phase 5): the per-page
  "← Dashboard" links collapsed into `OwnerShell`'s header back circle
  (`ExitBackButton`) + `OwnerAccountMenu`; the warm exit pill is retired everywhere.
