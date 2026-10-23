"use client";

import { ShareLinkButton } from "@/components/social-share/ShareLinkButton";
import { INVITE_FRIEND_PAYLOAD } from "@/lib/nativeShare";

export const INVITE_FRIEND_LABEL = "Invite a friend";

// Venue screens have a light version, so they use theme tokens; game screens are always dark.
const VENUE_TONE = "!border-ht-border-hairline !bg-ht-elevated !text-ht-fg-primary hover:!bg-ht-elevated/80";

/**
 * Phase 4d: the one "Invite a friend" button (tripwire: tests/native-share-haptics-contract.test.ts).
 * Same payload, same share path (lib/nativeShare.ts) everywhere; no request, no analytics.
 */
export const InviteFriendButton = ({ tone = "venue", className = "" }: { tone?: "venue" | "game"; className?: string }) => (
  <ShareLinkButton
    payload={INVITE_FRIEND_PAYLOAD}
    label={INVITE_FRIEND_LABEL}
    className={`${tone === "venue" ? VENUE_TONE : ""} ${className}`.trim()}
  />
);
