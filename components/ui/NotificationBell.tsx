"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { getUserId } from "@/lib/storage";
import type { Notification } from "@/types";

type NotificationPayload = {
  ok: boolean;
  unreadCount?: number;
  items?: Notification[];
  error?: string;
};

function areNotificationsEqual(left: Notification[], right: Notification[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index];
    const r = right[index];
    if (!l || !r) return false;
    if (
      l.id !== r.id ||
      l.message !== r.message ||
      l.type !== r.type ||
      l.createdAt !== r.createdAt ||
      l.read !== r.read ||
      l.linkUrl !== r.linkUrl
    ) {
      return false;
    }
  }
  return true;
}

function extractPointsFromMessage(message: string): number {
  const match =
    message.match(/\+(\d[\d,]*)\s*pts/i) ??
    message.match(/(?:earned|won)\s+([0-9][0-9,]*)\s+points?/i);
  if (!match?.[1]) {
    return 0;
  }
  const normalized = match[1].replace(/,/g, "");
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveCelebrationGame(
  message: string,
  linkUrl: string | null | undefined
): { game: "bingo" | "fantasy" | "pickem"; delta: number } | null {
  const text = message.toLowerCase();
  const delta = extractPointsFromMessage(message);
  if (delta <= 0) return null;
  if (text.includes("bingo board won")) return { game: "bingo", delta };
  if (text.includes("fantasy")) return { game: "fantasy", delta };
  if (linkUrl?.includes("/pickem")) return { game: "pickem", delta };
  return null;
}

function resolveNotificationHref(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("challenge")) {
    return "/pending-challenges";
  }
  if (text.includes("prize")) {
    return "/redeem-prizes";
  }
  if (text.includes("pick 'em") || text.includes("pick em") || text.includes("pick’em")) {
    return "/pickem";
  }
  if (text.includes("fantasy")) {
    return "/fantasy";
  }
  if (text.includes("bingo")) {
    return "/bingo/home";
  }
  if (text.includes("prediction") || text.includes("market") || text.includes("pick")) {
    return "/pickem";
  }
  if (text.includes("trivia") || text.includes("round")) {
    return "/trivia";
  }
  return "/pickem";
}

export function NotificationBell() {
  const router = useRouter();
  // Start false to keep server and client initial HTML consistent.
  // Read from storage after mount to avoid hydration mismatches.
  const [hasUser, setHasUser] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [renderNowMs, setRenderNowMs] = useState(0);
  const userIdRef = useRef("");
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const unreadBadgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  const loadNotifications = async (targetUserId: string) => {
    if (!targetUserId) {
      setUnreadCount(0);
      setItems([]);
      return;
    }

    let payload: NotificationPayload;
    try {
      const response = await fetch(`/api/notifications?userId=${encodeURIComponent(targetUserId)}`, {
        cache: "no-store",
      });
      payload = (await response.json()) as NotificationPayload;
      if (!response.ok || !payload.ok) {
        return;
      }
    } catch {
      return;
    }

    const nextItems = payload.items ?? [];
    const knownIds = knownNotificationIdsRef.current;
    const newItems = nextItems.filter((item) => !knownIds.has(item.id));
    for (const item of nextItems) {
      knownIds.add(item.id);
    }

    if (hasLoadedOnceRef.current) {
      const newPointsNotifications = newItems.filter((item) => {
        if (item.type !== "success") return false;
        const lower = item.message.toLowerCase();
        return lower.includes("earned") || lower.includes("won");
      });
      const delta = newPointsNotifications.reduce((sum, item) => sum + extractPointsFromMessage(item.message), 0);
      if (delta > 0) {
        window.dispatchEvent(
          new CustomEvent("tp:points-updated", {
            detail: { source: "notifications", delta },
          })
        );
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: {
              sourceElementId: "tp-notification-bell",
              delta,
              coins: Math.min(18, Math.max(6, Math.round(delta / 2))),
            },
          })
        );
      }
    }
    hasLoadedOnceRef.current = true;

    const nextUnreadCount = payload.unreadCount ?? 0;
    setUnreadCount((current) => (current === nextUnreadCount ? current : nextUnreadCount));
    setItems((current) => (areNotificationsEqual(current, nextItems) ? current : nextItems));
  };

  useEffect(() => {
    const userId = getUserId() ?? "";
    userIdRef.current = userId;
    // Schedule setHasUser asynchronously to avoid synchronous setState in effect
    const hasUserTimer = window.setTimeout(() => setHasUser(Boolean(userId)), 0);
    if (!userId) {
      return () => window.clearTimeout(hasUserTimer);
    }

    const poll = () => {
      void loadNotifications(userId);
    };

    const initialTimer = window.setTimeout(poll, 0);
    const interval = window.setInterval(() => {
      poll();
    }, 20000);

    return () => {
      window.clearTimeout(hasUserTimer);
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      const dropdown = dropdownRef.current;
      const target = event.target as Node | null;
      // The dropdown is portaled to <body>, so it is outside rootRef — check it
      // explicitly, otherwise clicking inside the menu would close it.
      const insideAnchor = Boolean(root && target && root.contains(target));
      const insideDropdown = Boolean(dropdown && target && dropdown.contains(target));
      if (target && !insideAnchor && !insideDropdown) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialTimeLabelTimer = window.setTimeout(() => {
      setRenderNowMs(Date.now());
    }, 0);
    const timeLabelInterval = window.setInterval(() => {
      setRenderNowMs(Date.now());
    }, 60_000);

    const positionMenu = () => {
      const anchorRect = rootRef.current?.getBoundingClientRect();
      const menuWidth = Math.min(352, window.innerWidth - 16);
      const preferredLeft = (anchorRect?.right ?? window.innerWidth - 8) - menuWidth;
      const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - menuWidth - 8));
      const top = Math.max(8, (anchorRect?.bottom ?? 56) + 8);
      setMenuPosition({ top, left, width: menuWidth });
    };

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.clearTimeout(initialTimeLabelTimer);
      window.clearInterval(timeLabelInterval);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  const markRead = async (notificationId?: string) => {
    const userId = userIdRef.current;
    if (!userId) return;

    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, notificationId }),
    });

    await loadNotifications(userId);
  };

  if (!hasUser) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id="tp-notification-bell"
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-ht-sm border border-ht-border-soft bg-ht-elevated text-base font-semibold text-ht-fg-primary hover:opacity-80 transition-opacity"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `${unreadCount} unread alerts` : "Open alerts"}
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white shadow">
            {unreadBadgeLabel}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[1200] overflow-hidden rounded-ht-lg border border-ht-border-soft bg-[#111827] shadow-ht-modal"
          style={
            menuPosition
              ? { top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, width: `${menuPosition.width}px` }
              : undefined
          }
        >
          <div className="px-4 pt-4 pb-2">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-cyan-400">Recent Activity</p>
          </div>
          {items.length === 0 ? (
            <div className="space-y-1 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-slate-300">No recent activity yet</p>
              <p className="text-xs text-slate-500">
                Game results and points will appear here.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
              {items.map((item) => {
                const points = extractPointsFromMessage(item.message);
                const isPositive = points > 0;
                const isError =
                  item.type === "error" ||
                  item.message.toLowerCase().includes("wrong") ||
                  item.message.toLowerCase().includes("incorrect") ||
                  item.message.toLowerCase().includes("missed");
                const dotColor = isError
                  ? "bg-rose-500"
                  : item.type === "success" || isPositive
                  ? "bg-emerald-400"
                  : "bg-cyan-400";
                const minutesAgo = Math.floor((renderNowMs - new Date(item.createdAt).getTime()) / 60000);
                const timeLabel =
                  minutesAgo < 1
                    ? "Just now"
                    : minutesAgo < 60
                    ? `${minutesAgo} min ago`
                    : `${Math.floor(minutesAgo / 60)} hr ago`;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void markRead(item.id);
                        setOpen(false);
                        const celebration = resolveCelebrationGame(item.message, item.linkUrl);
                        if (celebration) {
                          sessionStorage.setItem("tp:celebrate", celebration.game);
                          sessionStorage.setItem("tp:celebrate:delta", String(celebration.delta));
                        }
                        router.push(item.linkUrl ?? resolveNotificationHref(item.message));
                      }}
                      className="tp-clean-button flex w-full items-start gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors"
                    >
                      <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className={`block text-sm leading-snug ${item.read ? "text-slate-400" : "text-slate-100"}`}>
                          {item.message}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                          {timeLabel}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-sm font-black tabular-nums ${
                          isPositive
                            ? "text-emerald-400"
                            : isError
                            ? "text-rose-400"
                            : "text-slate-500"
                        }`}
                      >
                        {isPositive ? `+${points}` : isError ? "0" : "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-slate-800 px-4 py-2.5">
            <button
              type="button"
              onClick={() => { void markRead(); }}
              className="tp-clean-button text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Mark all read
            </button>
          </div>
        </div>,
            document.body
          )
        : null}
    </div>
  );
}
