import { NextResponse } from "next/server";
import { getActiveAdForSlot, getAdForSlotKey } from "@/lib/ads";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType } from "@/types";

function isAdSlot(value: string): value is AdSlot {
  return [
    "header",
    "inline-content",
    "sidebar",
    "mid-content",
    "leaderboard-sidebar",
    "footer",
    "mobile-adhesion",
    "popup-on-entry",
    "popup-on-scroll",
  ].includes(value);
}

function isAdPageKey(value: string): value is AdPageKey {
  return ["global", "join", "venue", "trivia", "sports-bingo", "pickem", "fantasy"].includes(value);
}

function isAdType(value: string): value is AdType {
  return ["popup", "banner", "inline"].includes(value);
}

function isAdDisplayTrigger(value: string): value is AdDisplayTrigger {
  return ["on-load", "on-scroll", "round-end"].includes(value);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slotKeyParam = (searchParams.get("slotKey") ?? "").trim();
    const slotParam = (searchParams.get("slot") ?? "").trim();
    const venueId = (searchParams.get("venueId") ?? "").trim() || undefined;
    const excludeAdIds = (searchParams.get("excludeAdIds") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const allowAnyVenue =
      (searchParams.get("allowAnyVenue") ?? "").trim() === "1" ||
      (searchParams.get("allowAnyVenue") ?? "").trim().toLowerCase() === "true";
    const clientCounterRaw = Number.parseInt(searchParams.get("clientCounter") ?? "", 10);
    const clientCounter = Number.isFinite(clientCounterRaw) ? clientCounterRaw : 0;

    // New canonical path: ?slotKey=venue-popup-on-entry
    if (slotKeyParam) {
      const ad = await getAdForSlotKey(slotKeyParam, venueId, {
        excludeAdIds,
        allowAnyVenue,
        clientCounter,
      });
      return NextResponse.json({ ok: true, ad });
    }

    // Legacy path: ?slot=popup-on-entry&pageKey=venue&adType=popup&...
    if (!isAdSlot(slotParam)) {
      return NextResponse.json({ ok: false, error: "Provide slotKey or a valid slot." }, { status: 400 });
    }

    const pageKeyParam = (searchParams.get("pageKey") ?? "").trim();
    const adTypeParam = (searchParams.get("adType") ?? "").trim();
    const displayTriggerParam = (searchParams.get("displayTrigger") ?? "").trim();
    const placementKey = (searchParams.get("placementKey") ?? "").trim() || undefined;
    const roundNumberRaw = Number.parseInt(searchParams.get("roundNumber") ?? "", 10);
    const sequenceIndexRaw = Number.parseInt(searchParams.get("sequenceIndex") ?? "", 10);

    if (pageKeyParam && !isAdPageKey(pageKeyParam)) {
      return NextResponse.json({ ok: false, error: "Invalid page key." }, { status: 400 });
    }
    if (adTypeParam && !isAdType(adTypeParam)) {
      return NextResponse.json({ ok: false, error: "Invalid ad type." }, { status: 400 });
    }
    if (displayTriggerParam && !isAdDisplayTrigger(displayTriggerParam)) {
      return NextResponse.json({ ok: false, error: "Invalid ad display trigger." }, { status: 400 });
    }

    const ad = await getActiveAdForSlot(slotParam, venueId, {
      pageKey: isAdPageKey(pageKeyParam) ? pageKeyParam : undefined,
      adType: isAdType(adTypeParam) ? adTypeParam : undefined,
      displayTrigger: isAdDisplayTrigger(displayTriggerParam) ? displayTriggerParam : undefined,
      placementKey,
      roundNumber: Number.isFinite(roundNumberRaw) ? roundNumberRaw : undefined,
      sequenceIndex: Number.isFinite(sequenceIndexRaw) ? sequenceIndexRaw : undefined,
      clientCounter,
      excludeAdIds,
      allowAnyVenue,
    });
    return NextResponse.json({ ok: true, ad });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load ad slot.",
      },
      { status: 500 }
    );
  }
}
