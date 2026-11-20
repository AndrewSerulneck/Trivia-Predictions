// Live Trivia round break / final standings when nobody has scored: say so instead of a blank board
// (docs/live-trivia-display-media-and-standings-plan.md D1).
export function EmptyBoard() {
  return (
    <p className="m-auto text-center" style={{ fontSize: 56, fontWeight: 800, color: "#94a3b8" }}>
      No scores yet.
    </p>
  );
}
