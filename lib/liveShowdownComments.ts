export type LiveShowdownCommentTrigger =
  | "answer_correct"
  | "answer_incorrect"
  | "answer_unsubmitted"
  | "pregame_intro"
  | "round_start"
  | "round_break";

const CORRECT_SUBMISSION_COMMENTS = [
  "Good job! Mild bragging permitted for 10 seconds.",
  "Clean hit. Keep that same energy.",
  "Boom. You read that perfectly.",
  "Nice work, sharpshooter.",
  "Correct again. The room noticed.",
  "That was smooth. Keep stacking points.",
  "You made that look easy.",
  "Big brain moment. Respect.",
  "Laser focus. Great answer.",
  "Right on cue. You are rolling.",
  "Clutch answer. Keep pressing.",
  "You nailed it. Crowd goes wild.",
  "Confident and correct. Love that.",
  "Excellent pull. Two points secured.",
  "Strong answer. Keep the streak alive.",
  "Lucky guess, don't get cocky.",
  "Alright, Einstein, let's see you handle the next one.",
  "Okay, superstar, save some points for the rest of us.",
  "Sure, sure, that one was \"totally obvious.\"",
  "Nice flex. Try not to celebrate too early.",
  "You got it right. Coincidence? Maybe.",
  "Even a broken clock gets this one, but nice work.",
  "That confidence is loud. Back it up next question.",
  "You cooked on that one. Don't burn the next.",
  "Someone's feeling dangerous tonight.",
  "Bold answer. Correct answer. We see you.",
  "Textbook response. No notes.",
  "You just bought yourself bragging rights.",
  "Pinpoint accuracy. Keep moving.",
  "That answer had main-character energy.",
  "Perfect timing, perfect answer.",
  "Two points and a little swagger, fair trade.",
  "Cool under pressure. That's how it's done.",
  "You cracked it. Keep the table hot.",
  "Strong answer, legend mode unlocked.",
] as const;

const INCORRECT_SUBMISSION_COMMENTS = [
  "Tough one. Shake it off and fire again.",
  "No points there, but your comeback starts now.",
  "Missed it this time. Plenty of game left.",
  "Close call. Reset and hunt the next one.",
  "No sweat. One answer never defines the night.",
  "Stay calm. The next question is fresh points.",
  "That one stung a little. Keep moving.",
  "Misses happen. Great teams answer back fast.",
  "You are still in this. Keep swinging.",
  "Ouch. Quick reset, next up.",
  "Wrong this round, not done for the night.",
  "Pressure moment missed. Next one is yours.",
  "Keep your head up. Momentum can flip instantly.",
  "Take a breath and trust the next instinct.",
  "No points there. Plenty of runway ahead.",
  "Ouch. My grandma got that one right, and she watches sitcoms.",
  "Yikes. Let's pretend that was a tactical pass.",
  "That answer took a scenic route to nowhere.",
  "Bold strategy. Questionable destination.",
  "Your confidence was high; your accuracy was... adventurous.",
  "That guess had vibes, not evidence.",
  "Did we submit that with our eyes closed?",
  "Swing and miss. The bat speed was impressive though.",
  "Not this one. The trivia gods remain unconvinced.",
  "That answer needs a replay review.",
  "If confidence scored points, you'd be leading.",
  "Wrong turn. Great effort on the road trip.",
  "That pick went left when it should've gone right.",
  "Let's file that under \"learning experience.\"",
  "That answer was brave. Accuracy declined comment.",
  "Oof. Dust off and bounce back.",
  "Not ideal, but the comeback story writes itself.",
  "Missed connection with the correct answer.",
  "That one got away. Next one won't.",
  "No points this time. Big response loading.",
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
  "You survived that round. Next one wants smoke.",
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
  if (trigger === "answer_unsubmitted") {
    return pickFromBank(UNSUBMITTED_WELCOME_COMMENTS, eventKey);
  }
  return pickFromBank(TRANSITION_AND_PREGAME_COMMENTS, eventKey);
}
