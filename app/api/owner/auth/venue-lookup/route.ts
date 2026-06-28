import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
  street: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const street = searchParams.get("street")?.trim() ?? "";
  const zip = searchParams.get("zip")?.trim() ?? "";

  if (!street && !zip) {
    return NextResponse.json({ ok: false, error: "Provide at least a street address or zip code." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, name, display_name, street, address, city, state, zip_code")
    .returns<VenueRow[]>();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const normalizedStreet = normalize(street);
  const normalizedZip = normalize(zip);

  const matches = (data ?? []).filter((venue) => {
    const venueStreet = normalize(venue.street ?? venue.address);
    const venueZip = normalize(venue.zip_code);

    const streetMatch = normalizedStreet
      ? venueStreet.includes(normalizedStreet) || normalizedStreet.includes(venueStreet.slice(0, 6))
      : true;
    const zipMatch = normalizedZip ? venueZip === normalizedZip : true;

    return streetMatch && zipMatch;
  });

  return NextResponse.json({
    ok: true,
    venues: matches.map((v) => ({
      id: v.id,
      name: v.display_name ?? v.name,
      address: [v.street ?? v.address, v.city, v.state, v.zip_code].filter(Boolean).join(", "),
    })),
  });
}
