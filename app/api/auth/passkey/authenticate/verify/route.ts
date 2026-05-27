import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

export async function POST(request: Request) {
  if (!isPasskeyFeatureEnabled()) {
    return NextResponse.json({ ok: false, error: "Passkeys are currently disabled." }, { status: 503 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as AuthenticateVerifyBody;
    const challengeId = sanitizeUserId(body.challengeId);
    const response = body.response;
    const venueId = normalizeVenueId(String(body.venueId ?? ""));

    if (!challengeId || !response) {
      return NextResponse.json({ ok: false, error: "challengeId and response are required." }, { status: 400 });
    }

    const challenge = await getActiveChallengeById(supabaseAdmin, {
      challengeId,
      flowType: "authentication",
    });
    if (!challenge || !challenge.user_id) {
      return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
    }

    const credentialId = sanitizeCredentialId(response.id);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
    }

    const credentialQuery = await supabaseAdmin
      .from("user_passkeys")
      .select("credential_id_b64url, public_key_b64url, sign_count, transports, device_type, backed_up")
      .eq("user_id", challenge.user_id)
      .eq("credential_id_b64url", credentialId)
      .maybeSingle<PasskeyRow>();

    if (credentialQuery.error) {
      return NextResponse.json({ ok: false, error: credentialQuery.error.message }, { status: 500 });
    }
    const storedCredential = credentialQuery.data;
    if (!storedCredential) {
      return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
    }

    const resolvedChallenge = extractChallengeFromResponse(response);
    if (resolvedChallenge !== challenge.challenge_b64url) {
      return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
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
      return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
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
      return NextResponse.json({ ok: false, error: updateCredential.error.message }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
  }
}
