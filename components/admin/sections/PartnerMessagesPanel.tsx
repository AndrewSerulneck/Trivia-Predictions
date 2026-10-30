"use client";

import { useCallback, useEffect, useState } from "react";
import { TH, TD, TR } from "@/components/admin/AdminShell";
import { PARTNER_MESSAGE_REPORTS_TO_PAUSE, PARTNER_MESSAGES_DAILY_CAP } from "@/lib/partnerMessageRules";

// docs/native-app-store-plan.md Phase 5.5 — partner-written push messages and the per-bar kill switch.
//
// Loaded once when the Venues section opens (and on Refresh); no polling. Lists the newest 50 messages
// with how many phones they went to and how many people reported them since the bar was last un-paused
// (the number that drives a pause; Phase 10.1), and every paused bar. A bar is paused automatically when
// enough people report one message (lib/partnerMessageRules.ts), or here by hand; Pause takes effect on the
// bar's next send. Un-pause marks the bar's reports reviewed, so only new reports count after it. To turn the whole feature off, unset
// NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED and redeploy.

type AdminMessage = {
  id: string;
  venueId: string;
  venueName: string | null;
  body: string;
  sentAt: string;
  devices: number;
  reports: number;
};

type AdminPause = { venueId: string; venueName: string | null; reason: "reports" | "admin"; pausedAt: string };

const formatWhen = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export function PartnerMessagesPanel() {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [pauses, setPauses] = useState<AdminPause[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [busyVenueId, setBusyVenueId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/admin?resource=partner-messages", { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; messages?: AdminMessage[]; pauses?: AdminPause[]; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Failed to load partner messages.");
      setMessages(payload.messages ?? []);
      setPauses(payload.pauses ?? []);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load partner messages.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPaused = async (venueId: string, paused: boolean) => {
    setBusyVenueId(venueId);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "partner-messages", action: paused ? "pause" : "unpause", venueId }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Couldn't change that.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that.");
    } finally {
      setBusyVenueId(null);
    }
  };

  const pausedIds = new Set(pauses.map((pause) => pause.venueId));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Partner messages</h2>
          <p className="text-xs text-slate-500">
            {state === "loading" ? "Loading…" : `${messages.length} newest shown · ${pauses.length} paused`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={state === "loading"}
          className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="mx-4 mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{error}</div> : null}

      <div className="px-4 py-3 text-xs text-slate-500 sm:px-6">
        Partners can push {PARTNER_MESSAGES_DAILY_CAP} short messages a day to their players.{" "}
        Reports on one message from {PARTNER_MESSAGE_REPORTS_TO_PAUSE} different players pause that venue
        automatically. A paused venue can&apos;t send until you un-pause it here; after that, only new reports
        count.
      </div>

      {pauses.length > 0 ? (
        <ul className="space-y-2 px-4 pb-4 sm:px-6">
          {pauses.map((pause) => (
            <li key={pause.venueId} className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm">
              <span className="text-amber-900">
                <span className="font-semibold">{pause.venueName ?? pause.venueId}</span> paused{" "}
                {pause.reason === "reports" ? "by player reports" : "by an admin"} · {formatWhen(pause.pausedAt)}
              </span>
              <button
                onClick={() => void setPaused(pause.venueId, false)}
                disabled={busyVenueId !== null}
                className="min-h-[44px] rounded border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                {busyVenueId === pause.venueId ? "Saving…" : "Un-pause"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {state === "ready" && messages.length === 0 ? (
        <p className="px-4 pb-6 text-sm text-slate-400 sm:px-6">No messages sent yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={TH}>Venue</th>
                <th className={TH}>Message</th>
                <th className={TH}>Phones</th>
                <th className={TH}>Reports</th>
                <th className={TH}>Sent</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.id} className={TR}>
                  <td className={`${TD} font-medium text-slate-900`}>{message.venueName ?? message.venueId}</td>
                  <td className={`${TD} max-w-sm break-words text-slate-700`}>{message.body}</td>
                  <td className={`${TD} text-slate-600`}>{message.devices}</td>
                  <td className={`${TD} ${message.reports > 0 ? "font-semibold text-red-700" : "text-slate-600"}`}>{message.reports}</td>
                  <td className={`${TD} text-slate-600`}>{formatWhen(message.sentAt)}</td>
                  <td className={`${TD} text-right`}>
                    {pausedIds.has(message.venueId) ? (
                      <span className="text-xs text-slate-400">Paused</span>
                    ) : (
                      <button
                        onClick={() => void setPaused(message.venueId, true)}
                        disabled={busyVenueId !== null}
                        className="min-h-[44px] rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {busyVenueId === message.venueId ? "Saving…" : "Pause venue"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
