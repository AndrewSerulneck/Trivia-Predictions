"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
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
  if (gameType === "fantasy") return "Hightop Fantasy";
  if (gameType === "trivia") return "Hightop Trivia";
  return "Hightop Sports Bingo";
}

function statusStyle(status: ChallengeInvite["status"]): string {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "declined") return "bg-rose-100 text-rose-800";
  if (status === "completed") return "bg-blue-100 text-blue-800";
  if (status === "canceled") return "bg-slate-200 text-slate-700";
  if (status === "expired") return "bg-amber-100 text-amber-800";
  return "bg-amber-50 text-amber-900";
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
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Join a venue to send and manage challenges.
      </div>
    );
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading challenges...</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Challenge Center</h2>
        <p className="mt-1 text-sm text-slate-700">
          Send and manage head-to-head challenges for this week.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
            <div className="font-semibold text-slate-900">Received Pending</div>
            <div className="mt-1 text-base font-black text-slate-800">{pendingReceived.length}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
            <div className="font-semibold text-slate-900">Sent Pending</div>
            <div className="mt-1 text-base font-black text-slate-800">{pendingSent.length}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
            <div className="font-semibold text-slate-900">Accepted</div>
            <div className="mt-1 text-base font-black text-slate-800">{accepted.length}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
            <div className="font-semibold text-slate-900">Completed</div>
            <div className="mt-1 text-base font-black text-slate-800">{completed.length}</div>
          </div>
        </div>

        {statusMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Create Challenge</h3>
        <p className="mt-1 text-xs text-slate-600">
          Challenge another player in your venue by username.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={receiverUsername}
            onChange={(event) => setReceiverUsername(event.target.value)}
            placeholder="Opponent username"
            className="tp-clean-button rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <select
            value={gameType}
            onChange={(event) => setGameType(event.target.value as ChallengeGameType)}
            className="tp-clean-button rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="pickem">Hightop Pick &apos;Em</option>
            <option value="fantasy">Hightop Fantasy</option>
            <option value="trivia">Hightop Trivia</option>
            <option value="bingo">Hightop Sports Bingo</option>
          </select>
        </div>
        <textarea
          value={challengeDetails}
          onChange={(event) => setChallengeDetails(event.target.value)}
          placeholder="Optional message"
          className="tp-clean-button mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Received Challenges</h3>
        {pendingReceived.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No incoming pending challenges.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingReceived.map((challenge) => (
              <li key={challenge.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{challenge.challengeTitle}</p>
                    <p className="text-xs text-slate-600">
                      From <span className="font-semibold">{challenge.senderUsername}</span> ·{" "}
                      {gameTypeLabel(challenge.gameType)}
                    </p>
                    {challenge.challengeDetails ? (
                      <p className="mt-1 text-xs text-slate-700">{challenge.challengeDetails}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">
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
                    className="tp-clean-button rounded-lg border border-emerald-500 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      void respondToChallenge(challenge.id, "decline", "Challenge declined.")
                    }
                    className="tp-clean-button rounded-lg border border-rose-500 bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-900 disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Sent Challenges</h3>
        {pendingSent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No outgoing pending challenges.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pendingSent.map((challenge) => (
              <li key={challenge.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{challenge.challengeTitle}</p>
                    <p className="text-xs text-slate-600">
                      To <span className="font-semibold">{challenge.receiverUsername}</span> ·{" "}
                      {gameTypeLabel(challenge.gameType)}
                    </p>
                    {challenge.challengeDetails ? (
                      <p className="mt-1 text-xs text-slate-700">{challenge.challengeDetails}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">
                      Sent {formatLocalDateTime(challenge.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() =>
                      void respondToChallenge(challenge.id, "cancel", "Challenge canceled.")
                    }
                    className="tp-clean-button rounded-lg border border-slate-400 bg-white px-2 py-1 text-xs font-semibold text-slate-800 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Recent Challenge Results</h3>
        {accepted.length + completed.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No resolved challenges yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...accepted, ...completed]
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
              .slice(0, 10)
              .map((challenge) => (
                <li key={challenge.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{challenge.challengeTitle}</p>
                      <p className="text-xs text-slate-600">
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
