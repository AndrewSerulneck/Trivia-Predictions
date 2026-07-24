import { NextResponse } from "next/server";
import { loadOwnerAccountProfile, OWNER_ACCOUNT_GENERIC_ERROR } from "@/lib/ownerAccount";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  let owner;
  try {
    owner = await loadOwnerAccountProfile(auth.ownerId);
  } catch (error) {
    console.error(
      `Failed to load owner account profile for owner ${auth.ownerId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  if (!owner) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
    },
  });
}
