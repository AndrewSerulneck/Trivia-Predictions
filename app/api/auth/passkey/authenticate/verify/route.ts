import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PasskeyErrorCode } from "@/lib/passkeyErrors";
import {
  decodePublicKeyFromBase64Url,
  extractChallengeFromResponse,
  findUserByIdAndVenue,
  getActiveChallengeById,
  getCredentialTransportList,
  getGenericAuthFailureMessage,
  isPasskeyFeatureEnabled,
  markChallengeUsed,
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
    // Non-discoverable: filter by both user_id and credential_id (stricter).
    // Discoverable (user_id=null on challenge): find by credential_id alone and
    // resolve the user_id from the passkey row itself.
    let storedCredential: PasskeyRow | null = null;

    if (challenge.user_id) {
      const credentialQuery = await supabaseAdmin
        .from("user_passkeys")
        .select("user_id, credential_id_b64url, public_key_b64url, sign_count, transports, device_type, backed_up")
        .eq("user_id", challenge.user_id)
        .eq("credential_id_b64url", credentialId)
        .maybeSingle<PasskeyRow>();
      if (credentialQuery.error) {
        return passkeyError(500, "UNKNOWN", credentialQuery.error.message);
      }
      storedCredential = credentialQuery.data;
    } else {
      // Discoverable flow — credential_id is globally unique so no user filter needed.
      const credentialQuery = await supabaseAdmin
        .from("user_passkeys")
        .select("user_id, credential_id_b64url, public_key_b64url, sign_count, transports, device_type, backed_up")
        .eq("credential_id_b64url", credentialId)
        .maybeSingle<PasskeyRow>();
      if (credentialQuery.error) {
        return passkeyError(500, "UNKNOWN", credentialQuery.error.message);
      }
      storedCredential = credentialQuery.data;
    }

    const resolvedUserId = challenge.user_id ?? storedCredential?.user_id ?? null;

    if (!storedCredential || !resolvedUserId) {
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
    const updateCredential = await supabaseAdmin
      .from("user_passkeys")
      .update({
        sign_count: newCounter,
        backed_up: verification.authenticationInfo.credentialBackedUp,
        device_type: verification.authenticationInfo.credentialDeviceType,
        last_used_at: new Date().toISOString(),
      })
      .eq("user_id", resolvedUserId)
      .eq("credential_id_b64url", storedCredential.credential_id_b64url);

    if (updateCredential.error) {
      return passkeyError(500, "UNKNOWN", updateCredential.error.message);
    }

    await markChallengeUsed(supabaseAdmin, challenge.id);

    const user = venueId
      ? await findUserByIdAndVenue(supabaseAdmin, { userId: resolvedUserId, venueId })
      : null;

    return NextResponse.json({
      ok: true,
      verified: true,
      user: user ? mapUserForResponse(user) : { id: resolvedUserId },
      next: {
        method: "passkey",
      },
    });
  } catch {
    return passkeyError(401, "AUTH_FAILED", getGenericAuthFailureMessage());
  }
}
