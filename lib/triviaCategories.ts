import {
  PawPrint,
  Globe,
  BookOpen,
  Scroll,
  Music,
  Sparkles,
  FlaskConical,
  Trophy,
  Shuffle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TriviaCategory = {
  slug: string;
  label: string;
  dbValue: string;
  icon: LucideIcon;
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
];

export const ALL_CATEGORIES_SENTINEL = {
  slug: "all",
  label: "All Categories",
  dbValue: null as null,
  icon: Shuffle,
};
