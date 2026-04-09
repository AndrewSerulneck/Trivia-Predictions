"use client";

import { useEffect, useRef, useState } from "react";
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
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
    if (!userId) {
      return;
    }

    const poll = () => {
      void loadNotifications(userId);
    };

    const initialTimer = window.setTimeout(poll, 0);
    const interval = window.setInterval(() => {
      poll();
    }, 20000);

    return () => {
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
        <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#d8c4aa] bg-gradient-to-b from-[#fffaf4] to-white shadow-[0_16px_34px_rgba(28,43,58,0.2)]">
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
              <p className="text-xs text-slate-600">No notifications yet. We&apos;ll post updates here.</p>
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
                  <p>{item.message}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    {!item.read ? (
                      <button
                        type="button"
                        onClick={() => {
                          void markRead(item.id);
                        }}
                        className="tp-clean-button rounded-md bg-white px-2 py-1 font-semibold text-blue-700 hover:text-blue-900"
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
