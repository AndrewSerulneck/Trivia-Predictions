import type { PromoFormat } from "@/lib/promo/promoEndCard";
import type { SocialConnectResult } from "@/lib/social/socialTypes";

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
  intro: "Pick a game. We make the picture; you post it.",
  gameHeading: "Game",
  /** Prizes, the bar's name, address and Instagram handle: each ticked on or off for this post only. */
  pictureHeading: "On the picture",
  prizeLabel: "Prize",
  nameLabel: "Bar name",
  addressLabel: "Address",
  instagramHandle: "Instagram handle",
  detailsLoadFailed: "Couldn't load your address and Instagram handle.",
  detailsRetry: "Try again",
  saveHandle: "Save",
  savingHandle: "Saving…",
  formatHeading: "Size",
  previewHeading: "Preview",
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
  making: "Making your picture…",
  renderFailed: "Couldn't make the picture. Try again.",
  retry: "Try again",
  loading: "Loading your games…",
  loadFailed: "Couldn't load your games and prizes. Close this and try again.",
  noGames: "Schedule a game or offer a prize first, then come back to share it.",
  saved: "Saved to your downloads.",
  shareUnavailable: "Sharing isn't available here, so the picture was downloaded instead.",
  noPrizeShown: "No prize on this picture.",
} as const;

// "Post now" to Instagram (Phase 5) and a Facebook Page (Phase 6), docs/partner-social-promo-plan.md,
// behind NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED. Not shown on the sheet today (D32); kept ready.

type SocialName = "Instagram" | "Facebook";

export const SOCIAL_POST_COPY = {
  heading: "Post now",
  intro: "Post straight to your Instagram and Facebook Page. Connect once.",
  requirement: "Instagram needs a business or creator account linked to your Facebook Page.",
  connect: "Connect Instagram & Facebook",
  providers: { instagram: "Instagram", facebook: "Facebook" } satisfies Record<"instagram" | "facebook", SocialName>,
  rowHeading: { instagram: "Instagram", facebook: "Facebook Page" },
  notConnected: "Not connected",
  connectOne: "Connect",
  reconnect: "Reconnect",
  reconnectHint: (name: SocialName) => `${name} stopped accepting our posts. Connect again to keep posting.`,
  chooseHeading: { instagram: "Which Instagram account?", facebook: "Which Facebook Page?" },
  connectedAs: {
    instagram: (username: string | null) => (username ? `@${username}` : "Connected"),
    facebook: (pageName: string | null) => pageName ?? "Connected",
  },
  disconnect: "Disconnect",
  disconnectConfirm: (name: SocialName) => `Disconnect ${name}? Posts already on ${name} stay there.`,
  cancel: "Cancel",
  postNow: (name: SocialName, format: "post" | "story" | "reel") =>
    format === "reel" ? `Post Reel to ${name}` : format === "story" ? `Post Story to ${name}` : `Post to ${name}`,
  facebookNoStory: "Facebook Pages take Posts and Reels. Pick one of those to post here.",
  makeReelFirst: "Make the Reel first, then post it.",
  captionLabel: "Caption",
  storyNoCaption: "Instagram doesn't show captions on Stories.",
  uploading: "Uploading…",
  sending: (name: SocialName) => `Sending to ${name}…`,
  processing: (name: SocialName) => `${name} is processing your post. This can take a minute.`,
  stillProcessing: (name: SocialName) => `Still processing. It will appear on ${name} soon; check Recent posts later.`,
  posted: (name: SocialName) => `Posted to ${name}.`,
  view: (name: SocialName) => `View on ${name}`,
  leftToday: (left: number) => (left === 1 ? "1 post left today" : `${left} posts left today`),
  noneLeft: "You've reached today's limit for Post now. Share it yourself, or try again tomorrow.",
  recentHeading: "Recent posts",
  loadFailed: "Couldn't load your connections.",
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
    reconnect: "Connect again to keep posting.",
    rate_limit: "The daily posting limit was reached. Try again tomorrow.",
    media_rejected: "This file wasn't accepted. Try making it again.",
    expired: "That took too long. Try posting again.",
    upload_missing: "The file didn't upload. Try again.",
    /** Phase 14: names the provider (it was "Check your Page", wrong for Instagram). */
    unconfirmed: (name: SocialName) => `We couldn't confirm this posted. Check ${name} before posting again.`,
    failed: "Couldn't post. Try again.",
  },
  /** Recent posts' label for an `unconfirmed` post: never "Didn't post", since it may have. */
  notConfirmed: "Not confirmed",
  results: {
    connected: "Connected.",
    choose_account: "Pick where to post.",
    no_instagram:
      "We couldn't find an Instagram business or creator account or a Facebook Page you can post to. In Instagram, switch to a professional account and link it to your Facebook Page, then connect again.",
    facebook_only:
      "Your Facebook Page is connected. To post to Instagram too, switch it to a professional account, link it to the Page, and connect again.",
    instagram_declined:
      "Your Facebook Page is connected. Instagram wasn't switched on, so to post there, connect again and leave Instagram on.",
    facebook_declined:
      "Instagram is connected. Posting to your Facebook Page wasn't switched on, so to post there, connect again and leave it on.",
    facebook_no_page:
      "Instagram is connected. We didn't find a Facebook Page you can post to. To post there, you need permission to create posts on the Page. Then connect again.",
    instagram_declined_no_page:
      "Nothing was connected. Instagram wasn't switched on, and we didn't find a Facebook Page you can post to. Connect again and leave Instagram on.",
    facebook_declined_no_instagram:
      "Nothing was connected. Posting to your Facebook Page wasn't switched on, and we didn't find an Instagram professional account linked to it. Connect again and leave it on.",
    missing_permissions: "Facebook didn't give us permission to post. Connect again and leave every option on.",
    denied: "Nothing was connected.",
    expired: "That took too long. Connect again.",
    not_configured: "Post now isn't set up yet.",
    error: "Couldn't connect. Please try again.",
  } satisfies Record<SocialConnectResult, string>,
} as const;
