import { NextResponse } from "next/server";

const INTAKE_EMAIL = "adinfo@hightopchallenge.com";

type IntakeBody = {
  name?: string;
  email?: string;
  phone?: string;
  business?: string;
  businessLink?: string;
  adDescription?: string;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeBusinessLink(value: string): string {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IntakeBody;
    const name = asTrimmedString(body.name);
    const email = asTrimmedString(body.email);
    const phone = asTrimmedString(body.phone);
    const business = asTrimmedString(body.business);
    const businessLink = normalizeBusinessLink(asTrimmedString(body.businessLink));
    const adDescription = asTrimmedString(body.adDescription);

    if (!name || !email || !phone) {
      return NextResponse.json(
        { ok: false, error: "Name, email, and phone number are required." },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.AD_INTAKE_FROM_EMAIL?.trim();
    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Advertising intake email is not configured. Set RESEND_API_KEY and AD_INTAKE_FROM_EMAIL.",
        },
        { status: 500 }
      );
    }

    const details = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Business: ${business || "Not provided"}`,
      `Business Link: ${businessLink || "Not provided"}`,
      `Ad Description: ${adDescription || "Not provided"}`,
      `Submitted At: ${new Date().toISOString()}`,
    ].join("\n");

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [INTAKE_EMAIL],
        reply_to: email,
        subject: "Advertising Interest - Hightop Challenge",
        text: details,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      return NextResponse.json(
        { ok: false, error: `Failed to send intake email. ${errorText || ""}`.trim() },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send intake email." },
      { status: 500 }
    );
  }
}
