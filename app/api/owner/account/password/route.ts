import { NextResponse } from "next/server";
import {
  loadOwnerAccountProfile,
  OWNER_ACCOUNT_GENERIC_ERROR,
  OWNER_ACCOUNT_MIN_PASSWORD_LENGTH,
  OWNER_ACCOUNT_PASSWORD_REQUIRED_ERROR,
  OWNER_ACCOUNT_SHORT_PASSWORD_ERROR,
  OWNER_ACCOUNT_WRONG_PASSWORD_ERROR,
  reauthenticateOwnerPassword,
} from "@/lib/ownerAccount";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as PasswordBody;
  const currentPassword = String(body.currentPassword ?? "").trim();
  const newPassword = String(body.newPassword ?? "").trim();

  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_PASSWORD_REQUIRED_ERROR }, { status: 400 });
  }

  if (newPassword.length < OWNER_ACCOUNT_MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_SHORT_PASSWORD_ERROR }, { status: 400 });
  }

  let owner;
  try {
    owner = await loadOwnerAccountProfile(auth.ownerId);
  } catch (error) {
    console.error(
      `Failed to load owner account profile for password update on owner ${auth.ownerId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  if (!owner) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  const reauthResult = await reauthenticateOwnerPassword(owner, currentPassword);
  if (!reauthResult.ok) {
    const status = reauthResult.reason === "invalid_credentials" ? 401 : 500;
    const error =
      reauthResult.reason === "invalid_credentials" ? OWNER_ACCOUNT_WRONG_PASSWORD_ERROR : OWNER_ACCOUNT_GENERIC_ERROR;
    return NextResponse.json({ ok: false, error }, { status });
  }

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(owner.authId, {
    password: newPassword,
  });

  if (authUpdateError) {
    console.error(`Failed to update Supabase Auth password for owner ${owner.id}:`, authUpdateError.message);
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
