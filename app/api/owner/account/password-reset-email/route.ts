import { NextResponse } from "next/server";
import { marketingUrl } from "@/lib/domainSplit";
import { loadOwnerAccountProfile, OWNER_ACCOUNT_GENERIC_ERROR } from "@/lib/ownerAccount";
import type { OwnerAccountProfile } from "@/lib/ownerAccount";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import type { OwnerAuthContext } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const RESET_EMAIL_WINDOW_MS = 3 * 60 * 1000;
const resetEmailRequestedAtByOwnerId = new Map<string, number>();

const pruneResetEmailAttempts = (now: number): void => {
  for (const [ownerId, requestedAt] of resetEmailRequestedAtByOwnerId.entries()) {
    if (now - requestedAt >= RESET_EMAIL_WINDOW_MS) {
      resetEmailRequestedAtByOwnerId.delete(ownerId);
    }
  }
};

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    console.error("Owner password reset email request failed: Supabase admin client is not configured.");
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  let auth: OwnerAuthContext;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  let owner: OwnerAccountProfile | null;
  try {
    owner = await loadOwnerAccountProfile(auth.ownerId);
  } catch (error) {
    console.error(
      `Failed to load owner account profile for password reset email on owner ${auth.ownerId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  if (!owner) {
    console.error("Owner password reset email request failed because the owner profile is unavailable.", {
      ownerId: auth.ownerId,
    });
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  const now = Date.now();
  pruneResetEmailAttempts(now);

  const previousRequestAt = resetEmailRequestedAtByOwnerId.get(owner.id);
  if (previousRequestAt !== undefined && now - previousRequestAt < RESET_EMAIL_WINDOW_MS) {
    return NextResponse.json(
      { ok: false, error: "Please wait a few minutes before requesting another reset email." },
      { status: 429 },
    );
  }

  const redirectTo = marketingUrl("/owner/reset-password");
  resetEmailRequestedAtByOwnerId.set(owner.id, now);

  try {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(owner.email, { redirectTo });
    if (error) {
      resetEmailRequestedAtByOwnerId.delete(owner.id);
      console.error("Failed to send owner password reset email.", {
        ownerId: owner.id,
        destinationEmail: owner.email,
        error: error.message,
      });
      return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
    }
  } catch (error) {
    resetEmailRequestedAtByOwnerId.delete(owner.id);
    console.error("Failed to send owner password reset email.", {
      ownerId: owner.id,
      destinationEmail: owner.email,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
