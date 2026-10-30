"use client";

import { useEffect, useId, useState } from "react";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { useDiscardGuard } from "@/components/owner/sheet/DiscardGuard";
import { HightopLoader } from "@/components/ui/HightopLoader";
import {
  checkPartnerMessage,
  normalizePartnerMessage,
  PARTNER_MESSAGE_COPY,
  PARTNER_MESSAGE_MAX_LENGTH,
  partnerMessageLength,
} from "@/lib/partnerMessageRules";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// "Message your players" (docs/native-app-store-plan.md Phase 5.5): a short note from the partner to the
// phones of this bar's players who have "News from your bars" on. URL-mirrored like Point of Sale
// (`?sheet=messages`, one screen), hosted by the dashboard page and mounted only while
// NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED is on.
//
// The compose box runs the same words/links check the server runs (lib/partnerMessageRules.ts) so a
// problem shows while typing; the server stays the authority. Send asks once ("It can't be taken back"),
// in place — not a step. One GET per open, one POST per send, nothing while closed, no polling.

type Status = {
  cap: number;
  remaining: number;
  paused: boolean;
  recent: Array<{ id: string; body: string; sentAt: string; devices: number }>;
};

type Load = { status: "loading" } | { status: "ready"; data: Status } | { status: "error"; message: string };

export type PartnerMessagesSheetProps = {
  nav: UseOwnerSheetResult;
  venue: { id: string; name: string } | null;
};

const formatSent = (iso: string): string => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export const PartnerMessagesSheet = ({ nav, venue }: PartnerMessagesSheetProps) => {
  const open = nav.sheet === "messages";
  const venueId = venue?.id ?? null;
  const inputId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped to read the status again (a send that came back without one).
  const [reloadKey, setReloadKey] = useState(0);

  // A closed sheet forgets its draft (adjust-during-render, react-hooks/set-state-in-effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setText("");
      setConfirming(false);
      setError("");
      setNotice("");
    } else {
      setLoad({ status: "loading" });
    }
  }

  useEffect(() => {
    if (!open || !venueId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/owner/messages?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: Status; error?: string };
        if (cancelled) return;
        if (res.ok && json.ok && json.status) setLoad({ status: "ready", data: json.status });
        else setLoad({ status: "error", message: json.error ?? "Couldn't load your messages." });
      } catch {
        if (!cancelled) setLoad({ status: "error", message: "Couldn't load your messages." });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, venueId, reloadKey]);

  const dirty = normalizePartnerMessage(text).length > 0 && !sending;
  const { closeGuard, dialog } = useDiscardGuard({
    open,
    dirty,
    title: "Discard this message?",
    message: "It hasn't been sent.",
    onDiscard: nav.closeSheet,
  });

  const check = checkPartnerMessage(text);
  const length = partnerMessageLength(normalizePartnerMessage(text));
  // "Type a message first" is shown only after a tap, never while the box is simply empty.
  const liveProblem = !check.ok && check.problem !== "empty" ? PARTNER_MESSAGE_COPY.problems[check.problem] : "";
  const data = venueId && load.status === "ready" ? load.data : null;
  const canCompose = Boolean(data && !data.paused && data.remaining > 0);

  const send = async () => {
    if (!venueId || sending) return;
    if (!check.ok) {
      setError(PARTNER_MESSAGE_COPY.problems[check.problem]);
      setConfirming(false);
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/owner/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, text: check.text }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; devices?: number; status?: Status; error?: string };
      if (res.ok && json.ok) {
        setText("");
        setNotice(PARTNER_MESSAGE_COPY.sent(json.devices ?? 0));
        if (json.status) setLoad({ status: "ready", data: json.status });
        else setReloadKey((key) => key + 1);
      } else {
        setError(json.error ?? "Couldn't send your message. Try again.");
      }
    } catch {
      setError("Couldn't send your message. Try again.");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <OwnerSheet
        open={open}
        onRequestClose={nav.closeSheet}
        closeGuard={closeGuard}
        eyebrow={venue?.name}
        title={PARTNER_MESSAGE_COPY.sheetTitle}
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-ht-muted">
            {PARTNER_MESSAGE_COPY.intro.replace("{bar}", venue?.name ?? "your venue")}
          </p>

          {!venueId ? (
            <p role="status" className="text-sm font-bold text-ht-muted">
              {PARTNER_MESSAGE_COPY.noVenue}
            </p>
          ) : null}
          {venueId && load.status === "loading" ? <HightopLoader size="sm" className="py-6" /> : null}
          {venueId && load.status === "error" ? (
            <p role="alert" className="text-sm font-bold text-ht-rose-300">
              {load.message}
            </p>
          ) : null}

          {data ? (
            <>
              {data.paused ? (
                <p role="status" className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 p-3 text-sm font-bold text-ht-rose-300">
                  {PARTNER_MESSAGE_COPY.paused}
                </p>
              ) : null}

              {notice ? (
                <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300">
                  {notice}
                </p>
              ) : null}

              {!data.paused ? (
                <div className="space-y-2">
                  <label htmlFor={inputId} className="sr-only">
                    {PARTNER_MESSAGE_COPY.sheetTitle}
                  </label>
                  <textarea
                    id={inputId}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setError("");
                      setNotice("");
                      setConfirming(false);
                    }}
                    disabled={!canCompose || sending}
                    rows={3}
                    placeholder={PARTNER_MESSAGE_COPY.placeholder}
                    className="w-full resize-none rounded-xl border border-ht-hairline bg-ht-elevated px-3 py-2.5 text-base font-semibold text-ht-primary placeholder:text-ht-muted disabled:opacity-60"
                  />
                  <div className="flex items-start justify-between gap-3 text-xs font-semibold">
                    <span className={liveProblem || error ? "text-ht-rose-300" : "text-ht-muted"} role={error ? "alert" : undefined}>
                      {error || liveProblem || PARTNER_MESSAGE_COPY.remaining(data.remaining)}
                    </span>
                    <span className={length > PARTNER_MESSAGE_MAX_LENGTH ? "shrink-0 text-ht-rose-300" : "shrink-0 text-ht-muted"}>
                      {length}/{PARTNER_MESSAGE_MAX_LENGTH}
                    </span>
                  </div>

                  {confirming ? (
                    <div className="space-y-2 rounded-xl border border-ht-hairline bg-ht-elevated p-3">
                      <p className="text-sm font-black text-ht-primary">{PARTNER_MESSAGE_COPY.confirmTitle}</p>
                      <p className="text-xs font-semibold text-ht-muted">{PARTNER_MESSAGE_COPY.confirmBody}</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void send()}
                          disabled={sending}
                          className="min-h-11 flex-1 rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950 disabled:opacity-60"
                        >
                          {sending ? "Sending…" : PARTNER_MESSAGE_COPY.confirmSend}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          disabled={sending}
                          className="min-h-11 flex-1 rounded-xl border border-ht-hairline px-4 text-sm font-black text-ht-primary disabled:opacity-60"
                        >
                          {PARTNER_MESSAGE_COPY.confirmCancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!check.ok) {
                          setError(PARTNER_MESSAGE_COPY.problems[check.problem]);
                          return;
                        }
                        setConfirming(true);
                      }}
                      disabled={!canCompose || sending}
                      className="min-h-12 w-full rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950 disabled:opacity-50"
                    >
                      {PARTNER_MESSAGE_COPY.send}
                    </button>
                  )}
                </div>
              ) : null}

              {data.recent.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.12em] text-ht-muted">{PARTNER_MESSAGE_COPY.recentTitle}</h3>
                  <ul className="space-y-2">
                    {data.recent.map((message) => (
                      <li key={message.id} className="rounded-xl bg-ht-elevated px-3 py-2.5">
                        <p className="break-words text-sm font-semibold text-ht-primary">{message.body}</p>
                        <p className="mt-1 text-xs font-semibold text-ht-muted">
                          {formatSent(message.sentAt)} · {message.devices} phone{message.devices === 1 ? "" : "s"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </OwnerSheet>
      {dialog}
    </>
  );
};
