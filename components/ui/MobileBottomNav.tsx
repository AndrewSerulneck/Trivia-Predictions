"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/trivia", label: "Trivia" },
  { href: "/predictions", label: "Picks" },
  { href: "/activity", label: "Activity" },
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-6px_24px_rgba(15,23,42,0.12)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4 gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`pointer-events-auto block rounded-md px-2 py-2 text-center text-xs font-semibold transition ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
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
