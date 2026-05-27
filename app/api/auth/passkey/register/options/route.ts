import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PasskeyErrorCode } from "@/lib/passkeyErrors";
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
      return passkeyError(404, "USER_NOT_FOUND", "User profile was not found for passkey registration.");
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
    return passkeyError(
      400,
      "UNKNOWN",
      error instanceof Error ? error.message : "Failed to generate passkey registration options."
    );
  }
}
