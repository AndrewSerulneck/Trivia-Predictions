"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const INVALID_EMAIL_ERROR = "Enter a valid email address.";
const EMAIL_PASSWORD_REQUIRED_ERROR = "Enter your current password to change your email.";
const PASSWORD_REQUIRED_ERROR = "Enter your current password to change your password.";
const SHORT_PASSWORD_ERROR = "Password must be at least 8 characters.";
const PASSWORD_MISMATCH_ERROR = "Passwords do not match.";
const RESET_EMAIL_SUCCESS = "Password reset email sent. Check your inbox.";
const RESET_EMAIL_ERROR = "We couldn't send that email right now. Please try again.";
const MIN_PASSWORD_LENGTH = 8;

type OwnerAccount = {
  id: string;
  name: string;
  email: string;
};

type AccountResponse = {
  ok: boolean;
  owner?: OwnerAccount;
  error?: string;
};

type MutationResponse = {
  ok: boolean;
  owner?: OwnerAccount;
  error?: string;
};

type FormFeedback = {
  kind: "success" | "error";
  text: string;
};

const cardClass = "rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card";
const labelClass = "text-[11px] font-black uppercase tracking-wider text-ht-muted";
const inputClass =
  "min-h-11 w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-semibold text-ht-primary outline-none transition focus:border-ht-cyan-400";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950 shadow-ht-glow-cyan transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const feedbackClass: Record<FormFeedback["kind"], string> = {
  success: "bg-ht-emerald-500/15 text-ht-emerald-300",
  error: "bg-ht-rose-500/15 text-ht-rose-300",
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const OwnerAccountPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<OwnerAccount | null>(null);

  const [nextEmail, setNextEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<FormFeedback | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<FormFeedback | null>(null);
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [resetEmailFeedback, setResetEmailFeedback] = useState<FormFeedback | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/owner/account", { cache: "no-store" });
        if (response.status === 401) {
          router.push("/owner/login");
          return;
        }

        const data = (await response.json()) as AccountResponse;
        if (cancelled) {
          return;
        }

        if (!response.ok || !data.ok || !data.owner) {
          setEmailFeedback({ kind: "error", text: data.error ?? GENERIC_ERROR });
          return;
        }

        setOwner(data.owner);
        setNextEmail(data.owner.email);
      } catch {
        if (!cancelled) {
          setEmailFeedback({ kind: "error", text: GENERIC_ERROR });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(nextEmail);

    setEmailFeedback(null);

    if (!isValidEmail(normalizedEmail)) {
      setEmailFeedback({ kind: "error", text: INVALID_EMAIL_ERROR });
      return;
    }

    if (!emailPassword.trim()) {
      setEmailFeedback({ kind: "error", text: EMAIL_PASSWORD_REQUIRED_ERROR });
      return;
    }

    setEmailSaving(true);
    try {
      const response = await fetch("/api/owner/account/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          currentPassword: emailPassword,
        }),
      });
      if (response.status === 401) {
        router.push("/owner/login");
        return;
      }

      const data = (await response.json()) as MutationResponse;
      if (!response.ok || !data.ok || !data.owner) {
        setEmailFeedback({ kind: "error", text: data.error ?? GENERIC_ERROR });
        return;
      }

      setOwner(data.owner);
      setNextEmail(data.owner.email);
      setEmailPassword("");
      setEmailFeedback({ kind: "success", text: "Email address updated." });
    } catch {
      setEmailFeedback({ kind: "error", text: GENERIC_ERROR });
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setPasswordFeedback(null);

    if (!currentPassword.trim()) {
      setPasswordFeedback({ kind: "error", text: PASSWORD_REQUIRED_ERROR });
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordFeedback({ kind: "error", text: SHORT_PASSWORD_ERROR });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ kind: "error", text: PASSWORD_MISMATCH_ERROR });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await fetch("/api/owner/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      if (response.status === 401) {
        router.push("/owner/login");
        return;
      }

      const data = (await response.json()) as MutationResponse;
      if (!response.ok || !data.ok) {
        setPasswordFeedback({ kind: "error", text: data.error ?? GENERIC_ERROR });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ kind: "success", text: "Password updated." });
    } catch {
      setPasswordFeedback({ kind: "error", text: GENERIC_ERROR });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleResetEmailSend = async () => {
    setResetEmailFeedback(null);
    setResetEmailSending(true);

    try {
      const response = await fetch("/api/owner/account/password-reset-email", {
        method: "POST",
      });
      if (response.status === 401) {
        router.push("/owner/login");
        return;
      }

      const data = (await response.json()) as MutationResponse;
      if (!response.ok || !data.ok) {
        setResetEmailFeedback({ kind: "error", text: data.error ?? RESET_EMAIL_ERROR });
        return;
      }

      setResetEmailFeedback({ kind: "success", text: RESET_EMAIL_SUCCESS });
    } catch {
      setResetEmailFeedback({ kind: "error", text: RESET_EMAIL_ERROR });
    } finally {
      setResetEmailSending(false);
    }
  };

  return (
    <OwnerShell title="Account Settings" subtitle="Email address and password" maxWidth="lg" variant="dark">
      <div className="space-y-5">
        <Link
          href="/owner/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
        >
          ← Dashboard
        </Link>

        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : !owner ? (
          <div className={cardClass}>
            <p className="text-sm font-semibold text-ht-muted">We couldn&apos;t load your account right now.</p>
            {emailFeedback ? (
              <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${feedbackClass[emailFeedback.kind]}`}>
                {emailFeedback.text}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <section className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Email Address</p>
                  <h2 className="mt-2 text-lg font-black text-ht-primary">{owner.email}</h2>
                  <p className="mt-1 text-sm font-semibold text-ht-muted">
                    Use your current password to move this Partner Dashboard login to a new email address.
                  </p>
                </div>
                <div className="rounded-full bg-ht-cyan-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-ht-cyan-300">
                  Secure change
                </div>
              </div>

              <form className="mt-5 space-y-4" onSubmit={(event) => void handleEmailSubmit(event)}>
                <div className="space-y-1.5">
                  <label htmlFor="owner-email" className={labelClass}>
                    New email address
                  </label>
                  <input
                    id="owner-email"
                    type="email"
                    autoComplete="email"
                    value={nextEmail}
                    onChange={(event) => setNextEmail(event.target.value)}
                    className={inputClass}
                    disabled={emailSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="owner-email-password" className={labelClass}>
                    Current password
                  </label>
                  <input
                    id="owner-email-password"
                    type="password"
                    autoComplete="current-password"
                    value={emailPassword}
                    onChange={(event) => setEmailPassword(event.target.value)}
                    className={inputClass}
                    disabled={emailSaving}
                  />
                </div>

                {emailFeedback ? (
                  <div className={`rounded-xl px-4 py-3 text-sm font-bold ${feedbackClass[emailFeedback.kind]}`}>
                    {emailFeedback.text}
                  </div>
                ) : null}

                <button type="submit" disabled={emailSaving} className={primaryButtonClass}>
                  {emailSaving ? "Saving…" : "Update email"}
                </button>
              </form>
            </section>

            <section className={cardClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-indigo-300">Password</p>
                  <h2 className="mt-2 text-lg font-black text-ht-primary">Change your password</h2>
                  <p className="mt-1 text-sm font-semibold text-ht-muted">
                    Choose a new password with at least {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>
                <div className="rounded-full bg-ht-indigo-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-ht-indigo-300">
                  Password required
                </div>
              </div>

              <form className="mt-5 space-y-4" onSubmit={(event) => void handlePasswordSubmit(event)}>
                <div className="space-y-1.5">
                  <label htmlFor="owner-current-password" className={labelClass}>
                    Current password
                  </label>
                  <input
                    id="owner-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className={inputClass}
                    disabled={passwordSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="owner-new-password" className={labelClass}>
                    New password
                  </label>
                  <input
                    id="owner-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className={inputClass}
                    disabled={passwordSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="owner-confirm-password" className={labelClass}>
                    Confirm new password
                  </label>
                  <input
                    id="owner-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={inputClass}
                    disabled={passwordSaving}
                  />
                </div>

                {passwordFeedback ? (
                  <div className={`rounded-xl px-4 py-3 text-sm font-bold ${feedbackClass[passwordFeedback.kind]}`}>
                    {passwordFeedback.text}
                  </div>
                ) : null}

                <button type="submit" disabled={passwordSaving} className={primaryButtonClass}>
                  {passwordSaving ? "Saving…" : "Update password"}
                </button>
              </form>

              <div className="mt-5 rounded-2xl border border-ht-hairline bg-ht-elevated/60 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-ht-primary">Email me a reset link</p>
                    <p className="mt-1 text-sm font-semibold text-ht-muted">
                      Send a temporary password-reset link to {owner.email}.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleResetEmailSend()}
                    disabled={resetEmailSending}
                    className={primaryButtonClass}
                  >
                    {resetEmailSending ? "Sending…" : "Email me a reset link"}
                  </button>
                </div>

                {resetEmailFeedback ? (
                  <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${feedbackClass[resetEmailFeedback.kind]}`}>
                    {resetEmailFeedback.text}
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}
      </div>
    </OwnerShell>
  );
};

export default OwnerAccountPage;
