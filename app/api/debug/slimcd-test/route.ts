import { NextResponse } from "next/server";
import "server-only";

/**
 * Debug endpoint: test SlimCD credentials and connection.
 * Returns the raw SlimCD response so we can see what error they're sending.
 */
export async function GET() {
  const username = process.env.SLIMCD_PUBLIC_API_KEY?.trim() ?? "";
  const password = process.env.SLIMCD_PUBLIC_PASSWORD?.trim() ?? "";
  const clientId = process.env.SLIMCD_CLIENT_ID?.trim() ?? "";
  const siteId = process.env.SLIMCD_SITE_ID?.trim() ?? "";
  const priceId = process.env.SLIMCD_PRICE_ID?.trim() ?? "";
  const formName = process.env.SLIMCD_FORM_NAME?.trim() ?? "";

  if (!clientId || !siteId || !priceId || !formName) {
    return NextResponse.json(
      { error: "SlimCD not fully configured. Missing CLIENT_ID, SITE_ID, PRICE_ID, or FORM_NAME." },
      { status: 400 }
    );
  }
  if (!username && !password) {
    return NextResponse.json(
      { error: "SlimCD auth not configured. Missing PRIVATE_API_KEY or PASSWORD." },
      { status: 400 }
    );
  }

  const fields = new URLSearchParams();
  fields.set("username", username);
  fields.set("password", password);
  fields.set("clientid", clientId);
  fields.set("siteid", siteId);
  fields.set("priceid", priceId);
  fields.set("formname", formName);
  fields.set("transtype", "AUTH");
  fields.set("amount", "0.01"); // $0.01 test charge
  fields.set("var1", "test-venue-id");
  fields.set("var2", "test-owner-id");
  fields.set("var3", "test-intent");
  fields.set("var4", "1");

  try {
    const response = await fetch("https://stats.slimcd.com/soft/createsession.asp", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: fields.toString(),
    });

    const text = await response.text();

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      responseText: text,
      // Try to extract key parts
      isInvalidLogin: text.toLowerCase().includes("invalid login"),
      isSuccess: text.toLowerCase().includes("<response>success</response>"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
