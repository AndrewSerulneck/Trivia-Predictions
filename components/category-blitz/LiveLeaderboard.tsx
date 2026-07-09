"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { RankBadge } from "@/components/trivia/RankBadge";
import { EASE_ACCEL, EASE_SNAP } from "@/lib/motionEasing";

interface LeaderboardEntry {
  userId: string;
  username: string;
  points: number;
}

interface LiveLeaderboardProps {
  entries: LeaderboardEntry[];
  meId: string;
  /**
   * When true, every row animates to its exit state instead of "show" — the
   * EXIT half of the intermission transition (leaderboard rows accelerate
   * out as the next-round countdown takes over). See
   * docs/category-blitz-scoring-and-bugfix-plan.md Phase 4.
   */
  exiting?: boolean;
  /**
   * Render in the already-settled resting state: no entrance stagger and no
   * count-up (scores shown at final value immediately). Used by the resting
   * intermission (ResultsScreen) so the leaderboard doesn't replay its
   * count-up/reorder after RevealSequence just animated it a beat earlier —
   * see the "double leaderboard animation" gotcha, Phase 4.
   */
  settled?: boolean;
}

const listV: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
  exit: { transition: { staggerChildren: 0.025 } },
};

const useCountUp = (value: number, reduce: boolean, settled: boolean) => {
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  const skip = reduce || settled;
  useEffect(() => {
    if (skip) {
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setCount(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, skip]);
  // When reduce/settled, return the full value instantly. When animating,
  // return the current animated count (which starts at 0 and animates up).
  return skip ? value : count;
};

interface RowProps {
  entry: LeaderboardEntry;
  rank: number;
  isMe: boolean;
  reduce: boolean;
  exiting?: boolean;
  settled?: boolean;
}

const Row = ({ entry, rank, isMe, reduce, exiting, settled = false }: RowProps) => {
  const shown = useCountUp(entry.points, reduce, settled);

  // Detect between-round point gains -> emerald flash + floating "+N".
  const prevPoints = useRef(entry.points);
  const [flash, setFlash] = useState<{ delta: number; key: number } | null>(
    null,
  );
  useEffect(() => {
    const delta = entry.points - prevPoints.current;
    prevPoints.current = entry.points;
    if (delta > 0) {
      const next = { delta, key: Date.now() };
      setFlash(next);
      const id = window.setTimeout(() => setFlash(null), 1200);
      return () => window.clearTimeout(id);
    }
  }, [entry.points]);

  const rowV: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.24, ease: EASE_SNAP },
    },
    exit: reduce
      ? { opacity: 0, transition: { duration: 0 } }
      : { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.2, ease: EASE_ACCEL } },
  };

  return (
    <motion.li
      layout={!exiting}
      variants={rowV}
      initial={settled ? "show" : "hidden"}
      animate={exiting ? "exit" : "show"}
      exit="exit"
      transition={{
        layout: reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 40 },
      }}
      className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 ${
        isMe
          ? "border-emerald-400/50 bg-emerald-500/10"
          : "border-slate-800 bg-slate-900/50"
      }`}
    >
      {/* flash overlay on point gain */}
      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash.key}
            className="pointer-events-none absolute inset-0 rounded-xl bg-emerald-400/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: reduce ? [0, 0.5, 0] : [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.4 : 1 }}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <span className="relative shrink-0">
        <RankBadge rank={rank} />
      </span>

      <span
        className={`relative min-w-0 flex-1 truncate text-sm font-semibold ${
          isMe ? "text-emerald-100" : "text-slate-200"
        }`}
      >
        {entry.username}
        {isMe && (
          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400/70">
            you
          </span>
        )}
      </span>

      <span className="relative shrink-0">
        <span
          className={`text-sm font-black tabular-nums ${
            isMe ? "text-emerald-300" : "text-slate-100"
          }`}
        >
          {shown}
        </span>
        {/* floating "+N" */}
        <AnimatePresence>
          {flash && !reduce && (
            <motion.span
              key={flash.key}
              className="pointer-events-none absolute -top-1 right-0 text-xs font-extrabold text-emerald-300"
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 1, 0], y: -18 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              aria-hidden
            >
              +{flash.delta}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.li>
  );
};

const LiveLeaderboard = ({ entries, meId, exiting = false, settled = false }: LiveLeaderboardProps) => {
  const reduce = useReducedMotion() ?? false;

  const ranked = [...entries].sort(
    (a, b) => b.points - a.points || a.username.localeCompare(b.username),
  );
  const top10 = ranked.slice(0, 10);
  const meIndex = ranked.findIndex((e) => e.userId === meId);
  const mePinned = meIndex >= 10 ? ranked[meIndex] : null;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-1.5 bg-slate-950 p-3">
      <motion.ul
        variants={listV}
        initial={settled ? "show" : "hidden"}
        animate={exiting ? "exit" : "show"}
        className="flex flex-col gap-1.5"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {top10.map((e, i) => (
            <Row
              key={e.userId}
              entry={e}
              rank={i + 1}
              isMe={e.userId === meId}
              reduce={reduce}
              exiting={exiting}
              settled={settled}
            />
          ))}
        </AnimatePresence>
      </motion.ul>

      {mePinned && (
        <>
          <div
            className="py-0.5 text-center text-[0.65rem] font-bold uppercase tracking-wide text-slate-500"
            aria-hidden
          >
            ··· you&apos;re ranked #{meIndex + 1} ···
          </div>
          <ul className="flex flex-col">
            <Row
              key={mePinned.userId}
              entry={mePinned}
              rank={meIndex + 1}
              isMe
              reduce={reduce}
              exiting={exiting}
              settled={settled}
            />
          </ul>
        </>
      )}
    </div>
  );
};

export default LiveLeaderboard;
