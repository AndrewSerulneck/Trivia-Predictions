import { TvSlideCanvas, TvSlideHeader } from "@/components/venue-screen/TvSlideCanvas";
import { allTimeColumns, formatPoints } from "@/lib/tvPickEmBoard";
import { SCREEN_COLORS, TV_SLIDE_BACKGROUNDS } from "@/lib/venueScreenBrand";
import type { TvAllTimeEntry } from "@/lib/venueScreenCarouselShared";

/* ------------------------------------------------------------------ *
 * <TvAllTimeLeaderboard /> — carousel slide 3 (docs/fire-tv-app-plan.md D11, Phase 10; mockups v2 section E).
 *
 * The venue's top 10 by all-time points in two columns of five. Only #1 is gold. Points carry thousands separators.
 * The bottom 150 px (ticker + dots) and the bottom-right corner (QR) stay empty; the rows end well above them.
 * Static: nothing here moves, so a poll tick can't replay anything.
 * ------------------------------------------------------------------ */

type TvAllTimeLeaderboardProps = {
  venueName: string;
  entries: readonly TvAllTimeEntry[];
};

const Row = ({ entry }: { entry: TvAllTimeEntry }) => {
  const first = entry.rank === 1;
  return (
    <div
      data-testid="alltime-row"
      className="flex items-center"
      style={{
        gap: 26,
        height: 86,
        padding: "0 34px",
        borderRadius: 22,
        fontSize: 48,
        fontWeight: 800,
        background: first
          ? "linear-gradient(90deg, rgba(252,211,77,0.32), rgba(245,158,11,0.10))"
          : "rgba(255,255,255,0.06)",
        border: first ? "3px solid rgba(252,211,77,0.65)" : undefined,
        boxShadow: first ? "0 0 40px rgba(245,158,11,0.32)" : undefined,
      }}
    >
      <span
        style={{
          width: 68,
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          color: first ? SCREEN_COLORS.amber300 : "#94a3b8",
        }}
      >
        {entry.rank}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.username}
      </span>
      <span
        style={{
          fontWeight: 900,
          fontVariantNumeric: "tabular-nums",
          color: first ? SCREEN_COLORS.amber300 : "#e2e8f0",
        }}
      >
        {formatPoints(entry.points)}
        <small style={{ fontSize: 30, color: first ? SCREEN_COLORS.amber300 : "#94a3b8", marginLeft: 8 }}>pts</small>
      </span>
    </div>
  );
};

export const TvAllTimeLeaderboard = ({ venueName, entries }: TvAllTimeLeaderboardProps) => {
  const { left, right } = allTimeColumns(entries);
  return (
    <TvSlideCanvas testId="tv-alltime-leaderboard" background={TV_SLIDE_BACKGROUNDS.allTime}>
      <div className="absolute inset-0 flex flex-col" style={{ padding: "50px 78px 150px", gap: 40 }}>
        <TvSlideHeader title="All-Time Leaderboard" subtitle={venueName} />
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "0 40px" }}>
          {[left, right].map((column, index) => (
            <div key={index} className="flex flex-col" style={{ gap: 14 }}>
              {column.map((entry) => (
                <Row key={entry.rank} entry={entry} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </TvSlideCanvas>
  );
};
