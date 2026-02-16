export type AdSlot =
  | "header"
  | "inline-content"
  | "sidebar"
  | "mid-content"
  | "leaderboard-sidebar"
  | "footer";

export type PredictionStatus = "pending" | "won" | "lost" | "push" | "canceled";

export interface Venue {
  id: string;
  name: string;
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
  source: "mock" | "polymarket";
  closesAt: string;
  outcomes: PredictionOutcome[];
}

export interface UserPrediction {
  id: string;
  userId: string;
  predictionId: string;
  outcomeId: string;
  outcomeTitle: string;
  points: number;
  status: PredictionStatus;
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

export interface Advertisement {
  id: string;
  slot: AdSlot;
  venueId?: string;
  advertiserName: string;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
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
