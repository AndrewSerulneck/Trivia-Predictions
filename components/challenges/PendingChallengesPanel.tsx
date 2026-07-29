"use client";

import React, { useEffect, useState } from "react";
import type { ChallengeGameType, ChallengeInvite } from "@/types";
import { getUserId, getVenueId } from "@/lib/storage";

const MAX_RECEIVED = 5;

function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // e.g. "Mon, Jan 5 at 3:30 PM"
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function gameTypeLabel(gameType: ChallengeGameType): string {
  if (gameType === "pickem") return "Pick 'Em";
  if (gameType === "fantasy") return "Fantasy Sports";
  if (gameType === "live-trivia") return "Live Trivia";
  if (gameType === "speed-trivia") return "Speed Trivia";
  if (gameType === "trivia") return "Speed Trivia";
  return "Prop Bingo";
}

export function PendingChallengesPanel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [gameType, setGameType] = useState<ChallengeGameType>("pickem");
  const [receiverUsername, setReceiverUsername] = useState("");
  const [challengeDetails, setChallengeDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challenges, setChallenges] = useState<ChallengeInvite[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [declining, setDeclining] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  useEffect(() => {
    setUserId(getUserId());
    setVenueId(getVenueId());
  }, []);

  const loadChallenges = async (forUserId: string, forVenueId: string | null) => {
    const params = new URLSearchParams({ userId: forUserId });
    if (forVenueId) params.set("venueId", forVenueId);
    const res = await fetch(`/api/challenges?${params.toString()}`);
    const data = await res.json();
    if (data.ok) {
      setChallenges(data.challenges ?? []);
    }
  };

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    loadChallenges(userId, venueId).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, venueId]);

  async function sendChallenge() {
    if (!userId) return;
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          senderUserId: userId,
          venueId: venueId ?? undefined,
          gameType,
          receiverUsername: receiverUsername.trim(),
          challengeDetails: challengeDetails.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (body.ok) {
        setReceiverUsername("");
        setChallengeDetails("");
        setStatusMessage("Challenge sent!");
        await loadChallenges(userId, venueId);
      } else {
        setErrorMessage(body.error ?? "Failed to send challenge.");
      }
    } catch {
      setErrorMessage("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function respondToChallenge(challengeId: string, response: "accept" | "decline") {
    if (!userId) return;
    const setter = response === "decline" ? setDeclining : setCanceling;
    setter(challengeId);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "respond", userId, challengeId, response }),
      });
      const body = await res.json();
      if (body.ok) {
        await loadChallenges(userId, venueId);
      }
    } catch {
      // noop
    } finally {
      setter(null);
    }
  }

  if (!userId) return null;

  const sentInvites = challenges.filter((i) => i.senderUserId === userId);
  const pendingReceived = challenges
    .filter((i) => i.receiverUserId === userId && i.status === "pending")
    .slice(0, MAX_RECEIVED);
  const pendingSent = sentInvites.filter((i) => i.status === "pending");
  const accepted = sentInvites.filter((i) => i.status === "accepted");
  const completed = sentInvites.filter((i) => i.status === "completed");

  if (loading) {
    return (
      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h3 className="text-base font-semibold text-ht-fg-primary">Challenges</h3>
        <p className="mt-2 text-sm text-ht-fg-muted">Loading...</p>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h3 className="text-base font-semibold text-ht-fg-primary">Your Challenge Activity</h3>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-ht-md border border-ht-border-hairline bg-ht-surface px-2 py-2">
            <div className="font-semibold text-ht-fg-primary">Pending</div>
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
            <option value="pickem">Pick 'Em</option>
            <option value="fantasy">Fantasy Sports</option>
            <option value="speed-trivia">Speed Trivia</option>
            <option value="live-trivia">Live Trivia</option>
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
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => void respondToChallenge(challenge.id, "accept")}
                      disabled={declining === challenge.id || canceling === challenge.id}
                      className="tp-clean-button rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondToChallenge(challenge.id, "decline")}
                      disabled={declining === challenge.id || canceling === challenge.id}
                      className="tp-clean-button rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
