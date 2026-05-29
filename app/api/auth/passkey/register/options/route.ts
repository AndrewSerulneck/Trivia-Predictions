import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PasskeyErrorCode } from "@/lib/passkeyErrors";
import {
  chooseUserAndVenueFromRequest,
  createChallenge,
  findAccountById,
  findAccountByUsername,
  findUserByIdAndVenue,
  findUserByUsernameAndVenue,
  getCredentialTransportList,
  isPasskeyFeatureEnabled,
  listPasskeysForAccount,
  listPasskeysForUser,
  mapAccountForResponse,
  mapUserForResponse,
  normalizeUsername,
  normalizeVenueId,
  resolveAllowedOriginAndRpId,
  sanitizeUserId,
  toWebAuthnUserIdBytes,
  getWebAuthnRpName,
} from "@/lib/webauthn";

export const runtime = "nodejs";

type RegisterOptionsBody = {
  username?: string;
  userId?: string;
  venueId?: string;
  accountId?: string;
};

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
    const body = (await request.json().catch(() => ({}))) as RegisterOptionsBody;
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

    const username = normalizeUsername(String(body.username ?? ""));
    const venueIdFromBody = normalizeVenueId(String(body.venueId ?? ""));
    const accountIdFromBody = sanitizeUserId(body.accountId ?? "");
    const cookieOrBodySession = chooseUserAndVenueFromRequest(request, body);

    // ── Account-first lookup ──────────────────────────────────────────────────
    // Prefer accountId, then fall back to username (global), then username+venue.
    let resolvedAccountId: string | null = null;
    let displayUsername = "";

    if (accountIdFromBody) {
      const account = await findAccountById(supabaseAdmin, accountIdFromBody);
      if (!account) {
        return passkeyError(404, "USER_NOT_FOUND", "Account not found for passkey registration.");
      }
      resolvedAccountId = account.id;
      displayUsername = account.username;
    } else if (username) {
      const account = await findAccountByUsername(supabaseAdmin, username);
      if (account) {
        resolvedAccountId = account.id;
        displayUsername = account.username;
      }
    }

    // ── Legacy venue-scoped fallback ──────────────────────────────────────────
    // Used when account lookup yields nothing but venue context is available.
    if (!resolvedAccountId) {
      const venueId = venueIdFromBody || cookieOrBodySession.venueId;
      let user = cookieOrBodySession.userId
        ? await findUserByIdAndVenue(supabaseAdmin, { userId: cookieOrBodySession.userId, venueId })
        : null;
      if (!user && username && venueId) {
        user = await findUserByUsernameAndVenue(supabaseAdmin, { username, venueId });
      }
      if (!user) {
        return passkeyError(404, "USER_NOT_FOUND", "User profile was not found for passkey registration.");
      }
      // Prefer the account linked to the venue profile; fall back to the profile itself.
      resolvedAccountId = (user as { account_id?: string | null }).account_id ?? null;
      displayUsername = user.username;

      if (!resolvedAccountId) {
        // Pre-migration user without account_id: register passkey on venue profile.
        const existingPasskeys = await listPasskeysForUser(supabaseAdmin, user.id);
        const options = await generateRegistrationOptions({
          rpName: getWebAuthnRpName(),
          rpID: rpId,
          userID: toWebAuthnUserIdBytes(user.id),
          userName: user.username,
          userDisplayName: user.username,
          timeout: 60_000,
          attestationType: "none",
          preferredAuthenticatorType: "localDevice",
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "preferred",
          },
          excludeCredentials: existingPasskeys.map((passkey) => ({
            id: passkey.credential_id_b64url,
            transports: getCredentialTransportList(passkey.transports ?? []),
          })),
        });
        const challenge = await createChallenge(supabaseAdmin, {
          userId: user.id,
          flowType: "registration",
          challengeB64Url: options.challenge,
          rpId,
          origin,
        });
        return NextResponse.json({ ok: true, challengeId: challenge.id, options, user: mapUserForResponse(user) });
      }
    }

    const existingPasskeys = await listPasskeysForAccount(supabaseAdmin, resolvedAccountId);
    const options = await generateRegistrationOptions({
      rpName: getWebAuthnRpName(),
      rpID: rpId,
      userID: toWebAuthnUserIdBytes(resolvedAccountId),
      userName: displayUsername,
      userDisplayName: displayUsername,
      timeout: 60_000,
      attestationType: "none",
      preferredAuthenticatorType: "localDevice",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "preferred",
      },
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credential_id_b64url,
        transports: getCredentialTransportList(passkey.transports ?? []),
      })),
    });

    const challenge = await createChallenge(supabaseAdmin, {
      accountId: resolvedAccountId,
      flowType: "registration",
      challengeB64Url: options.challenge,
      rpId,
      origin,
    });

    return NextResponse.json({
      ok: true,
      challengeId: challenge.id,
      options,
      account: { id: resolvedAccountId, username: displayUsername },
    });
  } catch (error) {
    return passkeyError(
      400,
      "UNKNOWN",
      error instanceof Error ? error.message : "Failed to generate passkey registration options."
    );
  }
}
