import { NextResponse } from "next/server";
import { clearOwnerSessionCookie } from "@/lib/ownerSession";

export async function POST() {
  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": clearOwnerSessionCookie() } }
  );
}
