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
    if (!challenge || !challenge.user_id) {
      return passkeyError(401, "CHALLENGE_EXPIRED", getGenericAuthFailureMessage());
    }

    const credentialId = sanitizeCredentialId(response.id);
    if (!credentialId) {
      return passkeyError(401, "INVALID_REQUEST", getGenericAuthFailureMessage());
    }

    const credentialQuery = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id_b64url, public_key_b64url, sign_count, transports, device_type, backed_up")
      .eq("user_id", challenge.user_id)
      .eq("credential_id_b64url", credentialId)
      .maybeSingle<PasskeyRow>();

    if (credentialQuery.error) {
      return passkeyError(500, "UNKNOWN", credentialQuery.error.message);
    }
    const storedCredential = credentialQuery.data;
    if (!storedCredential) {
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
      .eq("user_id", challenge.user_id)
      .eq("credential_id_b64url", storedCredential.credential_id_b64url);

    if (updateCredential.error) {
      return passkeyError(500, "UNKNOWN", updateCredential.error.message);
    }

    await markChallengeUsed(supabaseAdmin, challenge.id);

    const user = venueId
      ? await findUserByIdAndVenue(supabaseAdmin, { userId: challenge.user_id, venueId })
      : null;

    return NextResponse.json({
      ok: true,
      verified: true,
      user: user ? mapUserForResponse(user) : { id: challenge.user_id },
      next: {
        method: "passkey",
      },
    });
  } catch {
    return passkeyError(401, "AUTH_FAILED", getGenericAuthFailureMessage());
  }
}
