import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PasskeyErrorCode } from "@/lib/passkeyErrors";
import {
  encodePublicKeyToBase64Url,
  extractChallengeFromResponse,
  findUserByIdAndVenue,
  getActiveChallengeById,
  getCredentialTransportList,
  isPasskeyFeatureEnabled,
  mapUserForResponse,
  markChallengeUsed,
  normalizeVenueId,
  sanitizeUserId,
} from "@/lib/webauthn";

export const runtime = "nodejs";

type RegisterVerifyBody = {
  challengeId?: string;
  response?: RegistrationResponseJSON;
  userId?: string;
  venueId?: string;
  deviceLabel?: string;
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
    const body = (await request.json().catch(() => ({}))) as RegisterVerifyBody;
    const challengeId = sanitizeUserId(body.challengeId);
    const response = body.response;
    const venueId = normalizeVenueId(String(body.venueId ?? ""));
    const userIdFromBody = sanitizeUserId(body.userId);

    if (!challengeId || !response) {
      return passkeyError(400, "INVALID_REQUEST", "challengeId and response are required.");
    }

    const challenge = await getActiveChallengeById(supabaseAdmin, {
      challengeId,
      flowType: "registration",
    });

    if (!challenge) {
      return passkeyError(409, "CHALLENGE_EXPIRED", "Registration challenge is missing or expired.");
    }
    if (!challenge.user_id) {
      return passkeyError(409, "CHALLENGE_USER_MISMATCH", "Challenge is not linked to a user.");
    }
    if (userIdFromBody && challenge.user_id !== userIdFromBody) {
      return passkeyError(409, "CHALLENGE_USER_MISMATCH", "Challenge user mismatch.");
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge_b64url,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return passkeyError(401, "VERIFICATION_FAILED", "Passkey registration could not be verified.");
    }

    const user = venueId
      ? await findUserByIdAndVenue(supabaseAdmin, { userId: challenge.user_id, venueId })
      : null;
    if (!user && venueId) {
      return passkeyError(404, "USER_NOT_FOUND", "User profile for the selected venue was not found.");
    }

    const { credential, credentialBackedUp, credentialDeviceType, aaguid } = verification.registrationInfo;
    const resolvedChallenge = extractChallengeFromResponse(response);
    if (resolvedChallenge !== challenge.challenge_b64url) {
      return passkeyError(401, "CHALLENGE_USER_MISMATCH", "Challenge verification failed.");
    }

    const upsert = await supabaseAdmin
      .from("user_passkeys")
      .upsert(
        {
          user_id: challenge.user_id,
          credential_id_b64url: credential.id,
          public_key_b64url: encodePublicKeyToBase64Url(credential.publicKey),
          sign_count: credential.counter,
          transports: getCredentialTransportList(response.response.transports ?? credential.transports ?? []),
          aaguid,
          device_type: credentialDeviceType,
          backed_up: credentialBackedUp,
          device_label: String(body.deviceLabel ?? "").trim() || null,
          last_used_at: new Date().toISOString(),
        },
        {
          onConflict: "credential_id_b64url",
        }
      );

    if (upsert.error) {
      return passkeyError(500, "UNKNOWN", upsert.error.message);
    }

    await markChallengeUsed(supabaseAdmin, challenge.id);

    return NextResponse.json({
      ok: true,
      verified: true,
      credentialId: credential.id,
      user: user ? mapUserForResponse(user) : null,
    });
  } catch (error) {
    return passkeyError(
      400,
      "UNKNOWN",
      error instanceof Error ? error.message : "Failed to verify passkey registration."
    );
  }
}
