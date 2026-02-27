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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
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
      const hasNewPointsNotification = newItems.some(
        (item) => item.type === "success" && item.message.toLowerCase().includes("earned")
      );
      if (hasNewPointsNotification) {
        window.dispatchEvent(
          new CustomEvent("tp:points-updated", {
            detail: { source: "notifications" },
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        Notifications
        {unreadCount > 0 ? (
          <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              type="button"
              onClick={() => {
                void markRead();
              }}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-600">No notifications yet.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-md border p-2 text-xs ${
                    item.read ? "border-slate-200 bg-white text-slate-600" : "border-blue-200 bg-blue-50 text-slate-800"
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
                        className="font-medium text-blue-700 hover:text-blue-900"
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
