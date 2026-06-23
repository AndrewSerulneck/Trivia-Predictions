"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Menu } from "lucide-react";
import { getUserId, getUsername, getVenueId, saveUsername } from "@/lib/storage";
import { setScrollLock } from "@/lib/scrollLock";

type UsernameUpdatePayload = {
  ok?: boolean;
  error?: string;
  retryAfterSeconds?: number;
  user?: {
    id: string;
    username: string;
    venueId: string;
    points: number;
    createdAt?: string;
  };
};

const MENU_ITEMS = [
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

function isActiveMenuPath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === href;
  }
  if (href.startsWith("/venue/")) {
    return pathname.startsWith("/venue/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// AccountMenu — the universal hamburger trigger + slide-out drawer + change
// username modal. Extracted from LeftHamburgerMenu so it can live in the
// in-game AppBar's leading slot, keeping the menu reachable during gameplay.
// Points/score state stays out of here; the unclaimed-prize dot comes in as a
// prop from whichever bar owns the points summary.
export function AccountMenu({
  hasUnclaimedPrize = false,
  triggerClassName,
}: {
  hasUnclaimedPrize?: boolean;
  triggerClassName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const scrollLockOwnerId = useId();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Portal the drawer to document.body so it escapes the AppBar's backdrop-blur
  // containing block (which would otherwise trap and clip this fixed overlay).
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [currentPinDraft, setCurrentPinDraft] = useState("");
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [usernameUpdateMessage, setUsernameUpdateMessage] = useState("");
  const [usernameUpdateError, setUsernameUpdateError] = useState("");

  useEffect(() => {
    setMounted(true);
    const stored = getUsername() ?? "";
    if (stored) {
      setUsername(stored);
    }
  }, []);

  useEffect(() => {
    setScrollLock(`account-menu:${scrollLockOwnerId}`, isMenuOpen, "modal");
    return () => {
      setScrollLock(`account-menu:${scrollLockOwnerId}`, false);
    };
  }, [isMenuOpen, scrollLockOwnerId]);

  const openUsernameModal = useCallback(() => {
    setUsernameDraft((username || "").trim());
    setCurrentPinDraft("");
    setUsernameUpdateError("");
    setUsernameUpdateMessage("");
    setIsUsernameModalOpen(true);
  }, [username]);

  const handleUsernameUpdate = useCallback(async () => {
    const userId = (getUserId() ?? "").trim();
    const venueId = (getVenueId() ?? "").trim();
    const nextUsername = usernameDraft.trim();
    if (!userId || !venueId) {
      setUsernameUpdateError("You must be logged in to change your username.");
      return;
    }
    if (!nextUsername) {
      setUsernameUpdateError("Please enter a new username.");
      return;
    }

    setIsUpdatingUsername(true);
    setUsernameUpdateError("");
    setUsernameUpdateMessage("");
    try {
      const response = await fetch("/api/auth/username/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          venueId,
          newUsername: nextUsername,
          currentPin: currentPinDraft.trim() || undefined,
          reason: "self-service",
        }),
      });
      const payload = (await response.json().catch(() => null)) as UsernameUpdatePayload | null;
      if (!response.ok || !payload?.ok || !payload.user) {
        setUsernameUpdateError(payload?.error || "Unable to update username.");
        return;
      }

      setUsername(payload.user.username);
      saveUsername(payload.user.username);
      setUsernameDraft(payload.user.username);
      setCurrentPinDraft("");
      setUsernameUpdateMessage("Username updated successfully.");
      window.dispatchEvent(new CustomEvent("tp:auth-state-changed"));
    } catch {
      setUsernameUpdateError("Unable to update username right now.");
    } finally {
      setIsUpdatingUsername(false);
    }
  }, [currentPinDraft, usernameDraft]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMenuOpen(true)}
        className={`relative ${
          triggerClassName ??
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ht-border-soft bg-ht-elevated text-ht-fg-primary"
        }`}
        aria-label="Open navigation menu"
        aria-expanded={isMenuOpen}
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
        {hasUnclaimedPrize ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400"
          />
        ) : null}
      </button>

      {mounted
        ? createPortal(
      <div
        data-tp-scroll-lock={isMenuOpen ? "active" : undefined}
        className={`fixed inset-0 z-[1200] ${isMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!isMenuOpen}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen(false)}
          className={`absolute inset-0 h-full w-full bg-black/40 transition-opacity duration-200 ${
            isMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          aria-label="Close navigation menu"
        />

        <aside
          className={`absolute inset-y-0 left-0 w-[22rem] max-w-[92vw] border-r border-ht-border-soft bg-ht-surface px-5 py-5 shadow-ht-modal transition-transform duration-200 ${
            isMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-black tracking-wide text-ht-fg-primary">Menu</h3>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-ht-sm border border-ht-border-soft bg-ht-elevated px-3 py-1.5 text-base font-semibold text-ht-fg-muted"
            >
              Close
            </button>
          </div>

          <div className="mb-4 rounded-ht-lg border border-ht-border-hairline bg-ht-elevated/50 p-3">
            <div className="text-sm font-black text-ht-fg-primary">Profile</div>
            <p className="mt-1 text-xs text-ht-fg-muted">
              Username is case-insensitive for login. Change display casing or pick a new one.
            </p>
            <button
              type="button"
              onClick={openUsernameModal}
              className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-400/15 px-3 py-2 text-sm font-black text-cyan-200"
            >
              Change Username
            </button>
          </div>

          <nav aria-label="Primary navigation">
            <ul className="space-y-3">
              {MENU_ITEMS.map((item) => {
                const active = isActiveMenuPath(pathname, item.href);
                return (
                  <li key={`${item.label}:${item.href}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
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
                        {item.href === "/redeem-prizes" && hasUnclaimedPrize && (
                          <span
                            className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400"
                            aria-label="Unclaimed prize"
                          />
                        )}
                      </div>
                      <div className={`mt-1 text-sm leading-snug ${active ? "text-ht-fg-secondary" : "text-ht-fg-muted"}`}>
                        {item.description}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {isUsernameModalOpen ? (
          <div className="absolute inset-0 z-[1300] flex items-center justify-center bg-black/55 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-ht-border-soft bg-ht-surface p-4 shadow-ht-modal">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-lg font-black text-ht-fg-primary">Change Username</h4>
                <button
                  type="button"
                  onClick={() => setIsUsernameModalOpen(false)}
                  className="rounded-md border border-ht-border-soft bg-ht-elevated px-2 py-1 text-xs font-semibold text-ht-fg-muted"
                >
                  Close
                </button>
              </div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ht-fg-muted">
                New Username
              </label>
              <input
                type="text"
                value={usernameDraft}
                onChange={(event) => setUsernameDraft(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="mb-3 w-full rounded-lg border border-ht-border-soft bg-ht-elevated px-3 py-2 text-sm text-ht-fg-primary outline-none focus:border-cyan-400/50"
              />
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ht-fg-muted">
                Current PIN (for security)
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={currentPinDraft}
                onChange={(event) => setCurrentPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
                className="mb-3 w-full rounded-lg border border-ht-border-soft bg-ht-elevated px-3 py-2 text-sm text-ht-fg-primary outline-none focus:border-cyan-400/50"
              />
              {usernameUpdateError ? (
                <p className="mb-2 rounded-lg border border-rose-400/50 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
                  {usernameUpdateError}
                </p>
              ) : null}
              {usernameUpdateMessage ? (
                <p className="mb-2 rounded-lg border border-emerald-400/50 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200">
                  {usernameUpdateMessage}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleUsernameUpdate()}
                disabled={isUpdatingUsername}
                className="inline-flex min-h-[42px] w-full items-center justify-center rounded-xl bg-cyan-400 px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-50"
              >
                {isUpdatingUsername ? "Updating..." : "Save Username"}
              </button>
            </div>
          </div>
        ) : null}
      </div>,
            document.body
          )
        : null}
    </>
  );
}
