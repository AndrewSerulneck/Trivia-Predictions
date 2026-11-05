import { disconnectRoute } from "@/lib/social/socialProviderRoutes";

/** DELETE /api/owner/social/facebook?venueId= — Disconnect (lib/social/socialProviderRoutes.ts, plan §5.12). */
export const DELETE = disconnectRoute("facebook");
