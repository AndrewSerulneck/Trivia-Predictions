export type EmceePhase = "pregame" | "rest_warning" | "mid_game_break" | "post_game";

const PREGAME_LINES = [
  "Doors are open, brains are warming up. Grab a drink and find your crew.",
  "Tonight is yours. Stretch those trivia muscles before the clock hits zero.",
  "Warm-up lap time. Pick a seat, pick a teammate, pick greatness.",
  "Countdown is live. Hydrate, focus, and get ready to buzz your brain.",
  "The room is heating up. Your first round is almost on deck.",
  "Big energy only. You are one countdown away from trivia glory.",
  "Find your game face and your lucky snack. Showdown starts soon.",
  "Champions are built in the warm-up. Lock in and enjoy the ride.",
];

const REST_UPBEAT_LINES = [
  "Nice hustle. Quick reset and stay sharp for the next one.",
  "Great pace. Keep stacking good answers, one question at a time.",
  "That round energy is strong. Keep it rolling.",
  "Breathe, sip, and refocus. The next prompt is coming fast.",
  "You are in rhythm now. Keep the momentum going.",
  "Room is buzzing. Trust your instincts on the next one.",
  "Short break, big potential. Eyes up for the next question.",
  "Stay calm, stay quick. You are playing smart.",
];

const REST_PLAYFUL_LINES = [
  "If that one felt tough, blame the question writer and move on.",
  "Thinking caps on. The next question might ask for your last two brain cells.",
  "If you guessed and it worked, we call that strategy.",
  "No panic. Even trivia legends miss one and bounce back.",
  "That question had spice. Good thing you brought answers.",
  "Team chat approved. Mild bragging permitted for 10 seconds.",
  "If your table got that instantly, we have questions.",
  "Short pause. Long debates about who was right are encouraged.",
];

const BREAK_UPBEAT_LINES = [
  "Break time. Stretch, celebrate, and get ready for the next round theme.",
  "Intermission vibes. Recharge now, then attack the next round.",
  "You made it through the set. Fresh round, fresh chances ahead.",
  "Round break in progress. Regroup and come back loud.",
  "Take five minutes to reset. The next category is coming in hot.",
  "Quick pit stop. Refill your drink and your confidence.",
  "Strong effort so far. Next round is your comeback or your crown.",
  "Break mode now. Championship mode soon.",
];

const BREAK_PLAYFUL_LINES = [
  "Break time. Settle any table disputes with snacks, not speeches.",
  "Intermission report: confidence up, overthinking down.",
  "Use this break wisely: hydrate and pretend you knew every answer.",
  "If your table is undefeated, we need to see ID.",
  "Five-minute break means five-minute victory dance window.",
  "Strategic timeout: order food, not panic.",
  "Round break reminder: loud guesses are still guesses.",
  "Reset complete soon. Greatness pending.",
];

const FINAL_RESULTS_LINES = [
  "Game over. Check the standings and settle the table debate.",
  "The final scores are locked. See where you finished above.",
  "That's a wrap on tonight's trivia. Well played.",
  "All rounds complete. The leaderboard has the final word.",
  "The winner has been decided. Check the top of the board.",
  "Tonight's game is in the books. Thanks for playing.",
  "Final standings are in. Come back and defend your rank next time.",
  "Game complete. The scoreboard doesn't lie.",
];

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickFrom(lines: string[], seed: string): string {
  if (lines.length === 0) return "";
  const idx = hashSeed(seed) % lines.length;
  return lines[idx] ?? lines[0] ?? "";
}

export function getEmceeLine(params: {
  phase: EmceePhase;
  scheduleId?: string;
  roundNumber?: number | null;
  questionIndex?: number | null;
  secondsRemaining: number;
  isFinalRound?: boolean;
}): string {
  const bucket = Math.floor(Math.max(0, params.secondsRemaining) / 6);
  const baseSeed = `${params.phase}:${params.scheduleId ?? "none"}:${params.roundNumber ?? 0}:${params.questionIndex ?? 0}:${bucket}`;

  if (params.phase === "pregame") {
    return pickFrom(PREGAME_LINES, baseSeed);
  }

  if (params.phase === "post_game" || params.isFinalRound) {
    return pickFrom(FINAL_RESULTS_LINES, baseSeed);
  }

  const playful = hashSeed(`${baseSeed}:tone`) % 2 === 1;
  if (params.phase === "rest_warning") {
    return playful ? pickFrom(REST_PLAYFUL_LINES, baseSeed) : pickFrom(REST_UPBEAT_LINES, baseSeed);
  }

  return playful ? pickFrom(BREAK_PLAYFUL_LINES, baseSeed) : pickFrom(BREAK_UPBEAT_LINES, baseSeed);
}
