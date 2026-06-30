"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

const OwnerLoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      router.push("/owner/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OwnerShell title="Partner Venue Sign In" subtitle="Manage your subscription and billing">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={ownerLabelClass}>Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={ownerInputClass}
          />
        </div>
        <div>
          <label className={ownerLabelClass}>Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
        <button type="submit" disabled={submitting} className={ownerPrimaryButtonClass}>
          {submitting ? "Signing in…" : "Sign In"}
        </button>
        <p className="text-center text-xs text-slate-400">
          <Link href="/owner/forgot-password" className="hover:text-slate-600">
            Forgot your password?
          </Link>
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New venue owner?{" "}
        <Link href="/owner/register" className="font-semibold text-indigo-600 hover:text-indigo-800">
          Create an account
        </Link>
      </p>
      <div className="mt-6 border-t border-slate-200 pt-5">
        <Link
          href="/info"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
        >
          ← Back to Home Page
        </Link>
      </div>
    </OwnerShell>
  );
};

export default OwnerLoginPage;
