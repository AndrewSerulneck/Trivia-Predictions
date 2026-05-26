# Hightop Challenge — Web UI Kit

The player-facing mobile web app, recreated as a click-through prototype.

## What's inside

| File | Role |
|------|------|
| `index.html` | Interactive demo with a screen switcher and iOS phone frame |
| `ios-frame.jsx` | Phone device chrome (status bar, bezel, home indicator) |
| `components.jsx` | Shared primitives — `Eyebrow`, `AccentCard`, `Button`, `ExitPill`, `StatusBadge`, `FeedbackBanner`, `GameTile`, `TopBar`, `BottomNav`, `formatCountdown` |
| `screens.jsx` | Five core screens — `JoinScreen`, `VenueHub`, `GameLanding`, `LiveShowdown`, `Leaderboard` |

## Screens

1. **Join** — anonymous username pinned to a venue, cyan accent card.
2. **Venue Hub** — vertical rail of gradient game tiles, amber lobby countdown
   for the next Live Trivia.
3. **Game Landing** — full-bleed gradient rules card. Re-renders for any of the
   five games; the gradient is the game's identity.
4. **Live Showdown** — the **north-star** screen. Cycles through the three
   game phases (answering → reveal → intermission). Tap *Step phase →* to
   walk it.
5. **Leaderboard** — dark rebuild of the leaderboard table that replaces the
   legacy wood-frame `#4a2e18` / Kalam look.

## Conventions

- **Mobile-first.** Phone frame is fixed at the iOS Pro width — the real app
  tops out around 28rem (448px) of content width.
- **One canvas, one card.** Every surface is `--ht-surface` on `--ht-canvas`.
  Section meaning is communicated by the **border accent**, not by a
  different background.
- **The exit pill is the only warm element on screen.** Used for Back / Close
  / Leave. Never tinted with rose.
- **Game gradient runs continuously** from hub tile → landing card → live
  game. If you build a new game, you pick one of the four gradients (or
  define a fifth following the same `linear-gradient(~130deg, A, B, C)`
  recipe) and use it everywhere that game shows up.

## How `screens.jsx` uses `components.jsx`

Every screen receives a `navigate(key)` callback from `index.html`'s App
state machine. Screens are decoupled from the router — they only know about
keys (`"hub"`, `"live"`, etc.), not routes. This is how you'd modularize for
Next.js: each screen becomes a `page.tsx`, and `navigate` becomes
`router.push("/...")`.

## Known shortcuts (this is a kit, not production code)

- The Live Showdown phase machine cycles on a button, not on a server poll.
  In real life, `app/trivia/live/page.tsx` polls `/api/trivia/live/state`
  every second.
- The bingo / pick'em / fantasy *in-game* screens aren't recreated — only
  the landing rules card is. The original repo has 50+kb of bingo-specific
  components that aren't part of the visual language the rebuild needs to
  understand.
- The hamburger drawer (`LeftHamburgerMenu`) is stubbed as a top-bar button
  that doesn't open anything.
- No real auth, no real venue geolocation, no ads.

## Wiring components into a new screen

```jsx
function MyScreen({ navigate }) {
  return (
    <main style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
      <AccentCard accent="cyan">
        <Eyebrow accent="cyan">Section label</Eyebrow>
        <h2 className="ht-h2">Card title</h2>
        <p className="ht-body">Body copy here.</p>
        <Button variant="primary" full onClick={() => navigate("next")}>
          Primary CTA
        </Button>
      </AccentCard>
      <ExitPill onClick={() => navigate("hub")}>Back to Venue</ExitPill>
    </main>
  );
}
```

That's the full recipe — accent the card, accent the eyebrow, end with an
exit pill. The bottom nav is mounted by the shell, not by the screen.
