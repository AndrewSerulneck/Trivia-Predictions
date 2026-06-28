"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell, ownerInputClass, ownerLabelClass, ownerPrimaryButtonClass } from "@/components/owner/OwnerShell";

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.082-3.543M6.477 6.477A9.953 9.953 0 0112 5c4.477 0 8.268 2.943 9.542 7a10.026 10.026 0 01-4.293 5.248M15 12a3 3 0 00-3-3m0 0a3 3 0 00-2.121.879M3 3l18 18" />
    </svg>
  );

const OwnerResetPasswordPage = () => {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts the token in the URL hash: #access_token=...&type=recovery
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const type = params.get("type");
    if (token && type === "recovery") {
      setAccessToken(token);
    } else {
      setTokenError(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, newPassword }),
      });
      const data = (await response.json()) as { ok: boolean; redirect?: string; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Failed to reset password. Please try again.");
        return;
      }
      router.push(data.redirect ?? "/owner/login");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (tokenError) {
    return (
      <OwnerShell title="Link Expired" subtitle="This reset link is invalid or has already been used">
        <p className="mb-4 text-sm text-slate-600">
          Please request a new password reset link.
        </p>
        <a href="/owner/forgot-password" className="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-indigo-700">
          Request New Link
        </a>
      </OwnerShell>
    );
  }

  if (!accessToken) {
    return (
      <OwnerShell title="Reset Your Password">
        <p className="text-center text-sm text-slate-500">Verifying link…</p>
      </OwnerShell>
    );
  }

  return (
    <OwnerShell title="Set New Password" subtitle="Choose a password you haven't used before">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={ownerLabelClass}>New Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={ownerInputClass + " pr-10"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
              tabIndex={-1}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </div>
        <div>
          <label className={ownerLabelClass}>Confirm Password</label>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={ownerInputClass}
          />
        </div>
        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        <button type="submit" disabled={submitting} className={ownerPrimaryButtonClass}>
          {submitting ? "Updating…" : "Set New Password"}
        </button>
      </form>
    </OwnerShell>
  );
};

export default OwnerResetPasswordPage;
