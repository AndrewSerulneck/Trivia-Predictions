import {
  BookOpen,
  CreditCard,
  ShoppingBag,
  SlidersHorizontal,
  Tv,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { OwnerSheetId } from "@/lib/ownerSheetParams";

// The Partner Dashboard menu rows, in display order
// (docs/partner-dashboard-app-redesign-plan.md §4b; Order Join Merch added by
// docs/join-merch-store-plan.md). Sign Out is NOT a row: it renders after the
// divider, last, from OwnerAppBar. tests/owner-menu-contract.test.ts pins this order.
//
// Three kinds of row:
//   - a link (`href`): navigates once the drawer has slid away;
//   - the Partner Manual (`id: "manual"`): opens the manual's local-state sheet;
//   - a dashboard sheet (`sheet`): opens that URL-mirrored dashboard sheet
//     (`?sheet=…`, lib/ownerSheetParams.ts) once the drawer has slid away.

type OwnerMenuRowBase = { label: string; hint: string; icon: LucideIcon };

export type OwnerMenuItem =
  | (OwnerMenuRowBase & {
      id: "display" | "billing" | "game-settings" | "account";
      href: string;
      sheet?: undefined;
    })
  | (OwnerMenuRowBase & { id: "manual"; href?: undefined; sheet?: undefined })
  | (OwnerMenuRowBase & { id: "store"; sheet: OwnerSheetId; href?: undefined });

export const OWNER_MENU_ITEMS: readonly OwnerMenuItem[] = [
  { id: "display", label: "Venue Display", hint: "Put games on your TVs", icon: Tv, href: "/owner/display" },
  { id: "store", label: "Order Join Merch", hint: "QR coasters, tents & table cards", icon: ShoppingBag, sheet: "store" },
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
