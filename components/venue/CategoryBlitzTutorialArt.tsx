import { ALLITERATION_BONUS_POINTS } from "@/lib/categoryBlitzAlliteration";
import { POINTS_PER_UNIQUE_ANSWER } from "@/lib/categoryBlitzModes";
import type { CategoryBlitzTutorialArt as ArtKey } from "@/lib/categoryBlitzHowToPlay";

// Artwork for the 8 Category Blitz tutorial cards (copy lives in
// lib/categoryBlitzHowToPlay.ts). The scored-pair cards (unique, duplicate,
// alliteration) follow Andrew's example,
// docs/category-blitz-how-to-play/card-4-example.jpg: category word in the
// middle, an answer chip on each side with a "+N pts" box above and a player
// tile below. Everything is inline SVG + Tailwind — no images, no new font.

// ── Cards 1–2 (kept from the old tutorial) ───────────────────────────────────

const CB_CATEGORIES = [
  "Animal",
  "City",
  "Color",
  "Food",
  "Movie",
  "Musician",
  "Name",
  "Sport",
  "TV Show",
  "Vehicle",
  "Video Game",
  "Website",
] as const;

const CB_ANSWERS = [
  { cat: "Animal", val: "Aardvark", filled: true, typing: false },
  { cat: "City", val: "Athens", filled: true, typing: false },
  { cat: "Color", val: "Aqua...", filled: false, typing: true },
  { cat: "Food", val: "", filled: false, typing: false },
  { cat: "Movie", val: "Avatar", filled: true, typing: false },
  { cat: "Musician", val: "Adele", filled: true, typing: false },
] as const;

const CB_CATEGORY_COLORS = [
  "from-pink-500/80 to-rose-600/80",
  "from-violet-500/80 to-purple-600/80",
  "from-fuchsia-500/80 to-pink-600/80",
  "from-purple-500/80 to-indigo-600/80",
] as const;

const BoardArt = () => (
  <div className="w-full space-y-3">
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-300/40 bg-gradient-to-br from-amber-500/20 to-orange-600/20 px-5 py-2 shadow-[0_0_20px_rgba(251,191,36,0.25)]">
        <span className="text-caption font-bold uppercase tracking-wider text-amber-200/80">Letter</span>
        <span className="text-4xl font-black text-amber-100 [font-family:var(--ht-font-display)] [text-shadow:0_0_16px_rgba(251,191,36,0.5)]">
          A
        </span>
      </div>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {CB_CATEGORIES.map((cat, i) => (
        <div
          key={cat}
          className={`flex items-center justify-center rounded-lg border border-white/20 bg-gradient-to-br ${CB_CATEGORY_COLORS[i % CB_CATEGORY_COLORS.length]} px-1 py-1.5 text-center shadow-sm`}
        >
          <span className="text-caption font-bold leading-tight text-white/95">{cat}</span>
        </div>
      ))}
    </div>
    <div className="flex items-center justify-center">
      <span className="rounded-full border border-pink-300/30 bg-pink-500/10 px-3 py-1 text-caption font-semibold text-pink-200/80">
        3:00 to fill all 12
      </span>
    </div>
  </div>
);

const AnsweringArt = () => (
  <div className="w-full space-y-2">
    <div className="flex items-center justify-between rounded-lg border border-pink-300/30 bg-black/30 px-3 py-2">
      <span className="text-caption font-bold uppercase tracking-wider text-amber-300">Letter A</span>
      <span className="font-mono text-lg font-black text-amber-100">2:34</span>
    </div>
    <div className="space-y-1.5">
      {CB_ANSWERS.map((item) => (
        <div key={item.cat} className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-caption font-semibold text-pink-200/70">{item.cat}</span>
          <div
            className={`flex-1 rounded-md border px-2 py-1 text-caption font-medium ${
              item.filled
                ? "border-pink-300/40 bg-pink-500/20 text-white"
                : item.typing
                  ? "border-amber-300/50 bg-amber-500/15 text-amber-100"
                  : "border-white/15 bg-black/20 text-white/30"
            }`}
          >
            {item.val || "..."}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── Intro ────────────────────────────────────────────────────────────────────

const INTRO_TILES = [
  { letter: "C", tilt: "-rotate-12", tone: "from-pink-400 to-fuchsia-600", size: "h-14 w-14 text-3xl" },
  { letter: "A", tilt: "rotate-3", tone: "from-amber-300 to-orange-500", size: "h-20 w-20 text-5xl" },
  { letter: "B", tilt: "rotate-12", tone: "from-violet-400 to-purple-600", size: "h-14 w-14 text-3xl" },
] as const;

const IntroArt = () => (
  <div className="flex w-full items-center justify-center gap-3 py-2" aria-hidden="true">
    {INTRO_TILES.map((tile) => (
      <div
        key={tile.letter}
        className={`flex items-center justify-center rounded-2xl border-[3px] border-white/80 bg-gradient-to-br font-black text-white shadow-[0_8px_18px_rgba(30,5,20,0.45)] [font-family:var(--ht-font-display)] [text-shadow:0_2px_0_rgba(60,10,40,0.5)] ${tile.tone} ${tile.size} ${tile.tilt}`}
      >
        {tile.letter}
      </div>
    ))}
  </div>
);

// ── Card 3: stopwatch ────────────────────────────────────────────────────────

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  return {
    x1: 50 + Math.sin(angle) * 33,
    y1: 56 - Math.cos(angle) * 33,
    x2: 50 + Math.sin(angle) * (i % 3 === 0 ? 27 : 30),
    y2: 56 - Math.cos(angle) * (i % 3 === 0 ? 27 : 30),
  };
});

const TimerArt = () => (
  <div className="flex w-full flex-col items-center gap-2" aria-hidden="true">
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 100 106" className="h-full w-full">
        <rect x="43" y="4" width="14" height="9" rx="2" className="fill-amber-300" />
        <rect x="76" y="16" width="10" height="7" rx="2" transform="rotate(45 81 19.5)" className="fill-amber-300" />
        <circle cx="50" cy="56" r="40" className="fill-[#3b0624] stroke-amber-300" strokeWidth="6" />
        {TICKS.map((tick, i) => (
          <line key={i} {...tick} className="stroke-amber-100/70" strokeWidth={i % 3 === 0 ? 3 : 1.6} strokeLinecap="round" />
        ))}
      </svg>
      {/* The hand sweeps only for players who allow motion. */}
      <div className="absolute inset-x-0 bottom-0 top-[5.66%] flex items-center justify-center">
        <div className="relative h-[75%] w-[75%] motion-safe:animate-[spin_6s_linear_infinite]">
          <div className="absolute bottom-1/2 left-1/2 h-[42%] w-1 -translate-x-1/2 rounded-full bg-pink-300" />
          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-300" />
        </div>
      </div>
    </div>
    <span className="rounded-xl border-2 border-amber-300/60 bg-black/30 px-4 py-1 font-mono text-3xl font-black text-amber-100 [text-shadow:0_0_14px_rgba(251,191,36,0.45)]">
      3:00
    </span>
  </div>
);

// ── Scored-pair cards: answer chips, points boxes, player tiles ───────────────────────────

const POINTS_BOX_TONES = {
  gain: "bg-amber-400 text-[#4a052c] shadow-[0_0_12px_rgba(251,191,36,0.5)]",
  none: "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]",
} as const;

// The points read "+2 pts" / "0 pts" in a solid box; "pts" is smaller than the number.
const PointsBox = ({ points, tone }: { points: string; tone: keyof typeof POINTS_BOX_TONES }) => (
  <span
    className={`whitespace-nowrap rounded-xl border-2 border-white/85 px-3 py-1 text-[26px] font-black leading-none [font-family:var(--ht-font-display)] ${POINTS_BOX_TONES[tone]}`}
  >
    {points}
    <span className="ml-1 text-[15px]">pts</span>
  </span>
);

const BonusTag = ({ label }: { label: string }) => (
  <span className="rounded-full border-2 border-amber-300 bg-amber-400 px-2 py-0.5 text-center text-caption font-black leading-tight text-[#4a052c] shadow-[0_0_12px_rgba(251,191,36,0.55)]">
    {label}
  </span>
);

const AnswerChip = ({ answer }: { answer: string }) => (
  <span className="max-w-full rounded-xl bg-white px-2 py-1.5 text-center text-[16px] font-bold leading-tight text-slate-800 shadow-[0_3px_0_rgba(60,10,40,0.45)]">
    {answer}
  </span>
);

type Person = "sam" | "jess" | "maya" | "leo" | "kai";

type HairStyle = "short" | "long" | "bun" | "curly";

type PersonLook = { bg: string; skin: string; hair: string; shirt: string; style: HairStyle };

const PERSON_LOOKS: Record<Person, PersonLook> = {
  sam: { bg: "bg-sky-400", skin: "fill-amber-200", hair: "fill-amber-900", shirt: "fill-red-500", style: "short" },
  jess: { bg: "bg-violet-400", skin: "fill-orange-200", hair: "fill-yellow-400", shirt: "fill-teal-500", style: "long" },
  maya: { bg: "bg-amber-300", skin: "fill-amber-700", hair: "fill-stone-900", shirt: "fill-fuchsia-500", style: "bun" },
  leo: { bg: "bg-emerald-400", skin: "fill-orange-300", hair: "fill-orange-700", shirt: "fill-blue-600", style: "curly" },
  kai: { bg: "bg-pink-400", skin: "fill-amber-800", hair: "fill-stone-900", shirt: "fill-amber-400", style: "short" },
};

const PersonFace = ({ person, sad = false }: { person: Person; sad?: boolean }) => {
  const look = PERSON_LOOKS[person];
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden="true">
      {look.style === "long" ? <path d="M8 21 Q8 7 20 7 Q32 7 32 21 L33 34 L7 34 Z" className={look.hair} /> : null}
      <path d="M5 41 Q5 31 20 31 Q35 31 35 41 Z" className={look.shirt} />
      <circle cx="20" cy="20" r="11" className={look.skin} />
      {look.style === "curly" ? (
        <g className={look.hair}>
          <circle cx="11" cy="15" r="4.5" />
          <circle cx="15" cy="10.5" r="4.5" />
          <circle cx="20" cy="9" r="4.5" />
          <circle cx="25" cy="10.5" r="4.5" />
          <circle cx="29" cy="15" r="4.5" />
        </g>
      ) : (
        <path d="M8.5 19 Q8.5 7.5 20 7.5 Q31.5 7.5 31.5 19 Q28 13 20 13.5 Q12 13 8.5 19 Z" className={look.hair} />
      )}
      {look.style === "bun" ? <circle cx="20" cy="5.5" r="4" className={look.hair} /> : null}
      <circle cx="16" cy="20.5" r="1.5" className="fill-slate-900" />
      <circle cx="24" cy="20.5" r="1.5" className="fill-slate-900" />
      <circle cx="13.5" cy="24" r="1.6" className="fill-pink-400/50" />
      <circle cx="26.5" cy="24" r="1.6" className="fill-pink-400/50" />
      {sad ? (
        <>
          <path d="M13.5 17 L17.5 15.8 M26.5 17 L22.5 15.8" className="fill-none stroke-slate-900" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M16.5 27.5 Q20 24 23.5 27.5" className="fill-none stroke-slate-900" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M24 22.5 Q22.8 24.6 24 25.4 Q25.2 24.6 24 22.5 Z" className="fill-sky-400" />
        </>
      ) : (
        <path d="M16.5 25 Q20 28.5 23.5 25" className="fill-none stroke-slate-900" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
};

const PlayerTile = ({ name, person, sad = false }: { name: string; person: Person; sad?: boolean }) => (
  <div className="flex w-[76px] flex-col items-center rounded-lg bg-white p-1 shadow-[0_4px_10px_rgba(30,5,20,0.45)]">
    <div className={`aspect-square w-full overflow-hidden rounded-md ${PERSON_LOOKS[person].bg}`}>
      <PersonFace person={person} sad={sad} />
    </div>
    <span className="pt-0.5 text-footnote font-bold leading-tight text-slate-700">{name}</span>
  </div>
);

type ScoredSide = {
  answer: string;
  player: string;
  person: Person;
  bonus?: string;
  /** A shared answer: a red "0 pts" box and a sad player. */
  noPoints?: boolean;
};

const ScoredColumn = ({ side }: { side: ScoredSide }) => (
  <div className="flex min-w-0 flex-col items-center gap-2">
    {side.bonus ? <BonusTag label={side.bonus} /> : null}
    {side.noPoints ? <PointsBox points="0" tone="none" /> : <PointsBox points={`+${POINTS_PER_UNIQUE_ANSWER}`} tone="gain" />}
    <AnswerChip answer={side.answer} />
    <PlayerTile name={side.player} person={side.person} sad={side.noPoints} />
  </div>
);

// The category sits in its own banner above both answers, so it reads as the
// prompt rather than as a third answer.
const ScoredPairArt = ({ category, left, right }: { category: string; left: ScoredSide; right: ScoredSide }) => (
  <div className="flex w-full flex-col items-center gap-2" aria-hidden="true">
    <div className="flex items-center gap-2 rounded-full border-2 border-amber-200/70 bg-black/25 px-3 py-1">
      <span className="text-caption font-bold uppercase tracking-wider text-amber-200/90">Category</span>
      <span className="text-[20px] font-black uppercase leading-none text-amber-50 [font-family:var(--ht-font-display)] [text-shadow:0_2px_0_rgba(60,10,40,0.7)]">
        {category}
      </span>
    </div>
    <div className="grid w-full grid-cols-2 items-end gap-1">
      <ScoredColumn side={left} />
      <ScoredColumn side={right} />
    </div>
  </div>
);

// ── Card 6: Majority Rules example ───────────────────────────────────────────

const MAJORITY_PEOPLE: Person[] = ["sam", "jess", "maya", "leo", "kai"];

const MajorityArt = () => (
  <div
    className="w-full rounded-2xl border-2 border-fuchsia-400/60 bg-[#1a0b2e]/80 px-3 py-2.5 shadow-[0_0_18px_rgba(217,70,239,0.35)]"
    aria-hidden="true"
  >
    <div className="flex items-center justify-center gap-2">
      <span className="text-base font-black uppercase tracking-wider text-fuchsia-300">Animal</span>
      <span className="text-base text-white/50">→</span>
      <span className="rounded-lg bg-[linear-gradient(132deg,#d946ef_0%,#ec4899_50%,#f59e0b_100%)] px-3 py-1 text-[17px] font-black text-white">
        Alligator
      </span>
    </div>
    <div className="mt-2.5 flex justify-center -space-x-2">
      {MAJORITY_PEOPLE.map((person) => (
        <div key={person} className={`h-10 w-10 overflow-hidden rounded-full border-2 border-[#1a0b2e] ${PERSON_LOOKS[person].bg}`}>
          <PersonFace person={person} />
        </div>
      ))}
    </div>
    <div className="mt-2 flex items-center justify-center gap-2">
      <span className="text-[15px] font-bold text-white/85">5 players said it</span>
      <span className="text-[15px] text-white/50">→</span>
      <span className="whitespace-nowrap rounded-full bg-amber-400 px-2.5 py-0.5 text-[15px] font-black text-[#4a052c]">+5 pts</span>
    </div>
  </div>
);

// ── Dispatch ─────────────────────────────────────────────────────────────────

export const CategoryBlitzTutorialArt = ({ art }: { art: ArtKey }) => {
  switch (art) {
    case "intro":
      return <IntroArt />;
    case "board":
      return <BoardArt />;
    case "answering":
      return <AnsweringArt />;
    case "timer":
      return <TimerArt />;
    case "unique":
      return (
        <ScoredPairArt
          category="Birds"
          left={{ answer: "Ostrich", player: "Sam", person: "sam" }}
          right={{ answer: "Owl", player: "Jess", person: "jess" }}
        />
      );
    case "duplicate":
      return (
        <ScoredPairArt
          category="Birds"
          left={{ answer: "Ostrich", player: "Sam", person: "sam", noPoints: true }}
          right={{ answer: "Ostrich", player: "Jess", person: "jess", noPoints: true }}
        />
      );
    case "alliteration":
      return (
        <ScoredPairArt
          category="Fruit"
          left={{
            answer: "Prickly Pear",
            player: "Maya",
            person: "maya",
            bonus: `+${ALLITERATION_BONUS_POINTS} alliteration bonus`,
          }}
          right={{ answer: "Peach", player: "Leo", person: "leo" }}
        />
      );
    case "majority":
      return <MajorityArt />;
  }
};
