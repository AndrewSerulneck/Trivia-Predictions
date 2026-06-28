"use client";

import { useState } from "react";
import Link from "next/link";
import { OwnerShell, ownerInputClass, ownerLabelClass, ownerPrimaryButtonClass } from "@/components/owner/OwnerShell";

const OwnerForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OwnerShell title="Reset Your Password" subtitle="We'll send a reset link to your email">
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">
            If that email is associated with an owner account, you&apos;ll receive a password reset link shortly. Check your inbox (and spam folder).
          </p>
          <Link href="/owner/login" className="block text-sm font-semibold text-indigo-600 hover:text-indigo-800">
            ← Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={ownerLabelClass}>Email Address</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={ownerInputClass}
              placeholder="you@example.com"
            />
          </div>
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className={ownerPrimaryButtonClass}>
            {submitting ? "Sending…" : "Send Reset Link"}
          </button>
          <p className="text-center text-sm text-slate-500">
            <Link href="/owner/login" className="hover:text-slate-700">
              ← Back to Sign In
            </Link>
          </p>
        </form>
      )}
    </OwnerShell>
  );
};

export default OwnerForgotPasswordPage;
