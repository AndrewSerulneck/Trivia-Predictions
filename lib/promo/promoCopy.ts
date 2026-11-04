import type { PromoFormat } from "@/lib/promo/promoEndCard";

/** What the partner picks under Size: a picture (Post / Story) or a Reel with sound. */
export type PromoSize = PromoFormat | "reel";

export const PROMO_SIZES: readonly PromoSize[] = ["post", "story", "reel"];

// Every word the Share to social sheet shows (docs/partner-social-promo-plan.md §4.4, D9). On screen it
// is "Share to social" and "Prize" — never "Reward" (tests/prizes-wording-contract.test.ts).

export const SHARE_SOCIAL_COPY = {
  sheetTitle: "Share to social",
  entryLabel: "Share to social",
  entryHint: "Posts for Instagram & Facebook",
  /** The confirmation toast's follow-up after a new game or prize (plan §4.5). */
  afterCreateAction: "Share to social →",
  intro: "Pick a game. We make the picture and the caption; you post it.",
  gameHeading: "Game",
  prizeHeading: "Show the prize",
  formatHeading: "Size",
  previewHeading: "Preview",
  captionHeading: "Caption",
  detailsHeading: "Your name and handle",
  formats: { post: "Post", story: "Story", reel: "Reel" } satisfies Record<PromoSize, string>,
  formatHints: { post: "Feed post, 4:5", story: "Story, 9:16", reel: "Video with sound" } satisfies Record<PromoSize, string>,
  musicHeading: "Music",
  noMusic: "No music",
  musicHint: "Applause, a drumroll and a crowd cheer are built in.",
  playPreview: "Play preview",
  stopPreview: "Stop",
  makeReel: "Make Reel",
  makingReel: "Making your Reel…",
  reelFailed: "Couldn't make the Reel. Try again.",
  reelUnsupported: "This browser can't make video. Try Chrome or Safari, or share a Post or Story.",
  share: "Share",
  download: "Download",
  copyCaption: "Copy caption",
  captionCopied: "Caption copied",
  making: "Making your picture…",
  renderFailed: "Couldn't make the picture. Try again.",
  retry: "Try again",
  loading: "Loading your games…",
  loadFailed: "Couldn't load your games and prizes. Close this and try again.",
  noGames: "Schedule a game or offer a prize first, then come back to share it.",
  shared: "Shared. The caption is copied: paste it into your post.",
  saved: "Saved. The caption is copied: paste it into your post.",
  shareUnavailable: "Sharing isn't available here, so the picture was downloaded instead.",
  noPrizeShown: "No prize on this picture.",
} as const;

// Instagram "Post now" (docs/partner-social-promo-plan.md Phase 5), behind NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED.
export const SOCIAL_POST_COPY = {
  heading: "Post to Instagram",
  intro: "Post straight to your Instagram. Connect once.",
  requirement: "Needs an Instagram business or creator account linked to a Facebook Page.",
  connect: "Connect Instagram",
  reconnect: "Reconnect Instagram",
  reconnectHint: "Instagram stopped accepting our posts. Connect again to keep posting.",
  chooseHeading: "Which Instagram account?",
  connectedAs: (username: string | null) => (username ? `Connected as @${username}` : "Instagram connected"),
  disconnect: "Disconnect",
  disconnectConfirm: "Disconnect Instagram? Posts already on Instagram stay there.",
  cancel: "Cancel",
  postNow: (format: "post" | "story" | "reel") =>
    format === "reel" ? "Post Reel now" : format === "story" ? "Post Story now" : "Post now",
  makeReelFirst: "Make the Reel first, then post it.",
  storyNoCaption: "Instagram doesn't show captions on Stories.",
  uploading: "Uploading…",
  sending: "Sending to Instagram…",
  processing: "Instagram is processing your post. This can take a minute.",
  stillProcessing: "Still processing. It will appear on Instagram soon; check Recent posts later.",
  posted: "Posted to Instagram.",
  view: "View on Instagram",
  leftToday: (left: number) => (left === 1 ? "1 post left today" : `${left} posts left today`),
  noneLeft: "You've reached today's limit for Post now. Share it yourself, or try again tomorrow.",
  recentHeading: "Recent posts",
  loadFailed: "Couldn't load your Instagram connection.",
  retry: "Try again",
  status: {
    scheduled: "Scheduled",
    uploading: "Uploading",
    publishing: "Sending",
    processing: "Processing",
    published: "Posted",
    failed: "Didn't post",
    cancelled: "Cancelled",
  },
  formats: { post: "Post", story: "Story", reel: "Reel" },
  errors: {
    reconnect: "Instagram needs you to connect again.",
    rate_limit: "Instagram's daily posting limit was reached. Try again tomorrow.",
    media_rejected: "Instagram didn't accept this file.",
    expired: "Instagram took too long. Try posting again.",
    upload_missing: "The file didn't upload. Try again.",
    failed: "Couldn't post. Try again.",
  },
  results: {
    connected: "Instagram connected.",
    choose_account: "Pick which Instagram account to post to.",
    no_instagram:
      "We couldn't find an Instagram business or creator account. In Instagram, switch to a professional account and link it to your Facebook Page, then connect again.",
    missing_permissions: "Facebook didn't give us permission to post. Connect again and leave every option on.",
    denied: "Instagram wasn't connected.",
    expired: "That took too long. Connect again.",
    not_configured: "Posting to Instagram isn't set up yet.",
    error: "Couldn't connect Instagram. Please try again.",
  },
} as const;
