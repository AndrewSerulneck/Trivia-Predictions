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

type MatchedVenue = { id: string; name: string; address: string };

const OwnerRegisterPage = () => {
  const router = useRouter();

  // Step 1 — account details + address
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  // Step 2 — venue confirmation
  const [step, setStep] = useState<1 | 2>(1);
  const [matches, setMatches] = useState<MatchedVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFindVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name || !email || password.length < 8 || (!street && !zip)) {
      setError("Fill in all fields. Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ street, zip });
      const response = await fetch(`/api/owner/auth/venue-lookup?${params.toString()}`);
      const data = (await response.json()) as { ok: boolean; venues?: MatchedVenue[]; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not search venues.");
        return;
      }
      if (!data.venues || data.venues.length === 0) {
        setError("We couldn't find a venue matching that address. Double-check your address, or contact support to get your venue added.");
        return;
      }
      setMatches(data.venues);
      setSelectedVenueId(data.venues.length === 1 ? data.venues[0].id : null);
      setStep(2);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (!selectedVenueId) {
      setError("Please select your venue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, venueId: selectedVenueId }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }
      router.push("/owner/billing/setup");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OwnerShell title="Create Owner Account" subtitle={step === 1 ? "Tell us about you and your venue" : "Confirm your venue"}>
      {step === 1 ? (
        <form onSubmit={handleFindVenue} className="space-y-4">
          <div>
            <label className={ownerLabelClass}>Your Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={ownerInputClass} />
          </div>
          <div>
            <label className={ownerLabelClass}>Email</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={ownerInputClass} />
          </div>
          <div>
            <label className={ownerLabelClass}>Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
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
          <div className="border-t border-slate-200 pt-4">
            <label className={ownerLabelClass}>Venue Street Address</label>
            <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" className={ownerInputClass} />
          </div>
          <div>
            <label className={ownerLabelClass}>Venue Zip Code</label>
            <input inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="33071" className={ownerInputClass} />
          </div>
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className={ownerPrimaryButtonClass}>
            {submitting ? "Searching…" : "Find My Venue"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">We found the following venue(s) matching your address. Select yours to continue:</p>
          <div className="space-y-2">
            {matches.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => setSelectedVenueId(venue.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                  selectedVenueId === venue.id
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                    : "border-slate-300 hover:border-slate-400"
                }`}
              >
                <div className="font-semibold text-slate-900">{venue.name}</div>
                <div className="text-sm text-slate-500">{venue.address}</div>
              </button>
            ))}
          </div>
          {error ? <p className="text-sm font-medium text-rose-600">{error}</p> : null}
          <button type="button" disabled={submitting} onClick={handleRegister} className={ownerPrimaryButtonClass}>
            {submitting ? "Creating account…" : "Create Account"}
          </button>
          <button
            type="button"
            onClick={() => { setStep(1); setError(null); }}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to edit details
          </button>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/owner/login" className="font-semibold text-indigo-600 hover:text-indigo-800">
          Sign in
        </Link>
      </p>
    </OwnerShell>
  );
};

export default OwnerRegisterPage;
