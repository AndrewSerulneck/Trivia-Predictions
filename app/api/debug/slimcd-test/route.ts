import { NextResponse } from "next/server";
import "server-only";

const URL = "https://stats.slimcd.com/soft/createsession.asp";

export async function GET() {
  const username = process.env.SLIMCD_PUBLIC_API_KEY?.trim() ?? "";
  const clientId = process.env.SLIMCD_CLIENT_ID?.trim() ?? "";
  const siteId   = process.env.SLIMCD_SITE_ID?.trim() ?? "";
  const priceId  = process.env.SLIMCD_PRICE_ID?.trim() ?? "";
  const formName = process.env.SLIMCD_FORM_NAME?.trim() ?? "";
  const referer  = process.env.NEXT_PUBLIC_APP_URL ?? "https://hightopchallenge.com";

  const fields = new URLSearchParams();
  fields.set("username", username);
  fields.set("password", "");
  fields.set("clientid", clientId);
  fields.set("siteid", siteId);
  fields.set("priceid", priceId);
  fields.set("formname", formName);
  fields.set("transtype", "QUEUE");
  fields.set("amount", "140.00");
  fields.set("var1", "test-venue");
  fields.set("var2", "test-owner");
  fields.set("var3", "subscribe");
  fields.set("var4", "14000");

  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": referer },
    body: fields.toString(),
  });
  const text = await res.text();

  return NextResponse.json({
    ok: text.toLowerCase().includes("<response>success</response>"),
    invalidLogin: text.toLowerCase().includes("invalid login"),
    raw: text,
  });
}
