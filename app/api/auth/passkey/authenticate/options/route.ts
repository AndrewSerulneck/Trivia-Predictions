import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createChallenge,
  findUserByUsernameAndVenue,
  getCredentialTransportList,
  getGenericAuthFailureMessage,
  isPasskeyFeatureEnabled,
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

export async function POST(request: Request) {
  if (!isPasskeyFeatureEnabled()) {
    return NextResponse.json({ ok: false, error: "Passkeys are currently disabled." }, { status: 503 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as AuthenticateOptionsBody;
    const username = normalizeUsername(String(body.username ?? ""));
    const venueId = normalizeVenueId(String(body.venueId ?? ""));
    if (!username || !venueId) {
      return NextResponse.json({ ok: false, error: "username and venueId are required." }, { status: 400 });
    }

    const { origin, rpId } = resolveAllowedOriginAndRpId(request);
    const user = await findUserByUsernameAndVenue(supabaseAdmin, { username, venueId });
    if (!user) {
      return NextResponse.json({ ok: false, error: getGenericAuthFailureMessage() }, { status: 401 });
    }

    const passkeys = await listPasskeysForUser(supabaseAdmin, user.id);
    if (passkeys.length === 0) {
      return NextResponse.json({
        ok: true,
        requiresPinFallback: true,
        reason: "no-passkeys",
        user: mapUserForResponse(user),
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id_b64url,
        transports: getCredentialTransportList(passkey.transports ?? []),
      })),
    });

    const challenge = await createChallenge(supabaseAdmin, {
      userId: user.id,
      flowType: "authentication",
      challengeB64Url: options.challenge,
      rpId,
      origin,
    });

    return NextResponse.json({
      ok: true,
      challengeId: challenge.id,
      options,
      user: mapUserForResponse(user),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate passkey authentication options." },
      { status: 400 }
    );
  }
}
