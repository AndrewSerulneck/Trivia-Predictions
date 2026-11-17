import {
  PawPrint,
  Globe,
  BookOpen,
  Scroll,
  Music,
  Sparkles,
  FlaskConical,
  Trophy,
  Newspaper,
  Shuffle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TriviaCategory = {
  slug: string;
  label: string;
  dbValue: string;
  icon: LucideIcon;
  /**
   * Hidden from players until the category has this many active questions (D11). The nightly refreshes one flag
   * per gated category (`speed_trivia_category_flags`); the picker and "All Categories" read it.
   */
  minActiveToShow?: number;
};

export const TRIVIA_CATEGORIES: TriviaCategory[] = [
  { slug: "animals", label: "Animals", dbValue: "Animals", icon: PawPrint },
  { slug: "general-knowledge", label: "General Knowledge", dbValue: "General Knowledge", icon: BookOpen },
  { slug: "geography", label: "Geography", dbValue: "Geography", icon: Globe },
  { slug: "history", label: "History", dbValue: "History", icon: Scroll },
  { slug: "music", label: "Music", dbValue: "Music", icon: Music },
  { slug: "pop-culture", label: "Pop Culture", dbValue: "Pop Culture", icon: Sparkles },
  { slug: "science", label: "Science", dbValue: "Science", icon: FlaskConical },
  { slug: "sports", label: "Sports", dbValue: "Sports", icon: Trophy },
  // D11 (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a): the only new category. Dated questions, retired
  // 12 months after the event month (D16).
  { slug: "current-events", label: "Current Events", dbValue: "Current Events", icon: Newspaper, minActiveToShow: 60 },
];

/** Categories players can't see until they're stocked. Fail closed: a gated category is hidden unless known visible. */
export const GATED_TRIVIA_CATEGORIES: readonly string[] = TRIVIA_CATEGORIES
  .filter((category) => category.minActiveToShow !== undefined)
  .map((category) => category.dbValue);

export const visibleTriviaCategories = (hidden: ReadonlySet<string>): TriviaCategory[] =>
  TRIVIA_CATEGORIES.filter((category) => !hidden.has(category.dbValue));

export const ALL_CATEGORIES_SENTINEL = {
  slug: "all",
  label: "All Categories",
  dbValue: null as null,
  icon: Shuffle,
};
