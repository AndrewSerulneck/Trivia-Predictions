import { BookOpen, CreditCard, SlidersHorizontal, Tv, UserRound, type LucideIcon } from "lucide-react";

// The Partner Dashboard menu rows, in display order
// (docs/partner-dashboard-app-redesign-plan.md §4b). Sign Out is NOT a row: it
// renders after the divider, last, from OwnerAppBar. tests/owner-menu-contract.test.ts
// pins this order.

export type OwnerMenuItem =
  | { id: "display" | "billing" | "game-settings" | "account"; label: string; hint: string; icon: LucideIcon; href: string }
  | { id: "manual"; label: string; hint: string; icon: LucideIcon; href?: undefined };

export const OWNER_MENU_ITEMS: readonly OwnerMenuItem[] = [
  { id: "display", label: "Venue Display", hint: "Put games on your TVs", icon: Tv, href: "/owner/display" },
  { id: "billing", label: "Billing", hint: "Plan, card & invoices", icon: CreditCard, href: "/owner/billing" },
  { id: "manual", label: "Partner Manual", hint: "How Hightop works", icon: BookOpen },
  {
    id: "game-settings",
    label: "Game Settings",
    hint: "How games are scored",
    icon: SlidersHorizontal,
    href: "/owner/game-settings",
  },
  { id: "account", label: "Account Settings", hint: "Email & password", icon: UserRound, href: "/owner/account" },
];
