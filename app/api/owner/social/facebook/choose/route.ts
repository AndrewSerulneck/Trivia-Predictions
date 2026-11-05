import { chooseRoute } from "@/lib/social/socialProviderRoutes";

/** POST /api/owner/social/facebook/choose — pick one of several granted (lib/social/socialProviderRoutes.ts, plan §5.12). */
export const POST = chooseRoute("facebook");
