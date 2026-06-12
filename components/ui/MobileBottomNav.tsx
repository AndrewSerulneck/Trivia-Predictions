"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

const NAV_ITEMS = [
  { href: "/trivia", label: APP_PAGE_NAMES.trivia },
  { href: "/pickem", label: APP_PAGE_NAMES.sportsPickEm },
  { href: "/fantasy", label: APP_PAGE_NAMES.sportsFantasy },
  { href: "/bingo", label: APP_PAGE_NAMES.sportsBingo },
  { href: "/leaderboard", label: "Leaders" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const hideOnPath = pathname === "/" || pathname === "/join";

  if (hideOnPath) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-ht-border-hairline bg-ht-surface/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-6px_24px_rgba(0,0,0,0.45)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`pointer-events-auto block rounded-md px-2 py-2 text-center text-xs font-semibold transition ${
                  isActive ? "bg-ht-elevated text-ht-fg-primary border border-ht-border-soft" : "text-ht-fg-muted hover:text-ht-fg-primary hover:bg-ht-elevated"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
