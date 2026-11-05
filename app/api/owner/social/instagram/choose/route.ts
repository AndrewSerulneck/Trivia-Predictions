import { chooseRoute } from "@/lib/social/socialProviderRoutes";

/** POST /api/owner/social/instagram/choose — pick one of several granted (lib/social/socialProviderRoutes.ts, plan §5.12). */
export const POST = chooseRoute("instagram");
