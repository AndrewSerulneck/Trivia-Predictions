"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";
import type { ChallengeGameType, ChallengeInvite } from "@/types";

type ChallengePayload = {
  ok: boolean;
  challenges?: ChallengeInvite[];
  error?: string;
};

function formatLocalDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function gameTypeLabel(gameType: ChallengeGameType): string {
  if (gameType === "pickem") return "Hightop Pick 'Em";
  if (gameType === "fantasy") return "Hightop Fantasy Sports";
  if (gameType === "live-trivia") return "Hightop Live Trivia";
  if (gameType === "speed-trivia") return "Speed Trivia";
  if (gameType === "trivia") return "Speed Trivia";
  return "Prop Bingo";
}

function statusStyle(status: ChallengeInvite["status"]): string {
  if (status === "accepted") return "bg-emerald-500/15 text-emerald-400";
  if (status === "declined") return "bg-rose-500/15 text-rose-400";
  if (status === "completed") return "bg-sky-500/15 text-sky-300";
  if (status === "canceled") return "bg-ht-elevated text-ht-fg-secondary";
  if (status === "expired") return "bg-amber-500/15 text-amber-300";
  return "bg-amber-500/10 text-amber-300";
}

export function PendingChallengesPanel() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challenges, setChallenges] = useState<ChallengeInvite[]>([]);
  const [receiverUsername, setReceiverUsername] = useState("");
  const [gameType, setGameType] = useState<ChallengeGameType>("pickem");
  const [challengeDetails, setChallengeDetails] = useState("");

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setChallenges([]);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({
        userId,
        includeResolved: "true",
      });
      if (venueId) {
        params.set("venueId", venueId);
      }
      const response = await fetch(`/api/challenges?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as ChallengePayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load challenges.");
      }
      setChallenges(payload.challenges ?? []);
    } catch (error) {
      setChallenges([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load challenges.");
    } finally {
      setLoading(false);
    }
  }, [userId, venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingReceived = useMemo(
    () =>
      challenges.filter(
        (challenge) => challenge.status === "pending" && challenge.receiverUserId === userId
      ),
    [challenges, userId]
  );
  const pendingSent = useMemo(
    () =>
      challenges.filter(
        (challenge) => challenge.status === "pending" && challenge.senderUserId === userId
      ),
    [challenges, userId]
  );
  const accepted = useMemo(
    () => challenges.filter((challenge) => challenge.status === "accepted"),
    [challenges]
  );
  const completed = useMemo(
    () => challenges.filter((challenge) => challenge.status === "completed"),
    [challenges]
  );

  const sendChallenge = useCallback(async () => {
    if (!userId || !venueId || submitting) {
      return;
    }
    const target = receiverUsername.trim();
    if (!target) {
      setStatusMessage("Enter a username to send a challenge.");
      return;
    }
    setSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          senderUserId: userId,
          venueId,
          receiverUsername: target,
          gameType,
          challengeDetails: challengeDetails.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to send challenge.");
      }
      setReceiverUsername("");
      setChallengeDetails("");
      setStatusMessage("Challenge sent.");
      await load();
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to send challenge.");
    } finally {
      setSubmitting(false);
    }
  }, [challengeDetails, gameType, load, receiverUsername, submitting, userId, venueId]);

  const respondToChallenge = useCallback(
    async (
      challengeId: string,
      responseType: "accept" | "decline" | "cancel" | "complete",
      successMessage: string
    ) => {
      if (!userId || submitting) {
        return;
      }
      setSubmitting(true);
      setStatusMessage("");
      setErrorMessage("");
      try {
        const response = await fetch("/api/challenges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "respond",
            userId,
            challengeId,
            response: responseType,
          }),
        });
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to update challenge.");
        }
        setStatusMessage(successMessage);
        await load();
      } catch (error) {
        setStatusMessage("");
        setErrorMessage(error instanceof Error ? error.message : "Failed to update challenge.");
      } finally {
        setSubmitting(false);
      }
    },
    [load, submitting, userId]
  );

  if (!userId || !venueId) {
    return (
      <div className="rounded-ht-2xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-300">
        Join a venue to send and manage challenges.
      </div>
    );
  }

  if (loading) {
    return <BouncingBallLoader size="sm" label="Loading challenges..." />;
  }

  return (
    <div className="space-y-4">
      <VenueEntryRulesPanel
        gameKey="fantasy"
        shouldDisplay={pendingReceived.length + pendingSent.length === 0}
      />
      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h2 className="text-lg font-semibold text-ht-fg-primary">Challenge Center</h2>
        <p className="mt-1 text-sm text-ht-fg-secondary">
          Send and manage head-to-head challenges for this week.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface px-2 py-2">
            <div className="font-semibold text-ht-fg-primary">Received Pending</div>
            <div className="mt-1 text-base font-black text-ht-fg-primary">{pendingReceived.length}</div>
          </div>
          <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface px-2 py-2">
            <div className="font-semibold text-ht-fg-primary">Sent Pending</div>
            <div className="mt-1 text-base font-black text-ht-fg-primary">{pendingSent.length}</div>
          </div>
          <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface px-2 py-2">
            <div className="font-semibold text-ht-fg-primary">Accepted</div>
            <div className="mt-1 text-base font-black text-ht-fg-primary">{accepted.length}</div>
          </div>
          <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface px-2 py-2">
            <div className="font-semibold text-ht-fg-primary">Completed</div>
            <div className="mt-1 text-base font-black text-ht-fg-primary">{completed.length}</div>
          </div>
        </div>

        {statusMessage ? (
          <p className="mt-3 rounded-ht-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 rounded-ht-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h3 className="text-base font-semibold text-ht-fg-primary">Create Challenge</h3>
        <p className="mt-1 text-xs text-ht-fg-muted">
          Challenge another player in your venue by username.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={receiverUsername}
            onChange={(event) => setReceiverUsername(event.target.value)}
            placeholder="Opponent username"
            className="rounded-ht-lg border border-ht-border-soft bg-ht-elevated px-3 py-2 text-sm text-ht-fg-secondary hover:opacity-80 transition-opacity"
          />
          <select
            value={gameType}
            onChange={(event) => setGameType(event.target.value as ChallengeGameType)}
            className="rounded-ht-lg border border-ht-border-soft bg-ht-elevated px-3 py-2 text-sm text-ht-fg-secondary hover:opacity-80 transition-opacity"
          >
            <option value="pickem">Hightop Pick &apos;Em</option>
            <option value="fantasy">Hightop Fantasy Sports</option>
            <option value="speed-trivia">Speed Trivia</option>
            <option value="live-trivia">Hightop Live Trivia</option>
            <option value="bingo">Prop Bingo</option>
          </select>
        </div>
        <textarea
          value={challengeDetails}
          onChange={(event) => setChallengeDetails(event.target.value)}
          placeholder="Optional message"
          className="tp-clean-button mt-2 w-full rounded-ht-md border border-ht-border-soft bg-ht-elevated px-3 py-2 text-sm text-ht-fg-secondary"
          rows={3}
        />
        <button
          type="button"
          onClick={() => void sendChallenge()}
          disabled={submitting}
          className="tp-clean-button mt-3 rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-60"
        >
          {submitting ? "Sending..." : "Send Challenge"}
        </button>
      </section>

      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h3 className="text-base font-semibold text-ht-fg-primary">Received Challenges</h3>
        {pendingReceived.length === 0 ? (
          <p className="mt-2 text-sm text-ht-fg-muted">No incoming pending challenges.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingReceived.map((challenge) => (
              <li key={challenge.id} className="rounded-ht-lg border border-ht-border-hairline bg-ht-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ht-fg-primary">{challenge.challengeTitle}</p>
                    <p className="text-xs text-ht-fg-muted">
                      From <span className="font-semibold">{challenge.senderUsername}</span> ·{" "}
                      {gameTypeLabel(challenge.gameType)}
                    </p>
                    {challenge.challengeDetails ? (
                      <p className="mt-1 text-xs text-ht-fg-secondary">{challenge.challengeDetails}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-ht-fg-muted">
                      Sent {formatLocalDateTime(challenge.createdAt)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle(challenge.status)}`}>
                    {challenge.status}
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      void respondToChallenge(challenge.id, "accept", "Challenge accepted.")
                    }
                    className="rounded-ht-md border border-emerald-500/50 bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      void respondToChallenge(challenge.id, "decline", "Challenge declined.")
                    }
                    className="rounded-ht-md border border-rose-500/50 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-400 disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h3 className="text-base font-semibold text-ht-fg-primary">Sent Challenges</h3>
        {pendingSent.length === 0 ? (
          <p className="mt-2 text-sm text-ht-fg-muted">No outgoing pending challenges.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingSent.map((challenge) => (
              <li key={challenge.id} className="rounded-ht-lg border border-ht-border-hairline bg-ht-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ht-fg-primary">{challenge.challengeTitle}</p>
                    <p className="text-xs text-ht-fg-muted">
                      To <span className="font-semibold">{challenge.receiverUsername}</span> ·{" "}
                      {gameTypeLabel(challenge.gameType)}
                    </p>
                    {challenge.challengeDetails ? (
                      <p className="mt-1 text-xs text-ht-fg-secondary">{challenge.challengeDetails}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-ht-fg-muted">
                      Sent {formatLocalDateTime(challenge.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      void respondToChallenge(challenge.id, "cancel", "Challenge canceled.")
                    }
                    className="rounded-ht-md border border-ht-border-soft bg-ht-elevated px-2 py-1 text-xs font-semibold text-ht-fg-muted disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h3 className="text-base font-semibold text-ht-fg-primary">Recent Challenge Results</h3>
        {accepted.length + completed.length === 0 ? (
          <p className="mt-2 text-sm text-ht-fg-muted">No resolved challenges yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...accepted, ...completed]
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
              .slice(0, 10)
              .map((challenge) => (
                <li key={challenge.id} className="rounded-ht-lg border border-ht-border-hairline bg-ht-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ht-fg-primary">{challenge.challengeTitle}</p>
                      <p className="text-xs text-ht-fg-muted">
                        {challenge.senderUsername} vs {challenge.receiverUsername} · {gameTypeLabel(challenge.gameType)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle(challenge.status)}`}>
                      {challenge.status}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
