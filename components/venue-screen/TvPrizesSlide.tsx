import { TvSlideCanvas } from "@/components/venue-screen/TvSlideCanvas";
import { formatPoints } from "@/lib/tvPickEmBoard";
import type { TvPrize } from "@/lib/venueScreenCarouselShared";

/* ------------------------------------------------------------------ *
 * <TvPrizesSlide /> — carousel slide 4 (docs/fire-tv-app-plan.md D28, Phase 11; mockups v2 section B).
 * Up to three prizes the venue is offering. No per-player progress bar (D28): a TV is read by a whole room. The
 * prize is the big line, the partner's name for the challenge under it, and the points a player needs when the prize
 * has a points target. Static. The bottom 150 px and the bottom-right corner stay empty.
 * ------------------------------------------------------------------ */

type TvPrizesSlideProps = {
  prizes: readonly TvPrize[];
};

export const TvPrizesSlide = ({ prizes }: TvPrizesSlideProps) => (
  <TvSlideCanvas background="transparent" testId="tv-prizes">
    <div
      className="absolute flex flex-col items-center justify-center"
      style={{ inset: "0 0 96px", gap: 56, paddingBottom: 20 }}
    >
      <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "#fcd34d" }}>
        Prizes up for grabs
      </div>
      <div className="flex" style={{ gap: 40 }}>
        {prizes.slice(0, 3).map((prize) => (
          <div
            key={prize.id}
            data-testid="tv-prize"
            className="flex flex-col"
            style={{
              width: 520,
              minHeight: 250,
              justifyContent: "space-between",
              gap: 18,
              padding: "36px 36px 34px",
              borderRadius: 28,
              background: "rgba(255,255,255,0.06)",
              border: "3px solid rgba(252,211,77,0.4)",
              textAlign: "left",
            }}
          >
            <div className="flex flex-col" style={{ gap: 18 }}>
              <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05 }}>{prize.prize}</div>
              {prize.name.trim() && prize.name.trim() !== prize.prize.trim() ? (
                <div style={{ fontSize: 34, fontWeight: 700, color: "#94a3b8" }}>{prize.name}</div>
              ) : null}
            </div>
            {prize.pointsRequired !== null ? (
              <div style={{ fontSize: 44, fontWeight: 900, color: "#fcd34d" }}>{formatPoints(prize.pointsRequired)} pts</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  </TvSlideCanvas>
);
