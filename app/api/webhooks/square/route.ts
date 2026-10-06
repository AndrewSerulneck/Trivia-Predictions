import { NextResponse } from "next/server";
import { squareWebhookConfig } from "@/lib/pos/squareConfig";
import {
  recordSquareGiftCardActivity,
  recordSquareRevocation,
  verifySquareSignature,
  type SquareGiftCardActivity,
  type SquareRevocationEvent,
} from "@/lib/pos/squareWebhook";

// The signature is computed over the exact raw body — read it as text, never re-serialise.
export const runtime = "nodejs";

/**
 * POST /api/webhooks/square — Square event sink (docs/pos-rewards-integration-plan.md Phase 2).
 *
 * Signature-verified (lib/pos/squareWebhook.ts); anything unverified is a 401 with no work done.
 * Deliberately NOT behind NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED: once a gift card exists at
 * Square its spending must still be recorded even if the flag is later turned off. Without a
 * configured signature key it answers 503 (Square retries) rather than accepting unverifiable
 * events.
 *
 * Handles `gift_card.activity.created` (and `.updated`) and, since Phase 2c,
 * `oauth.authorization.revoked` (the partner removed our app → "Reconnect needed"). Every other
 * verified event is a 200 no-op so Square doesn't retry it. One log line per event, no
 * per-event table scans, never the raw body.
 */
export async function POST(request: Request) {
  const config = squareWebhookConfig();
  if (!config) {
    console.error("[PosSquare] webhook-not-configured");
    return NextResponse.json({ ok: false, error: "Webhook not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = verifySquareSignature({
    rawBody,
    signatureHeader: request.headers.get("x-square-hmacsha256-signature"),
    signatureKey: config.signatureKey,
    notificationUrl: config.notificationUrl,
  });
  if (!verified) {
    console.warn("[PosSquare] webhook-bad-signature");
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  let event: SquareRevocationEvent & {
    type?: string;
    event_id?: string;
    data?: { object?: { gift_card_activity?: SquareGiftCardActivity } };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (event.type === "oauth.authorization.revoked") {
    const revoked = await recordSquareRevocation(event);
    if (!revoked.ok) return NextResponse.json({ ok: false }, { status: 500 });
    console.info("[PosSquare] webhook-revoked", {
      eventId: event.event_id ?? null,
      revokerType: event.data?.object?.revocation?.revoker_type ?? null,
      changed: revoked.changed,
      ...(revoked.skipped ? { skipped: revoked.skipped } : {}),
    });
    return NextResponse.json({ ok: true });
  }

  if (event.type !== "gift_card.activity.created" && event.type !== "gift_card.activity.updated") {
    console.info("[PosSquare] webhook-ignored", { type: event.type ?? null });
    return NextResponse.json({ ok: true });
  }

  const activity = event.data?.object?.gift_card_activity;
  if (!activity) return NextResponse.json({ ok: true });

  const result = await recordSquareGiftCardActivity(activity);
  if (!result.ok) return NextResponse.json({ ok: false }, { status: 500 });
  console.info("[PosSquare] webhook-activity", {
    eventId: event.event_id ?? null,
    type: activity.type ?? null,
    matched: result.matched,
    ...(result.matched && result.skipped ? { skipped: result.skipped } : {}),
  });
  return NextResponse.json({ ok: true });
}
