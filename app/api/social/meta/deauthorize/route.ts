import { handleMetaCallback } from "@/lib/social/metaCallbacks";

export const runtime = "nodejs";

/** POST /api/social/meta/deauthorize — Meta tells us a partner removed our app (Phase 4). */
export const POST = (request: Request) => handleMetaCallback(request, "deauthorize");
