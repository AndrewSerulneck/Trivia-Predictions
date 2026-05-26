"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
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
  if (!status) return "bg-ht-elevated text-ht-fg-muted";
  if (status === "pending") return "bg-amber-500/15 text-amber-300";
  if (status === "won") return "bg-emerald-500/15 text-emerald-400";
  if (status === "lost") return "bg-rose-500/15 text-rose-400";
  if (status === "push") return "bg-sky-500/15 text-sky-300";
  if (status === "canceled") return "bg-ht-elevated text-ht-fg-muted";
  return "bg-ht-elevated text-ht-fg-muted";
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

export function ActivityTimeline() {
  const router = useRouter();
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

  const openNotification = async (item: Notification) => {
    const userId = getUserId() ?? "";
    if (userId && !item.read) {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, notificationId: item.id }),
      });
      void loadNotifications(userId, notificationFilter, notificationsPage);
    }
    router.push(resolveNotificationHref(item.message));
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
      <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface p-3 text-sm text-ht-fg-muted">
        Join a venue to view your picks and notifications history.
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-ht-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400">
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
            tab === "picks" ? "bg-ht-elevated text-ht-fg-primary border border-ht-border-soft" : "bg-ht-surface text-ht-fg-muted hover:text-ht-fg-primary"
          }`}
        >
          My Picks ({picksTotalItems})
        </button>
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            tab === "notifications" ? "bg-ht-elevated text-ht-fg-primary border border-ht-border-soft" : "bg-ht-surface text-ht-fg-muted hover:text-ht-fg-primary"
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
                  picksFilter === value ? "bg-ht-elevated text-ht-fg-primary border border-ht-border-soft" : "bg-ht-surface text-ht-fg-muted hover:text-ht-fg-primary"
                }`}
              >
                {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                {value === "all" ? ` (${pickCounts.all})` : ""}
              </button>
            ))}
          </div>

          {loadingPicks ? (
            <BouncingBallLoader size="sm" label="Loading pick history..." />
          ) : picks.length === 0 ? (
            <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface p-3 text-sm text-ht-fg-muted">
              No picks found for this filter.
            </div>
          ) : (
            <ul className="space-y-3">
              {picks.map((pick) => (
                <li key={pick.id} className="rounded-ht-md border border-ht-border-hairline bg-ht-elevated p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-ht-fg-muted">Prediction</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(pick.status)}`}>
                      {pick.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ht-fg-primary">{pick.outcomeTitle}</p>
                  <p className="mt-1 text-sm text-ht-fg-secondary">
                    {pick.status === "pending"
                      ? `${pick.points} potential points`
                      : `${pick.points} points at stake · final status ${pick.status}`}
                  </p>
                  <p className="mt-1 text-xs text-ht-fg-muted">
                    Picked: {new Date(pick.createdAt).toLocaleString()}
                    {pick.resolvedAt ? ` · Resolved: ${new Date(pick.resolvedAt).toLocaleString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-ht-fg-muted">
              Page {picksPage} of {picksTotalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPicksPage((value) => Math.max(1, value - 1))}
                disabled={picksPage <= 1 || loadingPicks}
                className="rounded-ht-md bg-ht-elevated px-3 py-1.5 text-xs font-medium text-ht-fg-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPicksPage((value) => Math.min(picksTotalPages, value + 1))}
                disabled={picksPage >= picksTotalPages || loadingPicks}
                className="rounded-ht-md bg-ht-elevated-2 px-3 py-1.5 text-xs font-medium text-ht-fg-primary disabled:opacity-50"
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
                notificationFilter === "all" ? "bg-ht-elevated text-ht-fg-primary border border-ht-border-soft" : "bg-ht-surface text-ht-fg-muted hover:text-ht-fg-primary"
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
                notificationFilter === "unread" ? "bg-ht-elevated text-ht-fg-primary border border-ht-border-soft" : "bg-ht-surface text-ht-fg-muted hover:text-ht-fg-primary"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {loadingNotifications ? (
            <BouncingBallLoader size="sm" label="Loading notifications..." />
          ) : notifications.length === 0 ? (
            <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface p-3 text-sm text-ht-fg-muted">
              No notifications found for this filter.
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-ht-md border p-3 ${
                    item.read ? "border-ht-border-hairline bg-ht-elevated text-ht-fg-secondary" : "border-ht-cyan-600/40 bg-ht-elevated text-ht-fg-primary"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void openNotification(item);
                    }}
                    className="w-full text-left"
                  >
                    <p className="text-sm font-medium">{item.message}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-ht-fg-muted">
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                      <span className="font-semibold text-ht-cyan-400">View</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-ht-fg-muted">
              Page {notificationsPage} of {notificationsTotalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNotificationsPage((value) => Math.max(1, value - 1))}
                disabled={notificationsPage <= 1 || loadingNotifications}
                className="rounded-ht-md bg-ht-elevated px-3 py-1.5 text-xs font-medium text-ht-fg-secondary disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setNotificationsPage((value) => Math.min(notificationsTotalPages, value + 1))}
                disabled={notificationsPage >= notificationsTotalPages || loadingNotifications}
                className="rounded-ht-md bg-ht-elevated-2 px-3 py-1.5 text-xs font-medium text-ht-fg-primary disabled:opacity-50"
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
