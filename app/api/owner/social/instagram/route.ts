import { disconnectRoute } from "@/lib/social/socialProviderRoutes";

/** DELETE /api/owner/social/instagram?venueId= — Disconnect (lib/social/socialProviderRoutes.ts, plan §5.12). */
export const DELETE = disconnectRoute("instagram");
