"use client";

import { usePathname, useRouter } from "next/navigation";
import { SignOutButton } from "@/components/navigation/SignOutButton";

// ─────────────────────────────────────────────────────────────────────────────
// AccountMenuList — THE player account menu.
//
// There are two player drawers and there always have been: `AccountMenu`
// (non-venue pages, portalled out of the AppBar) and the inline drawer in
// `VenueHubClient` (venue home, which also carries the profile/points card and
// the passkey-setup block). They are not merged — their shells differ — but
// they no longer own separate copies of the list. Both render this.
//
// Add or reorder a menu item HERE and both drawers move together. That is the
// whole point: docs/navigation-unification-plan.md §2c-3 records the two lists
// drifting, with Sign Out present on only one of them.
//
// Sign Out is the last row, below the nav items, and is `SignOutButton` — never
// a hand-rolled teardown. See §2d for why anything less than the full sequence
// strands the HttpOnly `tp_sess` cookie.
// ─────────────────────────────────────────────────────────────────────────────

export type AccountMenuItem = {
  label: string;
  description: string;
  href: string;
};

export const ACCOUNT_MENU_ITEMS: readonly AccountMenuItem[] = [
  {
    label: "Career Stats",
    description: "Track your lifetime performance across every game.",
    href: "/active-games",
  },
  {
    label: "FAQs",
    description: "Get quick answers about gameplay and prizes.",
    href: "/faqs",
  },
  {
    label: "Advertise With Us",
    description: "Submit the advertiser intake form.",
    href: "/advertise",
  },
  {
    label: "Redeem Prizes",
    description: "See earned rewards and prize redemptions.",
    href: "/redeem-prizes",
  },
] as const;

export function isActiveMenuPath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === href;
  }
  if (href.startsWith("/venue/")) {
    return pathname.startsWith("/venue/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type AccountMenuListProps = {
  /** Closes the host drawer. Fires before navigation and before sign-out teardown. */
  onNavigate: () => void;
  /** Shows the amber dot beside "Redeem Prizes". */
  hasUnclaimedPrize?: boolean;
};

export function AccountMenuList({ onNavigate, hasUnclaimedPrize = false }: AccountMenuListProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav aria-label="Primary navigation">
      <ul className="space-y-3">
        {ACCOUNT_MENU_ITEMS.map((item) => {
          const active = isActiveMenuPath(pathname, item.href);
          return (
            <li key={`${item.label}:${item.href}`}>
              <button
                type="button"
                onClick={() => {
                  onNavigate();
                  router.push(item.href);
                }}
                className={`w-full rounded-ht-lg border px-4 py-3.5 text-left ${
                  active
                    ? "border-ht-border-strong bg-ht-elevated text-ht-fg-primary"
                    : "border-ht-border-hairline bg-ht-elevated/50 text-ht-fg-secondary hover:border-ht-border-soft hover:bg-ht-elevated"
                }`}
              >
                <div className="flex items-center gap-2 text-lg font-black leading-tight">
                  {item.label}
                  {item.href === "/redeem-prizes" && hasUnclaimedPrize ? (
                    <span
                      className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400"
                      aria-label="Unclaimed prize"
                    />
                  ) : null}
                </div>
                <div className={`mt-1 text-sm leading-snug ${active ? "text-ht-fg-secondary" : "text-ht-fg-muted"}`}>
                  {item.description}
                </div>
              </button>
            </li>
          );
        })}
        {/* Below a divider — Sign Out is deliberately separated from the
            navigation items so it can never be tapped by muscle memory. */}
        <li className="!mt-4 border-t border-ht-border-hairline pt-4">
          <SignOutButton variant="player" onSignedOut={onNavigate} />
        </li>
      </ul>
    </nav>
  );
}
