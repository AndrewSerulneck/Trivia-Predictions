"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup } from "framer-motion";
import RoundStartReveal from "@/components/category-blitz/RoundStartReveal";
import LetterDieRoll from "@/components/category-blitz/LetterDieRoll";
import { AnsweringScreen } from "@/components/category-blitz/CategoryBlitzGame";
import GradingCascade, { type GradingAnswer } from "@/components/category-blitz/GradingCascade";
import LiveLeaderboard from "@/components/category-blitz/LiveLeaderboard";
import SessionCompleteFireworks from "@/components/category-blitz/SessionCompleteFireworks";
import SubmitLockAnimation from "@/components/category-blitz/SubmitLockAnimation";
import TimerUrgency from "@/components/category-blitz/TimerUrgency";
import ValidAnswerGlow from "@/components/category-blitz/ValidAnswerGlow";
import WrongLetterReject from "@/components/category-blitz/WrongLetterReject";
import CorrectBurst from "@/components/category-blitz/CorrectBurst";
import WrongVerdict from "@/components/category-blitz/WrongVerdict";
import CategoryBlitzModeFlipTakeover from "@/components/animations/CategoryBlitzModeFlipTakeover";
import {
  MODE_FLIP_VARIANTS,
  getModeFlipTakeoverVariant,
  setModeFlipTakeoverVariant,
  type ModeFlipDirection,
  type ModeFlipVariant,
} from "@/lib/categoryBlitzModes";

const MODE_FLIP_VARIANT_LABELS: Record<ModeFlipVariant, string> = {
  card: "Card turn",
  splitFlap: "Split-flap",
  overspin: "Overspin",
};

type DemoKey =
  | "reveal"
  | "revealMorph"
  | "letterDie"
  | "letterDieLate"
  | "letterDieMajority"
  | "cascade"
  | "leaderboard"
  | "fireworks"
  | "submitLock"
  | "timerUrgency"
  | "validGlow"
  | "wrongLetter"
  | "correctBurst"
  | "wrongVerdict"
  | "modeFlipCard"
  | "modeFlipSplitFlap"
  | "modeFlipOverspin"
  | "modeFlipCardStandard"
  | "modeFlipSplitFlapStandard"
  | "modeFlipOverspinStandard";

/** The letter-die demos: one entry each (a fourth demo is one more line). */
const LETTER_DIE_DEMOS = {
  letterDie: { late: false, reverse: false },
  letterDieLate: { late: true, reverse: false },
  letterDieMajority: { late: false, reverse: true },
} as const satisfies Record<string, { late: boolean; reverse: boolean }>;

const isLetterDieDemo = (demo: DemoKey | null): demo is keyof typeof LETTER_DIE_DEMOS =>
  demo !== null && demo in LETTER_DIE_DEMOS;

/** Demo controls sit one step above the die (its root is `z-10` in the panel's stacking context). */
const DEMO_CONTROL_Z = "z-20";

const DEMO_LABELS: Record<DemoKey, string> = {
  reveal: "Round start reveal",
  revealMorph: "Reveal → gameplay morph",
  letterDie: "Letter die roll",
  letterDieLate: "Letter die — letter 3 s late",
  letterDieMajority: "Letter die — Majority Rules",
  cascade: "Grading cascade",
  leaderboard: "Live leaderboard",
  fireworks: "Session complete fireworks",
  submitLock: "Submit lock",
  timerUrgency: "Timer urgency",
  validGlow: "Valid answer glow",
  wrongLetter: "Wrong letter reject",
  correctBurst: "Correct burst",
  wrongVerdict: "Wrong verdict",
  modeFlipCard: "Mode flip — card turn (→ reverse)",
  modeFlipSplitFlap: "Mode flip — split-flap (→ reverse)",
  modeFlipOverspin: "Mode flip — overspin (→ reverse)",
  modeFlipCardStandard: "Mode flip — card turn (→ standard)",
  modeFlipSplitFlapStandard: "Mode flip — split-flap (→ standard)",
  modeFlipOverspinStandard: "Mode flip — overspin (→ standard)",
};

const DEMO_KEY_TO_MODE_FLIP_VARIANT: Partial<Record<DemoKey, ModeFlipVariant>> = {
  modeFlipCard: "card",
  modeFlipSplitFlap: "splitFlap",
  modeFlipOverspin: "overspin",
  modeFlipCardStandard: "card",
  modeFlipSplitFlapStandard: "splitFlap",
  modeFlipOverspinStandard: "overspin",
};

const DEMO_KEY_TO_MODE_FLIP_DIRECTION: Partial<Record<DemoKey, ModeFlipDirection>> = {
  modeFlipCardStandard: "toStandard",
  modeFlipSplitFlapStandard: "toStandard",
  modeFlipOverspinStandard: "toStandard",
};

const MOCK_GRADING_ANSWERS: GradingAnswer[] = [
  { category: "Fruits", answer: "Mango", reason: "correct", points: 2 },
  { category: "Desserts", answer: "Mint Mousse", reason: "correct", points: 3, alliterationBonus: 1 },
  { category: "Countries", answer: "France", reason: "duplicate", explanation: "used by another player", points: 0 },
  { category: "Animals", answer: "Mongoose", reason: "wrong_letter", explanation: "wrong letter", points: 0 },
  { category: "Movies", answer: "Moonrise", reason: "invalid", explanation: "not a movie", points: 0 },
];

const MOCK_LEADERBOARD_ENTRIES = [
  { userId: "me", username: "You", points: 14 },
  { userId: "p2", username: "Alex", points: 12 },
  { userId: "p3", username: "Jordan", points: 8 },
];

/** Standalone preview of the reveal → gameplay handoff (Phase 3): plays the
 *  full RoundStartReveal, then swaps to a mock AnsweringScreen exactly like
 *  CategoryBlitzGame.tsx does, so the shared-layoutId morph can be checked
 *  without needing a live venue session or a real round to reach "answering". */
const RevealMorphDemo = () => {
  const [showReveal, setShowReveal] = useState(true);
  const mockCategories = ["Fruits", "Countries", "Animals", "Movies", "Sports", "Colors"];

  return (
    <LayoutGroup>
      {showReveal ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
          <RoundStartReveal
            letter="M"
            categories={mockCategories}
            onDone={() => setShowReveal(false)}
          />
        </div>
      ) : (
        <AnsweringScreen
          letter="M"
          categories={mockCategories}
          roundId="demo-round"
          timeRemaining={175}
          venueId="demo-venue"
          userId="demo-user"
          playerCount={3}
          morphFromReveal
        />
      )}
    </LayoutGroup>
  );
};

const DIE_DEMO_CATEGORIES = ["Fruits", "Countries", "Animals", "Movies", "Sports", "Colors"];
const DIE_DEMO_BREAK_MS = 7000;
const DIE_DEMO_LATE_MS = 3000;

/** The letter die over a mock break (docs/category-blitz-letter-die-plan.md, Phase 3):
 *  a 7 s countdown, the die tumbles for the last 5 s, the letter "arrives" when the
 *  countdown ends (or 3 s later), and the die flies into a mock AnsweringScreen badge
 *  through the shared layoutId — no venue session needed. Replay remounts it. */
const LetterDieDemo = ({ late, reverse }: { late: boolean; reverse: boolean }) => {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [showBoard, setShowBoard] = useState(false);
  const breakEndsAt = startedAt + DIE_DEMO_BREAK_MS;
  const letterAt = breakEndsAt + (late ? DIE_DEMO_LATE_MS : 0);
  const arrived = now >= letterAt;

  useEffect(() => {
    if (arrived) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [arrived]);

  const nextRoundStartsIn = now < breakEndsAt ? Math.ceil((breakEndsAt - now) / 1000) : 0;

  return (
    <LayoutGroup>
      {showBoard ? (
        <AnsweringScreen
          letter="M"
          categories={DIE_DEMO_CATEGORIES}
          roundId="demo-die-round"
          timeRemaining={175}
          venueId="demo-venue"
          userId="demo-user"
          playerCount={3}
          mode={reverse ? "reverse" : "standard"}
          morphFromReveal
          cascadeRows
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-black text-white">Round {reverse ? 4 : 3} results</p>
          <p className="text-footnote font-bold text-slate-400">Next round in</p>
          <p className="text-4xl font-black tabular-nums text-white">{nextRoundStartsIn}</p>
        </div>
      )}
      <LetterDieRoll
        letter={arrived ? "M" : null}
        nextRoundStartsIn={nextRoundStartsIn}
        roundStartedAtMs={arrived ? letterAt : null}
        reverse={reverse && arrived}
        onStageChange={(stage) => {
          if (stage === "flying") setShowBoard(true);
        }}
        onDone={({ flew }) => {
          if (!flew) setShowBoard(true);
        }}
      />
    </LayoutGroup>
  );
};

const DevAnimationPanel = () => {
  const [demo, setDemo] = useState<DemoKey | null>(null);
  const [demoRun, setDemoRun] = useState(0);
  const [open, setOpen] = useState(false);
  // Which variant CategoryBlitzGame's real trigger site actually plays for a
  // live "Blend In!" round — independent of whichever variant is being
  // previewed below via the demo buttons.
  const [liveVariant, setLiveVariant] = useState<ModeFlipVariant>(() => getModeFlipTakeoverVariant());

  return (
    <>
      <div
        data-category-blitz-dev-only
        className="fixed bottom-12 right-2 z-[999] flex max-h-[70vh] w-56 flex-col overflow-hidden rounded-lg border border-amber-400/40 bg-slate-900/95 text-xs text-white shadow-xl"
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="px-3 py-2 text-left font-black uppercase tracking-wide text-amber-300"
        >
          Animations {open ? "▾" : "▸"}
        </button>
        {open && (
          <>
            <div className="flex flex-col gap-1 border-b border-amber-400/20 px-2 pb-2 pt-1">
              <p className="text-caption font-black uppercase tracking-wide text-slate-400">Live mode-flip variant</p>
              <div className="flex gap-1">
                {MODE_FLIP_VARIANTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setModeFlipTakeoverVariant(v); setLiveVariant(v); }}
                    className={`flex-1 rounded px-1.5 py-1 text-caption font-bold ${
                      liveVariant === v ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {MODE_FLIP_VARIANT_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1 overflow-y-auto px-2 pb-2 pt-1">
              {(Object.keys(DEMO_LABELS) as DemoKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDemo(key);
                    setDemoRun((n) => n + 1);
                  }}
                  className="rounded bg-slate-800 px-2 py-1 text-left text-white hover:bg-slate-700"
                >
                  {DEMO_LABELS[key]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {demo && (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-950/95">
          <button
            type="button"
            onClick={() => setDemo(null)}
            className={`absolute right-4 top-4 ${DEMO_CONTROL_Z} rounded-full bg-slate-800 px-3 py-1 text-xs font-black uppercase text-white`}
          >
            Close
          </button>

          {/* revealMorph gets its own full-bleed container (matching
              CategoryBlitzGame's own root shape — no centering/padding) since
              AnsweringScreen needs real flex height for its sticky header +
              scroll list, unlike the other demos below. */}
          {demo === "revealMorph" && (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <RevealMorphDemo />
            </div>
          )}

          {isLetterDieDemo(demo) && (
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <LetterDieDemo
                key={demoRun}
                late={LETTER_DIE_DEMOS[demo].late}
                reverse={LETTER_DIE_DEMOS[demo].reverse}
              />
              <button
                type="button"
                onClick={() => setDemoRun((n) => n + 1)}
                className={`absolute bottom-4 left-4 ${DEMO_CONTROL_Z} rounded-full bg-slate-800 px-3 py-1 text-caption font-black uppercase text-white`}
              >
                Replay
              </button>
            </div>
          )}

          {demo !== "revealMorph" && !isLetterDieDemo(demo) && (
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
            {demo === "reveal" && (
              <RoundStartReveal
                letter="M"
                categories={["Fruits", "Countries", "Animals", "Movies"]}
                onDone={() => undefined}
              />
            )}

            {demo === "cascade" && (
              <GradingCascade answers={MOCK_GRADING_ANSWERS} onComplete={() => undefined} />
            )}

            {demo === "leaderboard" && (
              <LiveLeaderboard entries={MOCK_LEADERBOARD_ENTRIES} meId="me" />
            )}

            {demo === "fireworks" && (
              <AnimatePresence>
                <SessionCompleteFireworks
                  finalStandings={[
                    { username: "You", points: 14 },
                    { username: "Alex", points: 12 },
                    { username: "Jordan", points: 8 },
                  ]}
                  onDone={() => setDemo(null)}
                />
              </AnimatePresence>
            )}

            {demo === "submitLock" && (
              <SubmitLockAnimation answersCount={4} onComplete={() => undefined} />
            )}

            {demo === "timerUrgency" && (
              <div className="flex flex-col items-center gap-4">
                <TimerUrgency timeRemaining={8} label="Panic" />
                <TimerUrgency timeRemaining={20} label="Alert" />
                <TimerUrgency timeRemaining={60} label="Calm" />
              </div>
            )}

            {demo === "validGlow" && (
              <div className="relative h-12 w-64 rounded-lg border border-emerald-400/40 bg-slate-900">
                <ValidAnswerGlow />
              </div>
            )}

            {demo === "wrongLetter" && (
              <WrongLetterReject shakeToken="demo">
                <div className="h-12 w-64 rounded-lg border border-rose-400/40 bg-slate-900" />
              </WrongLetterReject>
            )}

            {demo === "correctBurst" && (
              <div className="relative h-32 w-32">
                <CorrectBurst points="+2" />
              </div>
            )}

            {demo === "wrongVerdict" && (
              <WrongVerdict answer="Mongoose" explanation="not a movie" />
            )}

          </div>
          )}

          {DEMO_KEY_TO_MODE_FLIP_VARIANT[demo] && (
            <CategoryBlitzModeFlipTakeover
              payload={{
                modeFlipVariant: DEMO_KEY_TO_MODE_FLIP_VARIANT[demo],
                modeFlipDirection: DEMO_KEY_TO_MODE_FLIP_DIRECTION[demo],
              }}
              onComplete={() => setDemo(null)}
            />
          )}
        </div>
      )}
    </>
  );
};


export default DevAnimationPanel;
