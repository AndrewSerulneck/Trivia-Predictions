import type { PromoGameId } from "@/lib/promo/promoTemplates";
import type { PromoTheme } from "@/lib/promo/promoThemeTypes";
import { bracketTheme } from "@/lib/promo/themes/bracket";
import { categoryBlitzTheme } from "@/lib/promo/themes/categoryBlitz";
import { liveTriviaTheme } from "@/lib/promo/themes/liveTrivia";
import { nflPickemTheme } from "@/lib/promo/themes/nflPickem";
import { pickemTheme } from "@/lib/promo/themes/pickem";
import { squaresTheme } from "@/lib/promo/themes/squares";

// Each Share to social design's game look (docs/game-themes-plan.md Phase 2): the same themes as the
// Venue Home game buttons (components/game-themes/gameTileThemes.tsx), approved as the "Share to Social
// Game Themes" canvas. A Record, so a new PromoGameId does not compile without its theme.

export const PROMO_THEMES: Record<PromoGameId, PromoTheme> = {
  live_trivia: liveTriviaTheme,
  category_blitz: categoryBlitzTheme,
  pickem: pickemTheme,
  nfl_pickem: nflPickemTheme,
  squares: squaresTheme,
  bracket: bracketTheme,
};

export const promoThemeFor = (game: PromoGameId): PromoTheme => PROMO_THEMES[game];
