import type { ReactNode } from "react";
import { GAME_TILE_THEMES, gameTileTitleLines } from "@/components/game-themes/gameTileThemes";
import type { VenueGameKey } from "@/lib/venueGameCards";

// The artwork-and-words face of a Venue Home game button (docs/game-themes-plan.md). ONE component, rendered by
// the phone's `VenueGamesPanel` and by the venue display's pre-game screen (`TvLiveTriviaPregame`), so the TV's
// replica can never drift from the real button. The parent supplies the surface: `relative overflow-hidden
// [container-type:inline-size]` plus `GAME_TILE_THEMES[gameKey].surfaceClass`. `children` is the subtitle area.
// Tailwind only (no inline style).

type GameTileFaceProps = {
  gameKey: VenueGameKey;
  children?: ReactNode;
};

export const GameTileFace = ({ gameKey, children }: GameTileFaceProps) => {
  const theme = GAME_TILE_THEMES[gameKey];
  return (
    <>
      {theme.backdrop}
      <span className="relative grid min-h-[176px] grid-cols-[minmax(0,1fr)_min(40%,170px)] items-center">
        <span className="block py-4 pl-4 pr-1">
          {theme.renderTitle(gameTileTitleLines(gameKey))}
          {children}
        </span>
        <span aria-hidden="true" className="pointer-events-none flex items-center justify-end self-stretch">
          {theme.art}
        </span>
      </span>
    </>
  );
};
