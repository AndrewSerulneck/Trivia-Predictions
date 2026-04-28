export type AdSlot =
  | "header"
  | "inline-content"
  | "sidebar"
  | "mid-content"
  | "leaderboard-sidebar"
  | "footer"
  | "mobile-adhesion"
  | "popup-on-entry"
  | "popup-on-scroll";

export type AdPageKey =
  | "global"
  | "join"
  | "venue"
  | "trivia"
  | "sports-predictions"
  | "sports-bingo";

export type AdType = "popup" | "banner" | "inline";

export type AdDisplayTrigger = "on-load" | "on-scroll" | "round-end";

export type PredictionStatus = "pending" | "won" | "lost" | "push" | "canceled";

export interface Venue {
  id: string;
  name: string;
  displayName?: string;
  logoText?: string;
  iconEmoji?: string;
  address?: string;
  latitude: number;
  longitude: number;
  radius: number;
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
  category?: string;
  difficulty?: string;
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
}

export type ChallengeGameType = "pickem" | "fantasy" | "trivia" | "bingo";
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

export interface Advertisement {
  id: string;
  slot: AdSlot;
  pageKey: AdPageKey;
  adType: AdType;
  displayTrigger: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
  venueId?: string;
  venueIds?: string[];
  advertiserName: string;
  deliveryWeight: number;
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
