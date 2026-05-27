import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

export async function POST(request: Request) {
  if (!isPasskeyFeatureEnabled()) {
    return NextResponse.json({ ok: false, error: "Passkeys are currently disabled." }, { status: 503 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RegisterVerifyBody;
    const challengeId = sanitizeUserId(body.challengeId);
    const response = body.response;
    const venueId = normalizeVenueId(String(body.venueId ?? ""));
    const userIdFromBody = sanitizeUserId(body.userId);

    if (!challengeId || !response) {
      return NextResponse.json({ ok: false, error: "challengeId and response are required." }, { status: 400 });
    }

    const challenge = await getActiveChallengeById(supabaseAdmin, {
      challengeId,
      flowType: "registration",
    });

    if (!challenge) {
      return NextResponse.json({ ok: false, error: "Registration challenge is missing or expired." }, { status: 409 });
    }
    if (!challenge.user_id) {
      return NextResponse.json({ ok: false, error: "Challenge is not linked to a user." }, { status: 409 });
    }
    if (userIdFromBody && challenge.user_id !== userIdFromBody) {
      return NextResponse.json({ ok: false, error: "Challenge user mismatch." }, { status: 409 });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge_b64url,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ ok: false, error: "Passkey registration could not be verified." }, { status: 401 });
    }

    const user = venueId
      ? await findUserByIdAndVenue(supabaseAdmin, { userId: challenge.user_id, venueId })
      : null;
    if (!user && venueId) {
      return NextResponse.json({ ok: false, error: "User profile for the selected venue was not found." }, { status: 404 });
    }

    const { credential, credentialBackedUp, credentialDeviceType, aaguid } = verification.registrationInfo;
    const resolvedChallenge = extractChallengeFromResponse(response);
    if (resolvedChallenge !== challenge.challenge_b64url) {
      return NextResponse.json({ ok: false, error: "Challenge verification failed." }, { status: 401 });
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
      return NextResponse.json({ ok: false, error: upsert.error.message }, { status: 500 });
    }

    await markChallengeUsed(supabaseAdmin, challenge.id);

    return NextResponse.json({
      ok: true,
      verified: true,
      credentialId: credential.id,
      user: user ? mapUserForResponse(user) : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to verify passkey registration.",
      },
      { status: 400 }
    );
  }
}
