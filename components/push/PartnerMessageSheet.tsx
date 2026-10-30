"use client";

import { useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useNativeBackHandler } from "@/components/navigation/nativeBackButton";
import { haptic } from "@/lib/haptics";
import { PARTNER_MESSAGE_COPY, PARTNER_MESSAGE_PARAM, partnerMessageIdFromSearch } from "@/lib/partnerMessageRules";
import { setScrollLock } from "@/lib/scrollLock";

// A partner's message, opened from its push (docs/native-app-store-plan.md Phase 5.5). The push opens
// `/venue/{id}?message={id}`; this reads the message (GET /api/push/messages/{id}, a player of that bar only)
// and shows it with "Report this message". Closing drops `?message=` from the URL (so popup ads, which wait
// while it is there, and a reload behave normally). No `message` in the URL = renders nothing, no request.
//
// Uses useSearchParams so a second push tapped while Venue Home is already open still opens; the host wraps
// it in its own <Suspense>.

type Message = { venueName: string | null; body: string; sentAt: string; reported: boolean };

type ReportState = "idle" | "confirm" | "sending" | "done" | "failed";

const dropMessageParam = (): void => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARTNER_MESSAGE_PARAM)) return;
  url.searchParams.delete(PARTNER_MESSAGE_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};

export const PartnerMessageSheet = () => {
  const searchParams = useSearchParams();
  const messageId = partnerMessageIdFromSearch(searchParams.toString());
  const titleId = useId();
  const [message, setMessage] = useState<(Message & { id: string }) | null>(null);
  const [report, setReport] = useState<ReportState>("idle");

  useEffect(() => {
    if (!messageId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/push/messages/${encodeURIComponent(messageId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: Message };
        if (cancelled) return;
        if (res.ok && json.ok && json.message) {
          setMessage({ ...json.message, id: messageId });
          setReport(json.message.reported ? "done" : "idle");
        } else {
          // Not found / not their bar / signed out: nothing to show; Venue Home carries on.
          dropMessageParam();
        }
      } catch {
        if (!cancelled) dropMessageParam();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  const open = message !== null;

  useEffect(() => {
    setScrollLock("partner-message", open);
    return () => setScrollLock("partner-message", false);
  }, [open]);

  const close = () => {
    setMessage(null);
    setReport("idle");
    dropMessageParam();
  };

  useNativeBackHandler("overlay", open && report !== "sending" ? close : null);

  if (!message) return null;

  const sendReport = async () => {
    setReport("sending");
    try {
      const res = await fetch(`/api/push/messages/${encodeURIComponent(message.id)}`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && json.ok) {
        haptic("success");
        setReport("done");
      } else {
        setReport("failed");
      }
    } catch {
      setReport("failed");
    }
  };

  const sentAt = Date.parse(message.sentAt);
  const sentLabel = Number.isNaN(sentAt)
    ? ""
    : new Date(sentAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div
      className="fixed inset-0 z-[2300] flex items-end justify-center bg-slate-950/70 p-4 animate-tp-fade-in sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && report !== "sending") close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-tp-scroll-lock="active"
        className="w-full max-w-[24rem] rounded-ht-lg bg-ht-surface p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-ht-modal"
      >
        <h2 id={titleId} className="text-lg font-black leading-tight text-ht-fg-primary">
          {PARTNER_MESSAGE_COPY.playerTitle.replace("{bar}", message.venueName ?? "your bar")}
        </h2>
        <p className="mt-3 whitespace-pre-line break-words text-base leading-snug text-ht-fg-primary">{message.body}</p>
        {sentLabel ? <p className="mt-2 text-footnote text-ht-fg-muted">{sentLabel}</p> : null}

        <button
          type="button"
          onClick={close}
          disabled={report === "sending"}
          className="tp-clean-button tp-player-hit-target tp-player-pressable mt-5 flex w-full items-center justify-center rounded-full bg-ht-accent px-4 py-3 text-base font-black text-ht-on-fill disabled:opacity-60"
        >
          {PARTNER_MESSAGE_COPY.close}
        </button>

        <div className="mt-3 text-center">
          {report === "done" ? (
            <p role="status" className="text-footnote text-ht-fg-muted">
              {PARTNER_MESSAGE_COPY.reportDone}
            </p>
          ) : report === "confirm" || report === "sending" ? (
            <button
              type="button"
              onClick={() => void sendReport()}
              disabled={report === "sending"}
              className="tp-player-hit-target !rounded-none !border-0 !bg-transparent px-4 py-2 text-footnote font-bold text-ht-danger-fg disabled:opacity-60"
            >
              {PARTNER_MESSAGE_COPY.reportConfirm}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setReport("confirm")}
              className="tp-player-hit-target !rounded-none !border-0 !bg-transparent px-4 py-2 text-footnote font-bold text-ht-fg-secondary"
            >
              {PARTNER_MESSAGE_COPY.report}
            </button>
          )}
          {report === "failed" ? (
            <p role="alert" className="text-footnote text-ht-danger-fg">
              {PARTNER_MESSAGE_COPY.reportFailed}
            </p>
          ) : null}
        </div>

        <p className="mt-3 text-center text-footnote text-ht-fg-muted">{PARTNER_MESSAGE_COPY.playerFootnote}</p>
      </section>
    </div>
  );
};
