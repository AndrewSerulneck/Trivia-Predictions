"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import {
  AddVenueRefusalNotice,
  AddVenueReviewStep,
  MAX_AUTO_CHECKS,
  type AddVenueQuoteState,
  type AddVenueSubmitState,
} from "@/components/owner/add-venue/AddVenueReviewStep";
import { useDiscardGuard } from "@/components/owner/sheet/DiscardGuard";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import { AddressStep } from "@/components/signup/steps/AddressStep";
import { GeofenceStep } from "@/components/signup/steps/GeofenceStep";
import {
  ADD_VENUE_STEPS,
  addVenueDraftHasAnswers,
  addVenueStepIssue,
  addVenueUrlStep,
  blankAddVenueDraft,
  buildAddVenueBody,
  interpretAddVenueReply,
  interpretQuoteReply,
  newAttemptKey,
  resolveAddVenueStep,
  type AddVenueDraft,
  type AddVenueQuoteResult,
  type AddVenueStep,
} from "@/lib/addVenueFlow";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import { formatCents } from "@/lib/merchPricing";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// "Add a venue" (docs/multi-venue-volume-billing-plan.md §4.5, Phase 4): Address → Map area → Review & pay.
// Hosted by the dashboard PAGE (like the store), because it acts on the page's venue list: when a venue is
// paid for, the page refetches the list and switches to it.
//
// URL-MIRRORED like Schedule and the store: `?sheet=add-venue` is the address screen (no step), then
// `&step=map`, `&step=review`, so the phone's Back steps back or closes. A reload loses the answers (they
// live in memory), so a step whose answers are gone is corrected to the one that is missing them.
//
// THE ANSWERS REUSE THE SIGNUP WIZARD'S SCREENS (AddressStep, GeofenceStep) and its rules (signupStepIssue),
// so a venue added here is validated exactly like one created at signup. The venue name is asked on the
// address screen, as it is in signup. The server re-validates everything.
//
// MONEY. Nothing is priced here: the quote's numbers are Stripe's own preview. The idempotency key is made
// ONCE per Confirm and kept for that attempt: pressing Confirm twice, or re-asking after 3-D Secure, sends
// the same key and so can never charge twice or create two venues. A NEW key is made only after the server
// definitively refused (nothing charged). Re-asking costs a rate-limit slot, so it is spaced out.
//
// DISCARD. Typed answers ask "Discard this venue?" on Close / Back-out. Once a payment has been attempted
// there is nothing to discard (the add continues on the server), so closing just closes.

/** Ask again this long after "processing" (the server is still confirming the payment). */
const PROCESSING_RECHECK_MS = 5000;
/** Never re-ask more often than this when the partner returns from Stripe's page. */
const MIN_RECHECK_GAP_MS = 4000;
/** A quote older than this is re-fetched before charging, so "Charged today" is what is charged. */
const QUOTE_FRESH_MS = 10 * 60 * 1000;

export type AddedVenue = { venueId: string | null; venueName: string };

export type AddVenueSheetProps = {
  nav: UseOwnerSheetResult;
  /** The dashboard's selected venue: its bill is the one the new venue is added to. */
  venueId: string;
  /** Paid and live (or paid and being finished): the page refetches its venues and switches to this one. */
  onAdded: (added: AddedVenue) => void;
  /** Closed while a payment was still being confirmed: the page tells the partner it will appear on its own. */
  onPendingClosed: () => void;
};

type Preflight = { status: "idle" } | { status: "ok" } | { status: "blocked"; result: Extract<AddVenueQuoteResult, { ok: false }> };

const fetchQuote = async (venueId: string): Promise<AddVenueQuoteResult> => {
  try {
    const response = await fetch(`/api/owner/venues/add/quote?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    return interpretQuoteReply(response.status, body);
  } catch {
    return interpretQuoteReply(503, null);
  }
};

export const AddVenueSheet = ({ nav, venueId, onAdded, onPendingClosed }: AddVenueSheetProps) => {
  const open = nav.sheet === "add-venue";
  const [draft, setDraft] = useState<AddVenueDraft>(blankAddVenueDraft);
  // Where the map pin came from — chrome for GeofenceEditor's label, never submitted.
  const [pinSource, setPinSource] = useState<PinSource>("none");
  const [hint, setHint] = useState("");
  const [preflight, setPreflight] = useState<Preflight>({ status: "idle" });
  const [quote, setQuote] = useState<AddVenueQuoteState>({ status: "loading" });
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [quoteFetchedAt, setQuoteFetchedAt] = useState(0);
  const [submit, setSubmit] = useState<AddVenueSubmitState>({ status: "idle" });
  // The key of the add the partner has pressed Confirm for. Null = no attempt in flight.
  const [attemptKey, setAttemptKey] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  // The add went through: once the sheet has slid away, start over, so the browser's Forward can't reopen a spent review.
  const [finished, setFinished] = useState(false);
  const inFlight = useRef(false);
  const lastCheckAt = useRef(0);

  const current: AddVenueStep = resolveAddVenueStep(nav.displayStepFor("add-venue"), draft);

  // Forget everything once a finished add has slid away (not before: the closing sheet keeps showing its content).
  const resetAfterFinish = () => {
    if (!finished) return;
    setFinished(false);
    setDraft(blankAddVenueDraft());
    setPinSource("none");
    setHint("");
    setPreflight({ status: "idle" });
    setQuote({ status: "loading" });
    setSubmit({ status: "idle" });
    setAttemptKey(null);
  };

  // Arriving on Review always shows a fresh quote, never the last visit's.
  const [lastStep, setLastStep] = useState<AddVenueStep>(current);
  if (current !== lastStep) {
    setLastStep(current);
    if (current === "review") setQuote({ status: "loading" });
  }

  // A stale or hand-edited `?step=` is corrected, popping back to the screen under it when this sheet pushed one.
  const urlStep = nav.step;
  const wantedUrlStep = addVenueUrlStep(current);
  const correctStep = nav.correctStep;
  useEffect(() => {
    if (open && urlStep !== wantedUrlStep) correctStep(wantedUrlStep);
  }, [open, urlStep, wantedUrlStep, correctStep]);

  // The up-front check: if this bill can't take a venue (card, offline, custom rate…), say so before the partner
  // types anything. One Stripe preview per open — an add is a rare event.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchQuote(venueId).then((result) => {
      if (cancelled) return;
      // A refusal that is only "billing is down for a moment" must not lock the partner out of typing.
      const blocking = !result.ok && result.code !== "stripe_unavailable" && result.code !== "rate_limited";
      setPreflight(blocking ? { status: "blocked", result } : { status: "ok" });
    });
    return () => {
      cancelled = true;
    };
  }, [open, venueId]);

  // The price on Review, fetched when Review opens (and on "Try again").
  useEffect(() => {
    if (!open || current !== "review") return;
    let cancelled = false;
    void fetchQuote(venueId).then((result) => {
      if (cancelled) return;
      setQuoteFetchedAt(Date.now());
      setQuote(result.ok ? { status: "ready", quote: result.quote } : { status: "error", result });
    });
    return () => {
      cancelled = true;
    };
  }, [open, current, venueId, quoteAttempt]);

  const paymentStarted = attemptKey !== null;
  const dirty = addVenueDraftHasAnswers(draft) && !paymentStarted;
  const { closeGuard, dialog, closeWithoutAsking } = useDiscardGuard({
    open,
    dirty,
    title: "Discard this venue?",
    message: "The details you entered won't be saved.",
    onDiscard: nav.closeSheet,
  });

  const requestClose = () => {
    if (paymentStarted && !finished) onPendingClosed();
    nav.closeSheet();
  };

  const patch = useCallback((next: Partial<AddVenueDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    setHint("");
  }, []);

  const handleGeofenceChange = useCallback(
    (value: GeofenceEditorValue) => {
      // Moving the pin by hand or GPS detaches it from the looked-up place (same rule as signup).
      const detached = value.source === "gps" || value.source === "map" || value.source === "manual";
      patch({ latitude: value.lat, longitude: value.lng, radius: value.radius, ...(detached ? { placeId: "" } : {}) });
      setPinSource(value.source);
    },
    [patch],
  );

  /** POST the add with `key`. The same key is the status check after 3-D Secure / "processing". */
  const post = useCallback(
    async (key: string, checks: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastCheckAt.current = Date.now();
      setPosting(true);
      setHint("");
      try {
        const response = await fetch("/api/owner/venues/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildAddVenueBody({
              draft,
              idempotencyKey: key,
              venueId,
              prorationDate: quote.status === "ready" ? quote.quote.prorationDate : null,
            }),
          ),
        });
        const body: unknown = await response.json().catch(() => null);
        const outcome = interpretAddVenueReply(response.status, body);

        if (outcome.kind === "paid") {
          setSubmit({ status: "idle" });
          setFinished(true);
          closeWithoutAsking();
          onAdded({ venueId: outcome.venueId, venueName: draft.venueName.trim() });
        } else if (outcome.kind === "requires_action") {
          setSubmit({ status: "action", hostedInvoiceUrl: outcome.hostedInvoiceUrl });
        } else if (outcome.kind === "processing") {
          setSubmit({ status: "processing", checks });
        } else if (outcome.kind === "unconfirmed") {
          setSubmit({ status: "unconfirmed", message: outcome.message });
        } else {
          // Nothing was charged: the next Confirm is a brand-new attempt.
          setAttemptKey(null);
          setSubmit({ status: "refused", message: outcome.message, link: outcome.link, hostedInvoiceUrl: outcome.hostedInvoiceUrl });
        }
      } catch {
        setSubmit({ status: "unconfirmed", message: "We couldn't reach the server. Check your connection, then check again." });
      } finally {
        inFlight.current = false;
        setPosting(false);
      }
    },
    [closeWithoutAsking, draft, onAdded, quote, venueId],
  );

  const confirm = () => {
    if (quote.status !== "ready" || posting) return;
    // The price is old: show the fresh one and ask again, so "Charged today" is exactly what is charged.
    if (Date.now() - quoteFetchedAt > QUOTE_FRESH_MS) {
      setQuote({ status: "loading" });
      setQuoteAttempt((n) => n + 1);
      setHint("We refreshed the price. Check it, then confirm again.");
      return;
    }
    const key = attemptKey ?? newAttemptKey();
    setAttemptKey(key);
    void post(key, 0);
  };

  const recheck = () => {
    if (attemptKey) void post(attemptKey, 0);
  };

  // The timers below must not restart whenever `post` is rebuilt (it closes over the draft and the quote).
  const postRef = useRef(post);
  useEffect(() => {
    postRef.current = post;
  });

  // "Confirming…": ask again with the same key a few times, then leave it to the button.
  const processingChecks = submit.status === "processing" ? submit.checks : null;
  useEffect(() => {
    if (processingChecks === null || !attemptKey || processingChecks >= MAX_AUTO_CHECKS) return;
    const timer = window.setTimeout(() => void postRef.current(attemptKey, processingChecks + 1), PROCESSING_RECHECK_MS);
    return () => window.clearTimeout(timer);
  }, [processingChecks, attemptKey]);

  // Back from Stripe's payment page: check once, no faster than MIN_RECHECK_GAP_MS.
  useEffect(() => {
    if (submit.status !== "action" || !attemptKey) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheckAt.current >= MIN_RECHECK_GAP_MS) {
        void postRef.current(attemptKey, 0);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [submit.status, attemptKey]);

  const advance = () => {
    const issue = addVenueStepIssue(current, draft);
    if (issue) {
      setHint(issue);
      return;
    }
    setHint("");
    if (current === "address") nav.goToStep("map");
    else if (current === "map") nav.goToStep("review");
    else confirm();
  };

  const renderStep = (step: AddVenueStep): ReactNode => {
    if (step === "map") {
      return <GeofenceStep draft={draft} source={pinSource} onChange={handleGeofenceChange} />;
    }
    if (step === "review") {
      return (
        <AddVenueReviewStep
          draft={draft}
          quote={quote}
          submit={submit}
          onRetryQuote={() => {
            setQuote({ status: "loading" });
            setQuoteAttempt((n) => n + 1);
          }}
        />
      );
    }
    return <AddressStep draft={draft} onPatch={patch} onPinSource={setPinSource} onEnter={advance} />;
  };

  const waitingOnPayment = submit.status === "action" || submit.status === "processing" || submit.status === "unconfirmed";
  const dueToday = quote.status === "ready" ? formatCents(quote.quote.dueTodayCents) : null;

  const footer = (() => {
    if (preflight.status === "blocked") return undefined;
    if (current === "review" && waitingOnPayment) {
      return (
        <WizardFooter
          variant="inline"
          tone="dark"
          onNext={recheck}
          nextLabel={submit.status === "action" ? "I've paid — check now" : "Check again"}
          nextBusyLabel="Checking…"
          nextBusy={posting}
          nextDisabled={posting}
          nextHideChevron
          {...(hint ? { hint } : {})}
        />
      );
    }
    if (current === "review") {
      return (
        <WizardFooter
          variant="inline"
          tone="dark"
          onBack={posting ? undefined : () => nav.goBack("map")}
          onNext={advance}
          nextLabel={dueToday ? `Add venue — pay ${dueToday} now` : "Add venue"}
          nextBusyLabel="Charging your card…"
          nextBusy={posting}
          nextDisabled={posting || quote.status !== "ready"}
          nextHideChevron
          {...(hint ? { hint } : {})}
        />
      );
    }
    return (
      <WizardFooter
        variant="inline"
        tone="dark"
        {...(current === "map" ? { onBack: () => nav.goBack(null) } : {})}
        onNext={advance}
        nextLabel="Next"
        {...(hint ? { hint } : {})}
      />
    );
  })();

  return (
    <>
      <OwnerSheet
        open={open}
        onRequestClose={requestClose}
        closeGuard={closeGuard}
        size="tall"
        eyebrow="Your bill"
        title="Add a venue"
        footer={footer}
        scrollKey={current}
        onExited={resetAfterFinish}
      >
        {preflight.status === "blocked" ? (
          <div className="space-y-3 pt-3">
            <AddVenueRefusalNotice
              message={preflight.result.message}
              link={preflight.result.link}
              hostedInvoiceUrl={preflight.result.hostedInvoiceUrl}
            />
          </div>
        ) : (
          <SlideSteps steps={ADD_VENUE_STEPS} current={current} renderStep={renderStep} />
        )}
      </OwnerSheet>
      {dialog}
    </>
  );
};
