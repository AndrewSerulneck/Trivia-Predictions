import { HightopLoader } from "@/components/ui/HightopLoader";

/**
 * The Partner Dashboard's route-transition screen
 * (docs/partner-dashboard-merch-button-loader-speed-plan.md, Phase 4, item 1).
 *
 * Without this file, navigating into any `/owner/*` route fell back to the root
 * `app/loading.tsx` — a player-styled screen on a partner surface. `delayMs={0}`
 * because this IS the navigation feedback: the dark backdrop has to answer the tap
 * immediately, exactly as the overlay it replaced did.
 */
const OwnerLoading = () => (
  <HightopLoader variant="fullScreen" size="lg" delayMs={0} />
);

export default OwnerLoading;
