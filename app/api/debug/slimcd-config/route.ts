import { NextResponse } from "next/server";

export async function GET() {
  const vars = {
    SLIMCD_PRIVATE_API_KEY: !!process.env.SLIMCD_PRIVATE_API_KEY?.trim(),
    SLIMCD_PASSWORD: !!process.env.SLIMCD_PASSWORD?.trim(),
    SLIMCD_CLIENT_ID: !!process.env.SLIMCD_CLIENT_ID?.trim(),
    SLIMCD_SITE_ID: !!process.env.SLIMCD_SITE_ID?.trim(),
    SLIMCD_PRICE_ID: !!process.env.SLIMCD_PRICE_ID?.trim(),
    SLIMCD_FORM_NAME: !!process.env.SLIMCD_FORM_NAME?.trim(),
    SLIMCD_DEV_STUB: process.env.SLIMCD_DEV_STUB === "true",
    NODE_ENV: process.env.NODE_ENV,
  };

  const missing = Object.entries(vars)
    .filter(([k, v]) => k !== "SLIMCD_DEV_STUB" && k !== "NODE_ENV" && !v)
    .map(([k]) => k);

  return NextResponse.json({
    allConfigured: missing.length === 0,
    missing,
    vars,
  });
}
