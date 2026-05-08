"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { getVenueId } from "@/lib/storage";
import { APP_PAGE_NAMES } from "@/lib/pageNames";
import { setScrollLock } from "@/lib/scrollLock";

const NAV_ITEMS = [
  { href: "/", label: APP_PAGE_NAMES.join },
  { href: "/trivia", label: APP_PAGE_NAMES.trivia },
  { href: "/pickem", label: APP_PAGE_NAMES.sportsPickEm },
  { href: "/fantasy", label: APP_PAGE_NAMES.sportsFantasy },
  { href: "/bingo", label: APP_PAGE_NAMES.sportsBingo },
  { href: "/active-games", label: APP_PAGE_NAMES.activeGames },
  { href: "/faqs", label: APP_PAGE_NAMES.faqs },
  { href: "/advertise", label: "Advertise With Us" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getVenueIdFromPathname(pathname: string): string {
  const match = pathname.match(/^\/venue\/([^/?#]+)/i);
  if (!match?.[1]) {
    return "";
  }
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return String(match[1]).trim();
  }
}

export function LeftHamburgerNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const scrollLockOwnerId = useId();
  const storedVenueId = useSyncExternalStore(
    () => () => {},
    () => (getVenueId() ?? "").trim(),
    () => ""
  );
  const joinedVenueId = getVenueIdFromPathname(pathname) || storedVenueId;

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setIsOpen(false);
    }, 0);
    return () => {
      window.clearTimeout(closeTimer);
    };
  }, [pathname, joinedVenueId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setScrollLock(`left-hamburger:${scrollLockOwnerId}`, isOpen, "modal");
    return () => {
      setScrollLock(`left-hamburger:${scrollLockOwnerId}`, false);
    };
  }, [isOpen, scrollLockOwnerId]);

  const isJoinPage = pathname === "/";
  const isTriviaPage = pathname === "/trivia";

  if (isJoinPage || isTriviaPage || !joinedVenueId) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-lg border border-slate-200 bg-white p-2 text-xl shadow-md md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
      >
        ☰
      </button>

      <div
        data-tp-scroll-lock={isOpen ? "active" : undefined}
        className={`fixed inset-0 z-50 md:hidden ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsOpen(false)}
        />

        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-4 py-4 shadow-xl transition-transform duration-200 ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-semibold">Menu</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md border border-slate-200 px-3 py-1 text-sm"
            >
              ✕
            </button>
          </div>

          <nav aria-label="Mobile navigation" className="min-h-0 flex-1 overflow-y-auto pb-4">
            <ul className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`block rounded-md px-3 py-3 text-base font-semibold ${
                      isActive(pathname, item.href)
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </>
  );
}
