"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import type { Notification } from "@/types";

type NotificationPayload = {
  ok: boolean;
  unreadCount?: number;
  items?: Notification[];
  error?: string;
};

function extractPointsFromMessage(message: string): number {
  const match = message.match(/(?:earned|won)\s+([0-9][0-9,]*)\s+points?/i);
  if (!match?.[1]) {
    return 0;
  }
  const normalized = match[1].replace(/,/g, "");
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resolveNotificationHref(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("bingo")) {
    return "/bingo";
  }
  if (text.includes("prediction") || text.includes("market") || text.includes("pick")) {
    return "/predictions";
  }
  if (text.includes("trivia") || text.includes("round")) {
    return "/trivia";
  }
  return "/activity";
}

export function NotificationBell() {
  const router = useRouter();
  // Start false to keep server and client initial HTML consistent.
  // Read from storage after mount to avoid hydration mismatches.
  const [hasUser, setHasUser] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const userIdRef = useRef("");
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);

  const loadNotifications = async (targetUserId: string) => {
    if (!targetUserId) {
      setUnreadCount(0);
      setItems([]);
      return;
    }

    const response = await fetch(`/api/notifications?userId=${encodeURIComponent(targetUserId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as NotificationPayload;
    if (!payload.ok) {
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

    setUnreadCount(payload.unreadCount ?? 0);
    setItems(nextItems);
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
      const target = event.target as Node | null;
      if (root && target && !root.contains(target)) {
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
        className="tp-clean-button inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-[#f9f1e6] to-[#f5ddbf] px-3 py-1.5 text-sm font-semibold text-[#1c2b3a] hover:from-[#fff6ea] hover:to-[#f9e3c8]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden="true">🔔</span>
        Alerts
        {unreadCount > 0 ? (
          <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed z-30 overflow-hidden rounded-xl border border-[#d8c4aa] bg-gradient-to-b from-[#fffaf4] to-white shadow-[0_16px_34px_rgba(28,43,58,0.2)]"
          style={
            menuPosition
              ? { top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, width: `${menuPosition.width}px` }
              : undefined
          }
        >
          <div className="flex items-center justify-between border-b border-[#eadbcc] bg-[#fdf3e7] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#1c2b3a]">Notifications</p>
              <p className="text-[11px] text-[#6b7280]">Recent account and game updates</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void markRead();
              }}
              className="tp-clean-button shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#1c2b3a] hover:bg-[#fff8ef]"
            >
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <div className="space-y-1 px-4 py-6 text-center">
              <p className="text-2xl" aria-hidden="true">
                🔕
              </p>
              <p className="text-sm font-semibold text-[#1c2b3a]">You&apos;re all caught up</p>
              <p className="text-xs text-slate-600">
                This is where we let you know if your predictions were correct.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto p-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border p-3 text-xs shadow-sm ${
                    item.read ? "border-[#eadbcc] bg-white text-slate-600" : "border-[#d5e4f3] bg-[#f3f8ff] text-slate-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void markRead(item.id);
                      setOpen(false);
                      router.push(resolveNotificationHref(item.message));
                    }}
                    className="tp-clean-button w-full text-left"
                  >
                    <p>{item.message}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span className="rounded-md bg-white px-2 py-1 font-semibold text-blue-700">View</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
