import { NextResponse } from "next/server";
import "server-only";

const URL = "https://stats.slimcd.com/soft/createsession.asp";

async function tryAuth(username: string, password: string, clientId: string, siteId: string, priceId: string, formName: string) {
  const fields = new URLSearchParams();
  fields.set("username", username);
  fields.set("password", password);
  fields.set("clientid", clientId);
  fields.set("siteid", siteId);
  fields.set("priceid", priceId);
  fields.set("formname", formName);
  fields.set("transtype", "AUTH");
  fields.set("amount", "0.01");
  fields.set("var1", "test");
  const res = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fields.toString() });
  const text = await res.text();
  return {
    ok: text.toLowerCase().includes("<response>success</response>"),
    invalidLogin: text.toLowerCase().includes("invalid login"),
    raw: text,
  };
}

export async function GET() {
  const publicKey   = process.env.SLIMCD_PUBLIC_API_KEY?.trim() ?? "";
  const publicPass  = process.env.SLIMCD_PUBLIC_PASSWORD?.trim() ?? "";
  const clientId    = process.env.SLIMCD_CLIENT_ID?.trim() ?? "";
  const siteId      = process.env.SLIMCD_SITE_ID?.trim() ?? "";
  const priceId     = process.env.SLIMCD_PRICE_ID?.trim() ?? "";
  const formName    = process.env.SLIMCD_FORM_NAME?.trim() ?? "";

  // Try 3 combinations to find which one SlimCD accepts
  const [withKey, withEmptyPass, withNoSitePrice] = await Promise.all([
    tryAuth(publicKey, publicPass,  clientId, siteId, priceId, formName),   // key as password
    tryAuth(publicKey, "",          clientId, siteId, priceId, formName),   // empty password
    tryAuth(publicKey, publicPass,  clientId, "",     "",      formName),   // no siteid/priceid
  ]);

  return NextResponse.json({
    "1_publicKey_with_hexPassword": { ok: withKey.ok, invalidLogin: withKey.invalidLogin, raw: withKey.raw },
    "2_publicKey_emptyPassword":    { ok: withEmptyPass.ok, invalidLogin: withEmptyPass.invalidLogin, raw: withEmptyPass.raw },
    "3_publicKey_noSitePrice":      { ok: withNoSitePrice.ok, invalidLogin: withNoSitePrice.invalidLogin, raw: withNoSitePrice.raw },
  });
}
