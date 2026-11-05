import "server-only";
import { NextResponse } from "next/server";
import { SOCIAL_POST_COPY } from "@/lib/promo/promoCopy";
import { guardOwnerSocialVenue, socialJsonError } from "@/lib/social/ownerSocialGuard";
import { chooseConnection, disconnectConnection } from "@/lib/social/socialConnections";
import { META_ID } from "@/lib/social/socialPublishRules";
import type { SocialProvider } from "@/lib/social/socialTypes";

/**
 * The shared handlers behind the per-provider choose / disconnect routes (docs/partner-social-promo-plan.md
 * §5.12, Phase 18). The URLs stay one file per provider — `app/api/owner/social/{instagram,facebook}/route.ts`
 * (DELETE) and `…/choose/route.ts` (POST) — so the Post now panel, the sealed route list and Meta's App Review
 * screencast don't change. No dynamic `[provider]` segment. Every handler opens with guardOwnerSocialVenue.
 */

type ProviderRouteSpec = {
  /** The body key holding the picked Meta id. */
  bodyKey: string;
  /** What the partner picks ("account" / "Page"). */
  item: string;
  pick: string;
  /** How the "connect again" hint reads for this provider. */
  connectAgain: string;
  logTag: string;
};

const name = SOCIAL_POST_COPY.providers;

export const PROVIDER_ROUTE_SPECS: Record<SocialProvider, ProviderRouteSpec> = {
  instagram: {
    bodyKey: "instagramId",
    item: "account",
    pick: "Pick an account.",
    connectAgain: `Connect ${name.instagram} again.`,
    logTag: "[SocialInstagram]",
  },
  facebook: {
    bodyKey: "pageId",
    item: "Page",
    pick: "Pick a Page.",
    connectAgain: "Connect again.",
    logTag: "[SocialFacebook]",
  },
};

/**
 * POST /api/owner/social/<provider>/choose { venueId, instagramId | pageId } — the partner granted several
 * accounts / Pages and picked one (Phases 5–6). Only an id from the venue's own pending list is accepted;
 * one Graph call fetches that Page's token. Answers `{ ok: true }` only: the panel reloads the status GET after
 * a pick, so no connection view is built here (Phase 21).
 */
export const chooseRoute =
  (provider: SocialProvider) =>
  async (request: Request): Promise<Response> => {
    const spec = PROVIDER_ROUTE_SPECS[provider];
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const venueId = typeof body?.venueId === "string" ? body.venueId.trim() : "";
    const gate = await guardOwnerSocialVenue(request, venueId);
    if ("response" in gate) return gate.response;

    const raw = body?.[spec.bodyKey];
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!META_ID.test(id)) return socialJsonError(400, spec.pick);

    try {
      const result = await chooseConnection(provider, venueId, gate.auth.ownerId, id);
      if (result === "expired") return socialJsonError(409, `That choice expired. ${spec.connectAgain}`, "expired");
      if (result === "not_found") return socialJsonError(404, `That ${spec.item} isn't available any more. ${spec.connectAgain}`, "not_found");
      if (result === "reconnect") return socialJsonError(409, "Facebook needs you to connect again.", "reconnect");
      if (result === "error") return socialJsonError(502, `Couldn't reach ${name[provider]}. Please try again.`);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error(`${spec.logTag} choose-failed`, { venueId, error: error instanceof Error ? error.message : "unknown" });
      return socialJsonError(500, `Couldn't connect that ${spec.item}. Please try again.`);
    }
  };

/**
 * DELETE /api/owner/social/<provider>?venueId= — Disconnect (Phases 5–6): deletes the token and row, ends
 * that provider's open posts (cancelled, or "unconfirmed" if they may be live: Phase 19) and deletes their
 * files, and removes the app from the partner's Facebook login when no venue still uses it (the other
 * provider's connection counts as a use). The panel's status read is GET /api/owner/social/status.
 */
export const disconnectRoute =
  (provider: SocialProvider) =>
  async (request: Request): Promise<Response> => {
    const { logTag } = PROVIDER_ROUTE_SPECS[provider];
    const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
    const gate = await guardOwnerSocialVenue(request, venueId);
    if ("response" in gate) return gate.response;

    try {
      await disconnectConnection(venueId, provider);
      console.info(`${logTag} disconnected`, { venueId });
      return NextResponse.json({ ok: true, connection: { state: "not_connected" } });
    } catch (error) {
      console.error(`${logTag} disconnect-failed`, { venueId, error: error instanceof Error ? error.message : "unknown" });
      return socialJsonError(500, `Couldn't disconnect ${name[provider]}. Please try again.`);
    }
  };
