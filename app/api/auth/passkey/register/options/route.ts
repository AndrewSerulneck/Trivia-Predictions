import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chooseUserAndVenueFromRequest,
  createChallenge,
  findUserByIdAndVenue,
  findUserByUsernameAndVenue,
  getCredentialTransportList,
  isPasskeyFeatureEnabled,
  listPasskeysForUser,
  mapUserForResponse,
  normalizeUsername,
  normalizeVenueId,
  resolveAllowedOriginAndRpId,
  getWebAuthnRpName,
} from "@/lib/webauthn";

export const runtime = "nodejs";

type RegisterOptionsBody = {
  username?: string;
  userId?: string;
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
    const body = (await request.json().catch(() => ({}))) as RegisterOptionsBody;
    const { origin, rpId } = resolveAllowedOriginAndRpId(request);

    const username = normalizeUsername(String(body.username ?? ""));
    const venueIdFromBody = normalizeVenueId(String(body.venueId ?? ""));
    const cookieOrBodySession = chooseUserAndVenueFromRequest(request, body);

    const venueId = venueIdFromBody || cookieOrBodySession.venueId;
    let user = cookieOrBodySession.userId
      ? await findUserByIdAndVenue(supabaseAdmin, {
          userId: cookieOrBodySession.userId,
          venueId,
        })
      : null;

    if (!user && username && venueId) {
      user = await findUserByUsernameAndVenue(supabaseAdmin, { username, venueId });
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User profile was not found for passkey registration." },
        { status: 404 }
      );
    }

    const existingPasskeys = await listPasskeysForUser(supabaseAdmin, user.id);
    const options = await generateRegistrationOptions({
      rpName: getWebAuthnRpName(),
      rpID: rpId,
      userName: user.username,
      userDisplayName: user.username,
      timeout: 60_000,
      attestationType: "none",
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

    return NextResponse.json({
      ok: true,
      challengeId: challenge.id,
      options,
      user: mapUserForResponse(user),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to generate passkey registration options." },
      { status: 400 }
    );
  }
}
