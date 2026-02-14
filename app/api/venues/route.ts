import { NextResponse } from "next/server";
import { listVenues } from "@/lib/venues";

export async function GET() {
  const venues = await listVenues();
  return NextResponse.json({ ok: true, venues });
}
