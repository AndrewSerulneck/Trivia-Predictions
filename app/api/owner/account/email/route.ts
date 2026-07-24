import { NextResponse } from "next/server";
import {
  isDuplicateOwnerEmailError,
  isValidOwnerEmail,
  loadOwnerAccountProfile,
  normalizeOwnerEmail,
  OWNER_ACCOUNT_DUPLICATE_EMAIL_ERROR,
  OWNER_ACCOUNT_EMAIL_PASSWORD_REQUIRED_ERROR,
  OWNER_ACCOUNT_GENERIC_ERROR,
  OWNER_ACCOUNT_INVALID_EMAIL_ERROR,
  OWNER_ACCOUNT_WRONG_PASSWORD_ERROR,
  reauthenticateOwnerPassword,
} from "@/lib/ownerAccount";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type EmailBody = {
  email?: string;
  currentPassword?: string;
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

  const body = (await request.json().catch(() => ({}))) as EmailBody;
  const email = normalizeOwnerEmail(String(body.email ?? ""));
  const currentPassword = String(body.currentPassword ?? "").trim();

  if (!currentPassword) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_EMAIL_PASSWORD_REQUIRED_ERROR }, { status: 400 });
  }

  if (!isValidOwnerEmail(email)) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_INVALID_EMAIL_ERROR }, { status: 400 });
  }

  let owner;
  try {
    owner = await loadOwnerAccountProfile(auth.ownerId);
  } catch (error) {
    console.error(
      `Failed to load owner account profile for email update on owner ${auth.ownerId}:`,
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

  const { data: duplicateOwner, error: duplicateError } = await supabaseAdmin
    .from("venue_owners")
    .select("id")
    .eq("email", email)
    .neq("id", owner.id)
    .maybeSingle<{ id: string }>();

  if (duplicateError) {
    console.error(`Failed to check duplicate owner email for owner ${owner.id}:`, duplicateError.message);
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  if (duplicateOwner) {
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_DUPLICATE_EMAIL_ERROR }, { status: 409 });
  }

  const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(owner.authId, {
    email,
    email_confirm: true,
  });

  if (authUpdateError) {
    console.error(`Failed to update Supabase Auth email for owner ${owner.id}:`, authUpdateError.message);
    const status = isDuplicateOwnerEmailError(authUpdateError.message) ? 409 : 500;
    const error = status === 409 ? OWNER_ACCOUNT_DUPLICATE_EMAIL_ERROR : OWNER_ACCOUNT_GENERIC_ERROR;
    return NextResponse.json({ ok: false, error }, { status });
  }

  const { error: ownerUpdateError } = await supabaseAdmin
    .from("venue_owners")
    .update({ email })
    .eq("id", owner.id);

  if (ownerUpdateError) {
    console.error("Supabase Auth email updated but venue_owners.email update failed.", {
      ownerId: owner.id,
      authId: owner.authId,
      previousEmail: owner.email,
      newEmail: email,
      error: ownerUpdateError.message,
    });
    return NextResponse.json({ ok: false, error: OWNER_ACCOUNT_GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    owner: {
      id: owner.id,
      name: owner.name,
      email,
    },
  });
}
