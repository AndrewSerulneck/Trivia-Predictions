import { NextResponse } from "next/server";

const CONTACT_TO_EMAIL = "partnerships@hightopchallenge.com";

type ContactBody = {
  name?: string;
  email?: string;
  phone?: string;
  venueName?: string;
  cityState?: string;
  numLocations?: string;
  message?: string;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContactBody;
    const name = asTrimmedString(body.name);
    const email = asTrimmedString(body.email);
    const phone = asTrimmedString(body.phone);
    const venueName = asTrimmedString(body.venueName);
    const cityState = asTrimmedString(body.cityState);
    const numLocations = asTrimmedString(body.numLocations);
    const message = asTrimmedString(body.message);

    if (!name || !email || !phone) {
      return NextResponse.json(
        { ok: false, error: "Name, email, and phone number are required." },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.CONTACT_FROM_EMAIL?.trim();
    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        {
          ok: false,
          error: "Contact form email is not configured. Set RESEND_API_KEY and CONTACT_FROM_EMAIL.",
        },
        { status: 500 }
      );
    }

    const details = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Venue: ${venueName || "Not provided"}`,
      `City & State: ${cityState || "Not provided"}`,
      `Number of Locations: ${numLocations || "Not provided"}`,
      `Message: ${message || "Not provided"}`,
      `Submitted At: ${new Date().toISOString()}`,
    ].join("\n");

    const sendInternal = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [CONTACT_TO_EMAIL],
        reply_to: email,
        subject: `New Venue Inquiry — ${name}${venueName ? ` (${venueName})` : ""}`,
        text: details,
      }),
    });

    const autoReplyText = [
      `Hi ${name},`,
      "",
      "Thanks for reaching out — someone from the Hightop Challenge team will be in touch with you shortly.",
      "",
      "In the meantime, feel free to reply to this email with any questions.",
      "",
      "— The Hightop Challenge Team",
      "partnerships@hightopchallenge.com",
    ].join("\n");

    const sendAutoReply = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        reply_to: CONTACT_TO_EMAIL,
        subject: "Thanks for reaching out — Hightop Challenge",
        text: autoReplyText,
      }),
    });

    const [internalRes, autoReplyRes] = await Promise.all([sendInternal, sendAutoReply]);

    if (!internalRes.ok) {
      const errorText = await internalRes.text();
      return NextResponse.json(
        { ok: false, error: `Failed to send contact email. ${errorText || ""}`.trim() },
        { status: 502 }
      );
    }

    if (!autoReplyRes.ok) {
      // Internal email succeeded — don't fail the request over the auto-reply
      console.error("Contact auto-reply failed:", await autoReplyRes.text());
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to send contact form." },
      { status: 500 }
    );
  }
}
