export type AdSlot =
  | "header"
  | "inline-content"
  | "sidebar"
  | "mid-content"
  | "leaderboard-sidebar"
  | "footer"
  | "mobile-adhesion"
  | "popup-on-entry"
  | "popup-on-scroll"
  | "venue-leaderboard-rows-1-10"
  | "venue-leaderboard-rows-11-20"
  | "venue-leaderboard-rows-21-30"
  | "venue-leaderboard-rows-31-40"
  | "venue-leaderboard-rows-41-50"
  | "pickem-inline-cards-1-5"
  | "pickem-inline-cards-6-10"
  | "pickem-inline-cards-11-15"
  | "pickem-inline-cards-16-20"
  | "pickem-inline-cards-21-25"
  | "pickem-inline-cards-26-30";

export type AdPageKey =
  | "global"
  | "join"
  | "venue"
  | "trivia"        // kept for backward compat — existing DB records use this key
  | "speed-trivia"
  | "live-trivia"
  | "sports-bingo"
  | "pickem"
  | "fantasy";

export type AdType = "popup" | "banner" | "inline";

export type AdDisplayTrigger = "on-load" | "on-scroll" | "round-end";

export type PredictionStatus = "pending" | "won" | "lost" | "push" | "canceled";

export interface Venue {
  id: string;
  name: string;
  displayName?: string;
  logoText?: string;
  iconEmoji?: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  county?: string;
  region?: string;
  latitude: number;
  longitude: number;
  radius: number;
  placeId?: string;
}

export interface User {
  id: string;
  authId?: string;
  username: string;
  venueId: string;
  points: number;
  createdAt?: string;
}

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  acceptableAnswers?: string[];
  category?: string;
  difficulty?: string;
  questionPool?: "anytime_blitz" | "live_showdown";
  answerFormat?: "multiple_choice" | "write_in" | "numeric" | "true_false";
  createdAt?: string;
  /** Fully-qualified image URL to display above the question text (e.g. an Unsplash photo URL or Wikimedia map SVG). */
  imageUrl?: string;
  /** Attribution text required by the image source (e.g. "Photo by Jane Doe on Unsplash"). */
  imageCredit?: string;
}

export interface TriviaAnswer {
  id: string;
  userId: string;
  questionId: string;
  answer: number;
  isCorrect: boolean;
  timeElapsed: number;
  answeredAt: string;
}

export interface PredictionOutcome {
  id: string;
  title: string;
  probability: number;
}

export interface Prediction {
  id: string;
  question: string;
  source: "mock" | "polymarket" | "odds-api";
  closesAt: string;
  outcomes: PredictionOutcome[];
  category?: string;
  sport?: string;
  league?: string;
  tags?: string[];
  createdAt?: string;
  volume?: number;
  liquidity?: number;
  isClosed?: boolean;
}

export interface UserPrediction {
  id: string;
  userId: string;
  predictionId: string;
  outcomeId: string;
  outcomeTitle: string;
  points: number;
  status: PredictionStatus;
  marketQuestion?: string;
  marketClosesAt?: string;
  marketSport?: string;
  marketLeague?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  venueId: string;
  points: number;
  rank: number;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: string;
  linkUrl?: string;
}

export type ChallengeGameType =
  | "pickem"
  | "fantasy"
  | "speed-trivia"
  | "live-trivia"
  | "trivia"
  | "bingo";
export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "canceled"
  | "expired"
  | "completed";

export interface ChallengeInvite {
  id: string;
  venueId: string;
  gameType: ChallengeGameType;
  senderUserId: string;
  senderUsername: string;
  receiverUserId: string;
  receiverUsername: string;
  challengeTitle: string;
  challengeDetails?: string;
  status: ChallengeStatus;
  weekStart: string;
  expiresAt?: string;
  createdAt: string;
  respondedAt?: string;
}

export type PrizeType = "wine_bottle" | "free_appetizer" | "gift_certificate";

export type CampaignRecurringType = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type ChallengeScheduleType = "single_day" | "multi_day" | "recurring" | "one_time";
export type ChallengeImageFitMode = "cover" | "contain";
export type ChallengeMode = "progress" | "leaderboard";
export type ChallengeLeaderboardTiebreaker = "first_to_score" | "latest_activity";
export interface ChallengeLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  points: number;
  updatedAt: string;
}
export interface ChallengeLeaderboardViewer {
  rank: number | null;
  userId: string;
  username?: string | null;
  points: number;
  inTop: boolean;
}

export interface ChallengeCampaign {
  id: string;
  createdAt: string;
  name: string;
  imageUrl?: string;
  imageScale?: number;
  imageFocusX?: number;
  imageFocusY?: number;
  imageFit?: ChallengeImageFitMode;
  rules: string;
  venueIds: string[];
  scheduleType: ChallengeScheduleType;
  activeDays: string[];
  startDate?: string;
  startTime?: string;
  endDay?: string;
  endTime?: string;
  endDate?: string;
  gameTypes: ChallengeGameType[];
  challengeMode: ChallengeMode;
  leaderboardDisplayLimit: number;
  leaderboardTiebreaker: ChallengeLeaderboardTiebreaker;
  leaderboard?: {
    topEntries: ChallengeLeaderboardEntry[];
    viewer: ChallengeLeaderboardViewer | null;
    isBetweenCycles?: boolean;
    nextCycleStart?: string;
  };
  pointMultiplier: number;
  pointsRequiredToWin: number;
  recurringType: CampaignRecurringType;
  displayOrder?: number | null;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  prizeClaimedAt?: string | null;
  prizeType?: PrizeType | null;
  prizeGiftCertificateAmount?: number | null;
  isActive: boolean;
}

export interface ChallengeCampaignWin {
  challengeId: string;
  venueId: string;
  challengeName: string;
  challengeRules: string;
  winnerUserId: string;
  winnerUsername?: string | null;
  cycleStart?: string | null;
  claimedAt?: string | null;
  prizeType?: PrizeType | null;
  prizeGiftCertificateAmount?: number | null;
  prizeExpiresAt?: string | null;
  prizeRedeemedAt?: string | null;
}

export interface ChallengeCampaignProgress {
  id: string;
  challengeId: string;
  userId: string;
  venueId: string;
  pointsEarned: number;
  updatedAt: string;
}

export interface WeeklyPrize {
  id: string;
  venueId: string;
  weekStart: string;
  prizeTitle: string;
  prizeDescription?: string;
  rewardPoints: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PrizeWinStatus = "awarded" | "claimed";

export interface PrizeWin {
  id: string;
  venueId: string;
  userId: string;
  weekStart: string;
  prizeTitle: string;
  prizeDescription?: string;
  rewardPoints: number;
  status: PrizeWinStatus;
  awardedAt: string;
  claimedAt?: string;
}

export type RedeemablePrize =
  | {
      source: "weekly";
      id: string;
      venueId: string;
      challengeName: string;
      prizeTitle: string;
      prizeDescription?: string;
      rewardPoints: number;
      status: PrizeWinStatus;
      awardedAt: string;
      claimedAt?: string | null;
      expiresAt?: never;
    }
  | {
      source: "challenge";
      id: string;
      venueId: string;
      challengeName: string;
      prizeType: PrizeType;
      prizeGiftCertificateAmount?: number | null;
      awardedAt: string;
      expiresAt: string;
      redeemedAt?: string | null;
    };

export interface Advertisement {
  id: string;
  slot: AdSlot;
  slotKey: string;
  priority: number;
  isPlaceholder?: boolean;
  pageKey: AdPageKey;
  // Distinct taxonomy: popup (interruptive), banner (persistent strip), inline (embedded content).
  adType: AdType;
  displayTrigger: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
  venueIds: string[] | null;
  targetAllVenues?: boolean;
  cities: string[] | null;
  zipCodes: string[] | null;
  counties: string[] | null;
  states: string[] | null;
  regions: string[] | null;
  /** Backward-compat aliases while older callers migrate. */
  targetCities?: string[];
  targetZipCodes?: string[];
  targetCounties?: string[];
  targetStates?: string[];
  targetRegions?: string[];
  advertiserName: string;
  /** How often the ad is served: 1 = every load, N = every Nth load (modulo counter). */
  frequencyInterval: number;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
  dismissDelaySeconds: number;
  popupCooldownSeconds: number;
  active: boolean;
  startDate: string;
  endDate?: string;
  impressions?: number;
  clicks?: number;
}

export interface AdSlotConfig {
  slot: AdSlot;
  width: number;
  height: number;
  mobileWidth?: number;
  mobileHeight?: number;
}

export interface AdCampaign {
  id: string;
  slot_key: string;
  priority: number;
  size: string;
  content: string;
  enabled: boolean;
  createdAt?: string;
}

export interface PickEmGame {
  id: string;
  home_team: string;
  away_team: string;
  home_team_id: string;
  away_team_id: string;
  start_time: string;
}

export interface VenueOwner {
  id: string;
  authId: string;
  email: string;
  name: string;
  createdAt?: string;
}

export interface BillingSubscription {
  id: string;
  venueId: string;
  planType: string;
  amountCents: number;
  status: 'active' | 'past_due' | 'cancelled';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt?: string;
}

// ── Scategories ──────────────────────────────────────────────────────────────

export type ScategoriesSessionStatus  = 'lobby' | 'active' | 'scoring' | 'complete';
export type ScategoriesRoundStatus    = 'active' | 'scoring' | 'complete';
export type ScategoriesRecurringType  = 'none' | 'daily' | 'weekly';

export interface ScategoriesSchedule {
  id:             string;
  venueId:        string;
  title:          string;
  startTime:      string;
  timezone:       string;
  recurringType:  ScategoriesRecurringType;
  recurringDays:  string[];
  windowMinutes:  number;
  isActive:       boolean;
  createdAt:      string;
  updatedAt:      string;
}

export type ScategoriesSessionSource = 'manual' | 'auto';

export interface ScategoriesSession {
  id:             string;
  venueId:        string;
  status:         ScategoriesSessionStatus;
  source:         ScategoriesSessionSource;
  scheduledEndAt: string | null;
  createdAt:      string;
  completedAt:    string | null;
}

export interface ScategoriesRound {
  id:               string;
  sessionId:        string;
  venueId:          string;
  letter:           string;
  categorySetIndex: number;
  categories:       string[];
  startedAt:        string;
  endsAt:           string;
  status:           ScategoriesRoundStatus;
  createdAt:        string;
}

export interface ScategoriesSubmission {
  id:               string;
  roundId:          string;
  venueId:          string;
  userId:           string;
  authId:           string;
  categoryIndex:    number;
  answer:           string;
  normalizedAnswer: string;
  isUnique:         boolean | null;
  isValid:          boolean | null;
  pointsAwarded:    number;
  submittedAt:      string;
}

/** Shape returned by the results API after scoring — one entry per category */
export interface ScategoriesCategoryResult {
  categoryIndex: number;
  category:      string;
  answers: {
    userId:        string;
    username:      string;
    answer:        string;
    isUnique:      boolean;
    isValid:       boolean | null;
    pointsAwarded: number;
  }[];
}

export interface ScategoriesRoundResults {
  roundId:    string;
  letter:     string;
  categories: string[];
  results:    ScategoriesCategoryResult[];
  totals: {
    userId:   string;
    username: string;
    points:   number;
  }[];
}

// ── BillingInvoice ────────────────────────────────────────────────────────────

export interface BillingInvoice {
  id: string;
  subscriptionId: string;
  venueId: string;
  description: string;
  amountCents: number;
  status: 'paid' | 'failed' | 'pending';
  slimcdTicket?: string;
  chargedAt: string;
}
