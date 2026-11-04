import { handleMetaCallback } from "@/lib/social/metaCallbacks";

export const runtime = "nodejs";

/** POST /api/social/meta/data-deletion — Meta data-deletion request; answers { url, confirmation_code }. */
export const POST = (request: Request) => handleMetaCallback(request, "data-deletion");
