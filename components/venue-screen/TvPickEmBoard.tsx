"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TvSlideCanvas, TvSlideHeader } from "@/components/venue-screen/TvSlideCanvas";
import { useFxMoment } from "@/components/venue-screen/fx/useFx";
import { useHydrated } from "@/components/venue-screen/fx/useHydrated";
import {
  boardGamesOf,
  formatGameTime,
  formatLeaderRecord,
  pickEmBoardLabel,
  tileViewOf,
  type TvScoreFlash,
  type TvTileSide,
  type TvTileView,
} from "@/lib/tvPickEmBoard";
import type { TvPickEmGame, TvPickEmLeader } from "@/lib/tvSportsRelevance";
import { SCREEN_COLORS, TV_SLIDE_BACKGROUNDS } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvPickEmBoard /> — carousel slide 2 (docs/fire-tv-app-plan.md D18, Phase 10; mockups v2 section D).
 *
 * Four tiles (2×2) of today's top games, a league label on each, and this venue's top 5 down the side. No join QR
 * (D16: one QR per screen, the shared "Get the app" corner in Phase 11). The bottom 150 px (ticker + dots) and the
 * bottom-right corner (QR) stay empty. The score flash is a moment: it plays only through `useFxMoment`, so a poll
 * tick that repeats the same score never plays it again.
 * ------------------------------------------------------------------ */

type TvPickEmBoardProps = {
  venueName: string;
  /** The ranked games (first four are the board). */
  games: readonly TvPickEmGame[];
  /** Today's top 5 here; null: nobody has a settled pick yet. */
  leaders: readonly TvPickEmLeader[] | null;
  /** The TV's ticking clock. */
  nowMs: number;
  /** The score change up next (usePickEmScoreFlash), played once through useFxMoment. */
  flash?: TvScoreFlash | null;
  /** The flash's turn is over (played, or not on this board): the next one can come up. */
  onFlashEnd?: (token: string) => void;
};

const FLASH_ON_MS = 6_500;

const COLORS = {
  slate: "#94a3b8",
  slateLight: "#e2e8f0",
  live: SCREEN_COLORS.emerald300,
  gold: SCREEN_COLORS.amber300,
  cyan: SCREEN_COLORS.cyan300,
};

type TileProps = {
  view: TvTileView;
  hydrated: boolean;
  flash: TvScoreFlash | null;
  flashOn: boolean;
  reduceMotion: boolean;
};

const TeamRow = ({ side }: { side: TvTileSide }) => (
  <div className="flex items-baseline justify-between" style={{ lineHeight: 1, gap: 16 }}>
    <span
      style={{
        fontSize: 62,
        fontWeight: 900,
        letterSpacing: "0.03em",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {side.label}
    </span>
    <span
      style={{
        fontSize: 92,
        fontWeight: 900,
        fontVariantNumeric: "tabular-nums",
        color: side.lead ? COLORS.gold : undefined,
      }}
    >
      {side.score}
    </span>
  </div>
);

const Tile = ({ view, hydrated, flash, flashOn, reduceMotion }: TileProps) => {
  const live = view.status === "live";
  const statusText = view.statusText ?? (hydrated ? formatGameTime(view.startsAt) : "");
  const awayPct = view.away.pickPct;
  const homePct = view.home.pickPct;
  const awayLeads = awayPct !== null && homePct !== null && awayPct >= homePct;
  const flashing = flashOn && flash !== null;

  return (
    <motion.div
      data-testid="pickem-tile"
      data-flash={flashing ? "on" : "off"}
      className="relative flex flex-col justify-between"
      style={{
        minHeight: 0,
        borderRadius: 28,
        padding: "22px 32px 24px",
        border: `3px solid ${flashing ? COLORS.gold : "rgba(255,255,255,0.12)"}`,
        background: flashing ? "rgba(252,211,77,0.12)" : "rgba(255,255,255,0.05)",
      }}
      animate={
        flashing && !reduceMotion
          ? { boxShadow: ["0 0 0 rgba(252,211,77,0)", "0 0 60px rgba(252,211,77,0.7)", "0 0 0 rgba(252,211,77,0)"] }
          : { boxShadow: "0 0 0 rgba(252,211,77,0)" }
      }
      transition={flashing && !reduceMotion ? { duration: 1.6, repeat: 3, ease: "easeInOut" } : { duration: 0 }}
    >
      {flashing ? (
        <div
          data-testid="pickem-ribbon"
          style={{
            position: "absolute",
            top: -36,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            background: COLORS.gold,
            color: "#1b1203",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "0.08em",
            padding: "4px 22px",
            borderRadius: 999,
          }}
        >
          {flash?.ribbon}
        </div>
      ) : null}

      <div className="flex justify-between" style={{ fontSize: 32, fontWeight: 800, color: COLORS.slate }}>
        <span>
          <span style={{ color: COLORS.slateLight, fontWeight: 900, marginRight: 14 }}>{view.league}</span>
          <span style={{ color: live ? COLORS.live : undefined }}>
            {live ? "● " : ""}
            {statusText}
          </span>
        </span>
        {view.picksText ? <span>{view.picksText}</span> : null}
      </div>

      <TeamRow side={view.away} />
      <TeamRow side={view.home} />

      <div style={{ height: 16, borderRadius: 999, background: "rgba(255,255,255,0.16)", overflow: "hidden" }}>
        {awayPct !== null ? (
          <div
            style={{
              height: "100%",
              width: `${awayPct}%`,
              background: `linear-gradient(90deg, ${SCREEN_COLORS.cyan400}, ${COLORS.live})`,
            }}
          />
        ) : null}
      </div>
      <div className="flex justify-between" style={{ fontSize: 30, fontWeight: 700, color: COLORS.slate }}>
        {flashing && flash ? (
          <b style={{ color: "#f8fafc", fontWeight: 900 }}>{flash.caption}</b>
        ) : awayPct !== null && homePct !== null ? (
          <>
            <b style={{ color: awayLeads ? "#f8fafc" : undefined, fontWeight: 900 }}>
              {awayPct}% {view.away.label}
            </b>
            <span style={{ color: awayLeads ? undefined : "#f8fafc", fontWeight: awayLeads ? 700 : 900 }}>
              {homePct}% {view.home.label}
            </span>
          </>
        ) : (
          // Only a count of 0 is "no picks"; an unknown count (the read failed) says nothing.
          view.picks === 0 ? <span>No picks yet</span> : null
        )}
      </div>
    </motion.div>
  );
};

const LeaderRow = ({ leader }: { leader: TvPickEmLeader }) => {
  const first = leader.rank === 1;
  return (
    <div
      data-testid="pickem-leader"
      className="flex items-center"
      style={{
        gap: 18,
        height: 76,
        padding: "0 22px",
        borderRadius: 18,
        fontSize: 40,
        fontWeight: 800,
        background: first
          ? "linear-gradient(90deg, rgba(252,211,77,0.30), rgba(245,158,11,0.10))"
          : "rgba(255,255,255,0.06)",
        border: first ? "2px solid rgba(252,211,77,0.6)" : undefined,
        boxShadow: first ? "0 0 36px rgba(245,158,11,0.3)" : undefined,
      }}
    >
      <span style={{ width: 40, fontWeight: 900, color: first ? COLORS.gold : COLORS.slate }}>{leader.rank}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {leader.username}
      </span>
      <span style={{ color: COLORS.gold, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
        {formatLeaderRecord(leader)}
      </span>
    </div>
  );
};

export const TvPickEmBoard = ({ venueName, games, leaders, nowMs, flash = null, onFlashEnd }: TvPickEmBoardProps) => {
  const reduceMotion = Boolean(useReducedMotion());
  const hydrated = useHydrated();
  const board = boardGamesOf(games).map(tileViewOf);

  // The flash plays once, only if it happens while the room is watching, and only on a game that is on the board.
  const onBoard = flash !== null && board.some((view) => view.key === flash.gameKey);
  const played = useFxMoment(onBoard ? flash.token : null);
  const [flashOn, setFlashOn] = useState(false);
  useEffect(() => {
    if (!played) return undefined;
    const onId = window.setTimeout(() => setFlashOn(true), 0);
    const offId = window.setTimeout(() => setFlashOn(false), FLASH_ON_MS);
    return () => {
      window.clearTimeout(onId);
      window.clearTimeout(offId);
    };
  }, [played]);

  // The flash leaves the queue after its turn (or at once when its game isn't on this board), so the next one comes up.
  const flashToken = flash?.token ?? null;
  useEffect(() => {
    if (!flashToken || !onFlashEnd) return undefined;
    const id = window.setTimeout(() => onFlashEnd(flashToken), onBoard ? FLASH_ON_MS : 0);
    return () => window.clearTimeout(id);
  }, [flashToken, onBoard, onFlashEnd]);

  return (
    <TvSlideCanvas testId="tv-pickem-board" background={TV_SLIDE_BACKGROUNDS.pickEm}>
      <div className="absolute inset-0 flex flex-col" style={{ padding: "50px 78px 150px", gap: 30 }}>
        <TvSlideHeader title="Pick 'Em Live" subtitle={venueName} right={pickEmBoardLabel(games, nowMs, hydrated)} />
        <div className="grid flex-1" style={{ gridTemplateColumns: "1fr 500px", gap: 48, minHeight: 0 }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 26, minHeight: 0 }}
          >
            {board.map((view) => (
              <Tile
                key={view.key}
                view={view}
                hydrated={hydrated}
                flash={played && flash?.gameKey === view.key ? flash : null}
                flashOn={flashOn}
                reduceMotion={reduceMotion}
              />
            ))}
          </div>
          <div className="flex flex-col" style={{ gap: 22, minHeight: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: COLORS.gold }}>
              Top 5 here
            </div>
            {leaders && leaders.length > 0 ? (
              <div className="flex flex-col" style={{ gap: 10 }}>
                {leaders.slice(0, 5).map((leader) => (
                  <LeaderRow key={`${leader.rank}-${leader.username}`} leader={leader} />
                ))}
              </div>
            ) : (
              <div data-testid="pickem-no-leaders" style={{ fontSize: 36, fontWeight: 700, color: COLORS.slate }}>
                No results yet
              </div>
            )}
          </div>
        </div>
      </div>
    </TvSlideCanvas>
  );
};
