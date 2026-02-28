"use client";

import { useEffect, useMemo, useState } from "react";
import { getUserId } from "@/lib/storage";
import type { Notification, PredictionStatus, UserPrediction } from "@/types";

type PicksFilter = PredictionStatus | "all";
type NotificationFilter = "all" | "unread";
type Tab = "picks" | "notifications";

type PicksPayload = {
  ok: boolean;
  items?: UserPrediction[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
};

type NotificationsPayload = {
  ok: boolean;
  unreadCount?: number;
  items?: Notification[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
};

function statusBadgeClass(status?: PredictionStatus): string {
  if (!status) return "bg-slate-100 text-slate-600";
  if (status === "pending") return "bg-amber-100 text-amber-700";
  if (status === "won") return "bg-emerald-100 text-emerald-700";
  if (status === "lost") return "bg-rose-100 text-rose-700";
  if (status === "push") return "bg-sky-100 text-sky-700";
  if (status === "canceled") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export function ActivityTimeline() {
  const [tab, setTab] = useState<Tab>("picks");
  const [picks, setPicks] = useState<UserPrediction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingPicks, setLoadingPicks] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [picksFilter, setPicksFilter] = useState<PicksFilter>("all");
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [picksPage, setPicksPage] = useState(1);
  const [picksTotalPages, setPicksTotalPages] = useState(1);
  const [picksTotalItems, setPicksTotalItems] = useState(0);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [notificationsTotalPages, setNotificationsTotalPages] = useState(1);
  const [notificationsTotalItems, setNotificationsTotalItems] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasVenueSession, setHasVenueSession] = useState(true);

  useEffect(() => {
    const refresh = () => {
      const userId = getUserId();
      if (!userId) {
        setHasVenueSession(false);
        setPicks([]);
        setNotifications([]);
        setLoadingPicks(false);
        setLoadingNotifications(false);
        return;
      }

      setHasVenueSession(true);
      void loadPicks(userId, picksFilter, picksPage);
      void loadNotifications(userId, notificationFilter, notificationsPage);
    };

    const initialTimer = window.setTimeout(() => {
      refresh();
    }, 0);
    const interval = window.setInterval(() => {
      refresh();
    }, 20000);
    const refreshOnPointsUpdate = () => {
      refresh();
    };
    window.addEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);
    };
  }, [notificationFilter, notificationsPage, picksFilter, picksPage]);

  const loadPicks = async (userId: string, filter: PicksFilter, page: number) => {
    setLoadingPicks(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/picks?userId=${encodeURIComponent(userId)}&status=${encodeURIComponent(filter)}&page=${page}&pageSize=25`,
        { method: "GET", cache: "no-store" }
      );
      const payload = (await response.json()) as PicksPayload;
      if (!payload.ok) {
        throw new Error("Failed to load picks.");
      }
      setPicks(payload.items ?? []);
      setPicksTotalItems(payload.totalItems ?? 0);
      setPicksTotalPages(Math.max(1, payload.totalPages ?? 1));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load picks.");
    } finally {
      setLoadingPicks(false);
    }
  };

  const loadNotifications = async (userId: string, filter: NotificationFilter, page: number) => {
    setLoadingNotifications(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/notifications?userId=${encodeURIComponent(userId)}&filter=${filter}&page=${page}&pageSize=25`,
        { method: "GET", cache: "no-store" }
      );
      const payload = (await response.json()) as NotificationsPayload;
      if (!payload.ok) {
        throw new Error("Failed to load notifications.");
      }
      setNotifications(payload.items ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
      setNotificationsTotalItems(payload.totalItems ?? 0);
      setNotificationsTotalPages(Math.max(1, payload.totalPages ?? 1));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load notifications.");
    } finally {
      setLoadingNotifications(false);
    }
  };

  const pickCounts = useMemo(() => {
    const counts = {
      all: picksTotalItems,
      pending: 0,
      won: 0,
      lost: 0,
      push: 0,
      canceled: 0,
    };
    for (const pick of picks) {
      counts[pick.status] += 1;
    }
    return counts;
  }, [picks, picksTotalItems]);

  if (!hasVenueSession) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Join a venue to view your picks and notifications history.
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("picks")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            tab === "picks" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          My Picks ({picksTotalItems})
        </button>
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            tab === "notifications" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          Notifications ({notificationsTotalItems})
          {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
        </button>
      </div>

      {tab === "picks" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "won", "lost", "push", "canceled"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setPicksFilter(value);
                  setPicksPage(1);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  picksFilter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                {value === "all" ? ` (${pickCounts.all})` : ""}
              </button>
            ))}
          </div>

          {loadingPicks ? (
            <p className="text-sm text-slate-600">Loading pick history...</p>
          ) : picks.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              No picks found for this filter.
            </div>
          ) : (
            <ul className="space-y-3">
              {picks.map((pick) => (
                <li key={pick.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Prediction</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(pick.status)}`}>
                      {pick.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-900">{pick.outcomeTitle}</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {pick.status === "pending"
                      ? `${pick.points} potential points`
                      : `${pick.points} points at stake · final status ${pick.status}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Picked: {new Date(pick.createdAt).toLocaleString()}
                    {pick.resolvedAt ? ` · Resolved: ${new Date(pick.resolvedAt).toLocaleString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Page {picksPage} of {picksTotalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPicksPage((value) => Math.max(1, value - 1))}
                disabled={picksPage <= 1 || loadingPicks}
                className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPicksPage((value) => Math.min(picksTotalPages, value + 1))}
                disabled={picksPage >= picksTotalPages || loadingPicks}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setNotificationFilter("all");
                setNotificationsPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                notificationFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              All ({notificationsTotalItems})
            </button>
            <button
              type="button"
              onClick={() => {
                setNotificationFilter("unread");
                setNotificationsPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                notificationFilter === "unread" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {loadingNotifications ? (
            <p className="text-sm text-slate-600">Loading notification history...</p>
          ) : notifications.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              No notifications found for this filter.
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-md border p-3 ${
                    item.read ? "border-slate-200 bg-white text-slate-700" : "border-blue-200 bg-blue-50 text-slate-800"
                  }`}
                >
                  <p className="text-sm font-medium">{item.message}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Page {notificationsPage} of {notificationsTotalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNotificationsPage((value) => Math.max(1, value - 1))}
                disabled={notificationsPage <= 1 || loadingNotifications}
                className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setNotificationsPage((value) => Math.min(notificationsTotalPages, value + 1))}
                disabled={notificationsPage >= notificationsTotalPages || loadingNotifications}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
