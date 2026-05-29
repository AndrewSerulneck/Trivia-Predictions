import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PasskeyErrorCode } from "@/lib/passkeyErrors";
import {
  decodePublicKeyFromBase64Url,
  extractChallengeFromResponse,
  findAccountById,
  findUserByIdAndVenue,
  getActiveChallengeById,
  getCredentialTransportList,
  getGenericAuthFailureMessage,
  isPasskeyFeatureEnabled,
  markChallengeUsed,
  mapAccountForResponse,
  mapUserForResponse,
  normalizeVenueId,
  sanitizeCredentialId,
  sanitizeUserId,
} from "@/lib/webauthn";

export const runtime = "nodejs";

type AuthenticateVerifyBody = {
  challengeId?: string;
  response?: AuthenticationResponseJSON;
  venueId?: string;
};

type PasskeyRow = {
  user_id: string;
  account_id: string | null;
  credential_id_b64url: string;
  public_key_b64url: string;
  sign_count: number;
  transports: string[] | null;
  device_type: string | null;
  backed_up: boolean | null;
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
    const body = (await request.json().catch(() => ({}))) as AuthenticateVerifyBody;
    const challengeId = sanitizeUserId(body.challengeId);
    const response = body.response;
    const venueId = normalizeVenueId(String(body.venueId ?? ""));

    if (!challengeId || !response) {
      return passkeyError(400, "INVALID_REQUEST", "challengeId and response are required.");
    }

    const challenge = await getActiveChallengeById(supabaseAdmin, {
      challengeId,
      flowType: "authentication",
    });
    // Note: challenge.user_id may legitimately be null for the discoverable-credential
    // flow (no username supplied at options time). We resolve the user from the
    // credential_id returned by the device instead.
    if (!challenge) {
      return passkeyError(401, "CHALLENGE_EXPIRED", getGenericAuthFailureMessage());
    }

    const credentialId = sanitizeCredentialId(response.id);
    if (!credentialId) {
      return passkeyError(401, "INVALID_REQUEST", getGenericAuthFailureMessage());
    }

    // ── Look up the stored credential ─────────────────────────────────────────
    // Account-first: filter by account_id + credential_id (stricter).
    // Legacy venue-scoped: filter by user_id + credential_id.
    // Discoverable (both null on challenge): find by credential_id alone.
    let storedCredential: PasskeyRow | null = null;
    const selectFields = "user_id, account_id, credential_id_b64url, public_key_b64url, sign_count, transports, device_type, backed_up";

    if (challenge.account_id) {
      const q = await supabaseAdmin
        .from("user_passkeys")
        .select(selectFields)
        .eq("account_id", challenge.account_id)
        .eq("credential_id_b64url", credentialId)
        .maybeSingle<PasskeyRow>();
      if (q.error) return passkeyError(500, "UNKNOWN", q.error.message);
      storedCredential = q.data;
    } else if (challenge.user_id) {
      const q = await supabaseAdmin
        .from("user_passkeys")
        .select(selectFields)
        .eq("user_id", challenge.user_id)
        .eq("credential_id_b64url", credentialId)
        .maybeSingle<PasskeyRow>();
      if (q.error) return passkeyError(500, "UNKNOWN", q.error.message);
      storedCredential = q.data;
    } else {
      // Discoverable flow — credential_id is globally unique.
      const q = await supabaseAdmin
        .from("user_passkeys")
        .select(selectFields)
        .eq("credential_id_b64url", credentialId)
        .maybeSingle<PasskeyRow>();
      if (q.error) return passkeyError(500, "UNKNOWN", q.error.message);
      storedCredential = q.data;
    }

    const resolvedAccountId =
      challenge.account_id ?? storedCredential?.account_id ?? null;
    const resolvedUserId =
      challenge.user_id ?? storedCredential?.user_id ?? null;

    if (!storedCredential || (!resolvedAccountId && !resolvedUserId)) {
      return passkeyError(401, "CREDENTIAL_NOT_FOUND", getGenericAuthFailureMessage());
    }

    const resolvedChallenge = extractChallengeFromResponse(response);
    if (resolvedChallenge !== challenge.challenge_b64url) {
      return passkeyError(401, "CHALLENGE_USER_MISMATCH", getGenericAuthFailureMessage());
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge_b64url,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
      credential: {
        id: storedCredential.credential_id_b64url,
        publicKey: Uint8Array.from(decodePublicKeyFromBase64Url(storedCredential.public_key_b64url)),
        counter: Number(storedCredential.sign_count ?? 0),
        transports: getCredentialTransportList(storedCredential.transports ?? []),
      },
    });

    if (!verification.verified) {
      return passkeyError(401, "VERIFICATION_FAILED", getGenericAuthFailureMessage());
    }

    const newCounter = verification.authenticationInfo.newCounter;

    // credential_id_b64url is globally unique; update by it alone to avoid
    // stale filters when account_id/user_id have just been migrated.
    const updateCredential = await supabaseAdmin
      .from("user_passkeys")
      .update({
        sign_count: newCounter,
        backed_up: verification.authenticationInfo.credentialBackedUp,
        device_type: verification.authenticationInfo.credentialDeviceType,
        last_used_at: new Date().toISOString(),
      })
      .eq("credential_id_b64url", storedCredential.credential_id_b64url);

    if (updateCredential.error) {
      return passkeyError(500, "UNKNOWN", updateCredential.error.message);
    }

    await markChallengeUsed(supabaseAdmin, challenge.id);

    // Return the richest identity info available.
    // Account-first: return account info; venue profile is resolved by the client
    // after venue selection via POST /api/join/profile.
    if (resolvedAccountId) {
      const account = await findAccountById(supabaseAdmin, resolvedAccountId);
      const venueUser = venueId && resolvedUserId
        ? await findUserByIdAndVenue(supabaseAdmin, { userId: resolvedUserId, venueId })
        : null;

      return NextResponse.json({
        ok: true,
        verified: true,
        account: account
          ? { id: account.id, username: account.username, authId: account.auth_id ?? undefined }
          : { id: resolvedAccountId },
        ...(venueUser ? { user: mapUserForResponse(venueUser) } : {}),
        next: { method: "passkey" },
      });
    }

    // Legacy: return venue-profile info.
    const user = venueId && resolvedUserId
      ? await findUserByIdAndVenue(supabaseAdmin, { userId: resolvedUserId, venueId })
      : null;

    return NextResponse.json({
      ok: true,
      verified: true,
      user: user ? mapUserForResponse(user) : { id: resolvedUserId },
      next: { method: "passkey" },
    });
  } catch {
    return passkeyError(401, "AUTH_FAILED", getGenericAuthFailureMessage());
  }
}
