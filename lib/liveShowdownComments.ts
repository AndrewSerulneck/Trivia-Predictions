export type LiveShowdownCommentTrigger =
  | "answer_correct"
  | "answer_incorrect"
  | "answer_unsubmitted_late_joiner"
  | "answer_unsubmitted_inactive"
  | "pregame_intro"
  | "round_start"
  | "round_break"
  | "closest_guess_pending"
  | "game_final_question"
  | "scoring_streak";

const CORRECT_SUBMISSION_COMMENTS = [
  "Spot on! That's how you set the tone.",
  "Bullseye. The room felt that one.",
  "Sharp answer, smooth delivery.",
  "We've got a genius in the room!",
  "Right answer, right on time.",
  "That was clean. Keep the streak alive.",
  "Excellent read. Points are yours.",
  "Nailed it. Crowd energy just jumped.",
  "Locked in and correct.",
  "Clutch answer. Big momentum swing.",
  "Brilliant pull from the trivia vault.",
  "You made that look easy.",
  "Perfect hit. Keep rolling.",
  "Textbook response. No notes.",
  "You called it with confidence.",
  "That's championship trivia form.",
  "Pinpoint accuracy. Love to see it.",
  "Huge answer. Table's buzzing now.",
  "Boom. Correct and composed.",
  "Top-shelf trivia right there.",
  "You just lit up the scoreboard.",
  "That answer had star power.",
  "Crisp, quick, and correct.",
  "Another one in the win column.",
  "Big brain move. Respect.",
  "You were ready for that one.",
  "Right on cue. Strong stuff.",
  "Excellent timing, excellent answer.",
  "You're cooking now. Keep it hot.",
  "That was a pressure-proof answer.",
  "Two points and pure style.",
  "What a read. Nicely done.",
  "Dialed in. That's a beauty.",
  "You owned that round.",
  "A+ answer. Keep hunting.",
] as const;

const INCORRECT_SUBMISSION_COMMENTS = [
  "Oof, so close. Next one is yours.",
  "Tough miss. Quick reset and reload.",
  "No points there, but the comeback is live.",
  "Good swing. Let's catch the next one.",
  "Missed this round, not the whole game.",
  "The brain gears are turning. Keep it moving!",
  "Close call. Fresh points incoming.",
  "Shake it off. Momentum flips fast.",
  "Wrong this time, dangerous next time.",
  "Not quite. Stay locked in.",
  "That one slipped away. Next up.",
  "Quick breath, quick rebound.",
  "Great effort. Better answer loading.",
  "No stress. You're still in it.",
  "Almost had it. Keep the pressure on.",
  "A near miss and a fast recovery.",
  "That's a learning rep. Onward.",
  "No harm done. New question, new shot.",
  "The guess was bold. Next one goes in.",
  "Misses happen. Winners answer back.",
  "That one got away by inches.",
  "Reset complete. Next prompt, big energy.",
  "No points now, big chance next.",
  "So close you could hear it.",
  "Good try. Keep the engine warm.",
  "Not this one. The next one is open season.",
  "Still plenty of runway left tonight.",
  "That was a test swing. Full contact next.",
  "Close, but no cigar. Keep rolling.",
  "Missed the mark, not the mission.",
  "No score this round. Rally mode on.",
  "Keep calm and hunt the next answer.",
  "You're one good answer from a hot streak.",
  "That one bounced out. Next one drops.",
  "Stay sharp. The board turns fast.",
] as const;

const TRANSITION_AND_PREGAME_COMMENTS = [
  "Countdown is live. Grab your crew and lock in.",
  "Warm-up mode: drinks up, brains on.",
  "Opening round is near. Pick your trivia captain now.",
  "The room is buzzing. Start strong when the clock hits zero.",
  "Pregame is almost over. Showtime is next.",
  "Bring your best first answer. Momentum matters early.",
  "Game face check. You are almost up.",
  "Eyes on the clock. Opening tip is close.",
  "This room is about to get loud.",
  "Settle in. The first category is coming.",
  "Round incoming. Trust your table and trust your gut.",
  "Break time. Breathe now, battle soon.",
  "Intermission energy: regroup, reload, return.",
  "Round transition in progress. Next category on deck.",
  "Quick break, then straight back to business.",
  "Use this window to reset and refocus.",
  "The next round is loading. Keep the chatter smart.",
  "Category reveal soon. Stay sharp.",
  "You survived that round. Next one is waiting.",
  "Round break means strategy time.",
  "Get ready. The next category could flip the board.",
  "Intermission update: tension is high and snacks are lower.",
  "New round soon. New points available.",
  "Pressure builds here. Great teams thrive in transitions.",
  "Round changeover complete soon. Bring fresh focus.",
  "Reset your table chemistry. The next round starts fast.",
  "Clock is moving. Come out of break aggressive.",
  "Category switch ahead. Adapt quickly.",
  "Round's about to pop. Stay ready.",
  "Break ending soon. The room expects fireworks.",
] as const;

const UNSUBMITTED_WELCOME_COMMENTS = [
  "Skipped this one. Jump in on the next question.",
  "Joining mid-round? Perfect timing for the next prompt.",
  "No submission on that one. Fresh question coming up.",
  "Question expired. New chance arrives in a moment.",
  "All good. Catch the next question and make it count.",
  "You are right on time for the next round of points.",
  "No answer logged this time. Stay ready for the next one.",
  "Quick reset. Next question is your on-ramp.",
] as const;

const CLOSEST_GUESS_PENDING_COMMENTS = [
  "Closest guess wins this one! Check below for the emcee's call.",
  "It's a numbers game — whoever got nearest takes the points.",
  "Nearest answer wins! The emcee is making the call below.",
  "No partial credit here — only the closest guess walks away with points.",
  "Your guess is in. Watch the emcee announcement below for the winner.",
  "Closest-guess round! The emcee will reveal who was nearest.",
  "It came down to the numbers. Winner gets full points — check below.",
  "Your answer is locked. The emcee's sorting out the closest guess now.",
] as const;

const UNSUBMITTED_INACTIVE_COMMENTS = [
  "No answer logged. Did your fingers fall asleep?",
  "Hello? Anyone home? The timer was ticking!",
  "Staring at the screen won't get you points. Type faster next time!",
  "No answer logged, stay ready for the next one.",
  "Clock hit zero and we got silence. Wake that trivia brain up.",
  "Time got away from us there. Jump right into the next one.",
  "No submission this round. Shake it off and fire on the next one.",
  "Frozen hands? Unfreeze for the next prompt.",
  "That timer moved faster than your thumbs that round.",
  "No answer in the books. Come back swinging next question.",
] as const;

const ROUND_START_COMMENTS = [
  "New round is LIVE! Show us what you've got.",
  "Lock in. The points are on the table.",
  "Fresh round, fresh chance. Let's go.",
  "Brains on, drinks ready — this round starts NOW.",
  "New category, new challenge. Come out swinging.",
  "The competition gets stiffer from here. Stay sharp.",
  "First question of the round. Set the tone.",
  "Whoever starts hot carries the momentum.",
  "This could be the round that flips everything.",
  "Let's see who's been doing their homework.",
  "Table chatter is over. Pure focus from here.",
  "Round is live. No hesitation, no second-guessing.",
  "New round means new points. Let's chase them.",
  "The real test starts now. Bring it.",
  "Here's where the standings actually move.",
  "Down in the standings? This is your reset button.",
  "Comfortable lead? Doesn't matter. Round is on.",
  "Trivia night gets decided in rounds like this.",
  "Alright everyone — eyes up, brains engaged.",
  "This round could be the one they talk about.",
] as const;

const GAME_FINAL_QUESTION_COMMENTS = [
  "FINAL QUESTION! This is it — everything on the line!",
  "Last chance to make your mark tonight. Give it everything.",
  "The game ends with this one. Make it count.",
  "Final. Question. Who wants bragging rights most?",
  "One answer stands between you and the finish line.",
  "The last question of the night. Nothing held back.",
  "The crowd is on the edge of their seats for this one.",
  "This answer could lock in a win or flip the whole game.",
  "The night comes down to THIS. Go.",
  "All the preparation, all the answers — and it ends here.",
  "One question. One shot. Everything riding on it.",
  "This is your last swing. Make it a home run.",
  "The room goes quiet. The final question is live.",
  "Last one. Whatever happens, it's been a battle. Now finish it.",
  "One final answer to write the ending of tonight's story.",
] as const;

const SCORING_STREAK_COMMENTS = [
  "THREE IN A ROW! This table is absolutely COOKING!",
  "A streak is building! The rest of the room is taking notes.",
  "Nobody's stopping this run. Keep the streak alive!",
  "The momentum is REAL. Can they keep it going?",
  "Locked in and on a roll. This is championship form.",
  "Consecutive correct answers! The other tables are nervous.",
  "Look at that streak! This is what confidence looks like.",
  "Answer after answer — clean, fast, correct. Textbook.",
  "The hot hand doesn't miss. Keep loading them up.",
  "A streak like this doesn't come without preparation. Respect.",
  "On fire tonight! The scoreboard says it all.",
  "They are in a groove nobody can touch right now.",
] as const;

function assertCommentBankIntegrity() {
  if (CORRECT_SUBMISSION_COMMENTS.length !== 35) {
    throw new Error("Live Showdown comments: correct submission bank must contain exactly 35 phrases.");
  }
  if (INCORRECT_SUBMISSION_COMMENTS.length !== 35) {
    throw new Error("Live Showdown comments: incorrect submission bank must contain exactly 35 phrases.");
  }
  if (TRANSITION_AND_PREGAME_COMMENTS.length !== 30) {
    throw new Error("Live Showdown comments: transition/pregame bank must contain exactly 30 phrases.");
  }

  const all = [
    ...CORRECT_SUBMISSION_COMMENTS,
    ...INCORRECT_SUBMISSION_COMMENTS,
    ...TRANSITION_AND_PREGAME_COMMENTS,
  ];
  const unique = new Set(all);
  if (all.length !== 100 || unique.size !== 100) {
    throw new Error("Live Showdown comments: bank must contain exactly 100 distinct phrases.");
  }
}

assertCommentBankIntegrity();

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickFromBank(bank: readonly string[], eventKey: string): string {
  if (bank.length === 0) return "";
  const index = hashSeed(eventKey) % bank.length;
  return bank[index] ?? bank[0] ?? "";
}

export function selectLiveShowdownComment(params: {
  trigger: LiveShowdownCommentTrigger;
  eventKey: string;
}): string {
  const { trigger, eventKey } = params;
  if (trigger === "answer_correct") {
    return pickFromBank(CORRECT_SUBMISSION_COMMENTS, eventKey);
  }
  if (trigger === "answer_incorrect") {
    return pickFromBank(INCORRECT_SUBMISSION_COMMENTS, eventKey);
  }
  if (trigger === "answer_unsubmitted_late_joiner") {
    return pickFromBank(UNSUBMITTED_WELCOME_COMMENTS, eventKey);
  }
  if (trigger === "answer_unsubmitted_inactive") {
    return pickFromBank(UNSUBMITTED_INACTIVE_COMMENTS, eventKey);
  }
  if (trigger === "closest_guess_pending") {
    return pickFromBank(CLOSEST_GUESS_PENDING_COMMENTS, eventKey);
  }
  if (trigger === "game_final_question") {
    return pickFromBank(GAME_FINAL_QUESTION_COMMENTS, eventKey);
  }
  if (trigger === "scoring_streak") {
    return pickFromBank(SCORING_STREAK_COMMENTS, eventKey);
  }
  if (trigger === "round_start") {
    return pickFromBank(ROUND_START_COMMENTS, eventKey);
  }
  return pickFromBank(TRANSITION_AND_PREGAME_COMMENTS, eventKey);
}
