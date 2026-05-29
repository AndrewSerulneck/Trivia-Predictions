import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PasskeyErrorCode } from "@/lib/passkeyErrors";
import {
  createChallenge,
  findAccountByUsername,
  findUserByUsernameAndVenue,
  getCredentialTransportList,
  getGenericAuthFailureMessage,
  isPasskeyFeatureEnabled,
  listPasskeysForAccount,
  listPasskeysForUser,
  mapUserForResponse,
  normalizeUsername,
  normalizeVenueId,
  resolveAllowedOriginAndRpId,
} from "@/lib/webauthn";

export const runtime = "nodejs";

type AuthenticateOptionsBody = {
  username?: string;
  venueId?: string;
};

function toClientDeviceTransports(transports: unknown): ReturnType<typeof getCredentialTransportList> {
  const parsed = getCredentialTransportList(transports ?? []);
  // Platform authenticator only (Face ID / Touch ID / device PIN).
  if (parsed.includes("internal")) {
    return ["internal"];
  }
  return [];
}

function passkeyError(status: number, errorCode: PasskeyErrorCode, error: string) {
  return NextResponse.json({ ok: false, errorCode, error }, { status });
}

export async function POST(request: Request) {
  if (!isPasskeyFeatureEnabled()) {
    return passkeyError(503, "PASSKEY_DISABLED", "Passkeys are currently disabled.");
  }
  if (!supabaseAdmin) {
    return passkeyError(500, "SERVER_MISCONFIG", "Supabase admin client is not configured.");
  }

  try {
    const body = (await request.json().catch(() => ({}))) as AuthenticateOptionsBody;
    const username = normalizeUsername(String(body.username ?? ""));
    const venueId = normalizeVenueId(String(body.venueId ?? ""));

    let origin = "";
    let rpId = "";
    try {
      const resolved = resolveAllowedOriginAndRpId(request);
      origin = resolved.origin;
      rpId = resolved.rpId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Origin is not allowed for WebAuthn.";
      if (message.includes("Origin is not allowed")) {
        return passkeyError(400, "ORIGIN_NOT_ALLOWED", message);
      }
      if (message.includes("RP ID is not allowed")) {
        return passkeyError(400, "RP_ID_NOT_ALLOWED", message);
      }
      return passkeyError(400, "INVALID_REQUEST", message);
    }

    // ── Discoverable-credential flow (no username supplied) ──────────────────
    // Allow browser-mediated passkey discovery from the Face ID / Touch ID button.
    // For this flow we generate options with an empty allowCredentials list.
    const isDiscoverable = !username;

    type AllowCredential = { id: string; transports: ReturnType<typeof getCredentialTransportList> };
    let resolvedAccountId: string | null = null;
    let resolvedUserId: string | null = null;
    let allowCredentials: AllowCredential[] = [];
    let resolvedUserForResponse: ReturnType<typeof mapUserForResponse> | undefined;

    if (!isDiscoverable) {
      // ── Account-first lookup (preferred, no venueId required) ──────────────
      const account = await findAccountByUsername(supabaseAdmin, username);
      if (account) {
        const passkeys = await listPasskeysForAccount(supabaseAdmin, account.id);
        if (passkeys.length === 0) {
          return NextResponse.json({
            ok: true,
            requiresPinFallback: true,
            reason: "no-passkeys",
            reasonCode: "NO_PASSKEYS",
            account: { id: account.id, username: account.username },
          });
        }
        resolvedAccountId = account.id;
        allowCredentials = passkeys
          .map((passkey) => ({
          id: passkey.credential_id_b64url,
          transports: toClientDeviceTransports(passkey.transports ?? []),
          }))
          .filter((credential) => credential.transports.length > 0);
        if (allowCredentials.length === 0) {
          return NextResponse.json({
            ok: true,
            requiresPinFallback: true,
            reason: "no-local-passkey",
            reasonCode: "NO_LOCAL_PASSKEY",
            account: { id: account.id, username: account.username },
          });
        }
      } else if (venueId) {
        // ── Legacy venue-scoped fallback ──────────────────────────────────────
        const user = await findUserByUsernameAndVenue(supabaseAdmin, { username, venueId });
        if (!user) {
          return passkeyError(401, "AUTH_FAILED", getGenericAuthFailureMessage());
        }
        const passkeys = await listPasskeysForUser(supabaseAdmin, user.id);
        if (passkeys.length === 0) {
          return NextResponse.json({
            ok: true,
            requiresPinFallback: true,
            reason: "no-passkeys",
            reasonCode: "NO_PASSKEYS",
            user: mapUserForResponse(user),
          });
        }
        resolvedUserId = user.id;
        allowCredentials = passkeys
          .map((passkey) => ({
          id: passkey.credential_id_b64url,
          transports: toClientDeviceTransports(passkey.transports ?? []),
          }))
          .filter((credential) => credential.transports.length > 0);
        if (allowCredentials.length === 0) {
          return NextResponse.json({
            ok: true,
            requiresPinFallback: true,
            reason: "no-local-passkey",
            reasonCode: "NO_LOCAL_PASSKEY",
            user: mapUserForResponse(user),
          });
        }
        resolvedUserForResponse = mapUserForResponse(user);
      } else {
        return passkeyError(401, "AUTH_FAILED", getGenericAuthFailureMessage());
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials,
    });
    // Hint browsers toward local device authenticators (Face ID / Touch ID / device PIN).
    options.hints = ["client-device"];

    const challenge = await createChallenge(supabaseAdmin, {
      accountId: resolvedAccountId,
      userId: resolvedUserId,
      flowType: "authentication",
      challengeB64Url: options.challenge,
      rpId,
      origin,
    });

    return NextResponse.json({
      ok: true,
      challengeId: challenge.id,
      options,
      ...(resolvedUserForResponse ? { user: resolvedUserForResponse } : {}),
    });
  } catch (error) {
    return passkeyError(
      400,
      "UNKNOWN",
      error instanceof Error ? error.message : "Failed to generate passkey authentication options."
    );
  }
}
