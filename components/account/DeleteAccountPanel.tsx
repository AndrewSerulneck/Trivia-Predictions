"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { performSignOut } from "@/components/navigation/SignOutButton";
import { DELETE_CONFIRMATION_WORD } from "@/lib/accountDeletionShared";
import { marketingHref } from "@/lib/domainSplit";
import { haptic } from "@/lib/haptics";
import { SUPPORT_EMAIL } from "@/lib/legalInfo";
import { getUserId, getUsername } from "@/lib/storage";

// Typed-confirmation account deletion (native app store plan Phase 1b). The server decides whose
// account it is from the signed session; the userId sent here only lets the route reject a
// mismatched tab with 403. On success the full player sign-out runs (performSignOut), so the
// HttpOnly session, local state and the Supabase session all go — then the page shows a
// confirmation in place instead of navigating into a gate that would bounce to sign-in.

const WHAT_IS_DELETED: readonly string[] = [
  "Your username, PIN and any passkeys (Face ID / Touch ID).",
  "Your account at every venue: points, scores, picks, bingo cards, answers and lineups.",
  "Your place on every leaderboard. Rankings shift as if you had not played.",
  "Your notifications, rewards progress and usage history.",
];

type Phase = "idle" | "deleting" | "done";

export function DeleteAccountPanel() {
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const busyRef = useRef(false);
  // Read after mount: localStorage does not exist during the server render.
  useEffect(() => {
    setUsername(getUsername());
  }, []);
  const confirmed = typed.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;

  const handleDelete = useCallback(async () => {
    if (busyRef.current || !confirmed) return;
    busyRef.current = true;
    setPhase("deleting");
    setError("");
    haptic("warning");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: getUserId() ?? undefined, confirm: typed.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "We couldn't delete your account. Nothing was changed. Please try again.");
        setPhase("idle");
        return;
      }
      await performSignOut("player");
      setPhase("done");
    } catch {
      setError("We couldn't reach the server. Nothing was changed. Check your connection and try again.");
      setPhase("idle");
    } finally {
      busyRef.current = false;
    }
  }, [confirmed, typed]);

  if (phase === "done") {
    return (
      <section className="space-y-4 rounded-ht-lg border border-ht-border-hairline bg-ht-elevated/50 p-5" aria-live="polite">
        <h1 className="ht-h1">Your account is deleted</h1>
        <p className="text-base leading-7 text-ht-fg-secondary">
          Everything tied to it has been removed, and you have been signed out on this device. Thanks for playing.
        </p>
        <a href={marketingHref("/info")} className="inline-block font-black text-ht-fg-primary underline underline-offset-2">
          Go to Hightop Challenge
        </a>
      </section>
    );
  }

  const deleting = phase === "deleting";

  return (
    <div className="space-y-5 pb-8">
      <header className="space-y-2">
        <h1 className="ht-h1">Delete your account</h1>
        <p className="text-base leading-7 text-ht-fg-secondary">
          {username ? (
            <>
              This permanently deletes <strong className="text-ht-fg-primary">{username}</strong> everywhere you play.
            </>
          ) : (
            "This permanently deletes your Hightop Challenge account everywhere you play."
          )}{" "}
          It can&apos;t be undone.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-black text-ht-fg-primary">What is deleted</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-base leading-7 text-ht-fg-secondary">
          {WHAT_IS_DELETED.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-ht-lg border border-rose-400/45 bg-rose-500/10 p-4">
        <h2 className="text-lg font-black text-rose-200">Prizes you haven&apos;t used are lost</h2>
        <p className="text-base leading-7 text-ht-fg-secondary">
          Any coupon you haven&apos;t redeemed, including a Square gift card you haven&apos;t spent, goes away with your
          account and can&apos;t be recovered. Use them first.
        </p>
      </section>

      <p className="text-sm leading-6 text-ht-fg-muted">
        If you won a reward, the venue keeps a record that a prize was given out, without your name. You can create a
        new account later, but your history won&apos;t come back. Questions? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleDelete();
        }}
      >
        <label htmlFor="delete-account-confirm" className="block text-base font-black text-ht-fg-primary">
          Type {DELETE_CONFIRMATION_WORD} to confirm
        </label>
        <input
          id="delete-account-confirm"
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={deleting}
          className="w-full rounded-ht-lg bg-ht-elevated px-4 py-3 text-base text-ht-fg-primary"
        />
        {error ? (
          <p role="alert" className="text-sm font-bold text-rose-300">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!confirmed || deleting}
          aria-busy={deleting}
          className="tp-player-hit-target tp-player-pressable w-full rounded-ht-lg border border-rose-400/45 bg-rose-500/20 px-4 py-3 text-base font-black text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
        >
          {deleting ? (
            <>
              <ButtonSpinner /> <span role="status">Deleting your account…</span>
            </>
          ) : (
            "Delete my account"
          )}
        </button>
      </form>
    </div>
  );
}
