"use client";

import { FormEvent, useMemo, useState } from "react";

const INTAKE_EMAIL = "adinfo@hightopchallenge.com";

function normalizeBusinessLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function AdvertisingIntakeForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [business, setBusiness] = useState("");
  const [businessLink, setBusinessLink] = useState("");
  const [adDescription, setAdDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const normalizedBusinessLink = useMemo(() => normalizeBusinessLink(businessLink), [businessLink]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedBusiness = business.trim();
    const trimmedAdDescription = adDescription.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone) {
      setErrorMessage("Please fill out name, email, and phone number.");
      return;
    }

    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailLooksValid) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    const details = [
      `Name: ${trimmedName}`,
      `Email: ${trimmedEmail}`,
      `Phone: ${trimmedPhone}`,
      `Business: ${trimmedBusiness || "Not provided"}`,
      `Business Link: ${normalizedBusinessLink || "Not provided"}`,
      `Ad Description: ${trimmedAdDescription || "Not provided"}`,
    ].join("\n");

    const subject = encodeURIComponent("Advertising Interest - Hightop Challenge");
    const body = encodeURIComponent(details);
    const mailtoUrl = `mailto:${INTAKE_EMAIL}?subject=${subject}&body=${body}`;

    if (typeof window !== "undefined") {
      window.location.href = mailtoUrl;
    }

    setSubmitted(true);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      {errorMessage ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}
      {submitted ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
          Thanks. If your email app did not open, send your details to {INTAKE_EMAIL}.
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="ad-intake-name" className="text-sm font-semibold text-slate-800">
          Name *
        </label>
        <input
          id="ad-intake-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="Your full name"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ad-intake-email" className="text-sm font-semibold text-slate-800">
          Email *
        </label>
        <input
          id="ad-intake-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="you@company.com"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ad-intake-phone" className="text-sm font-semibold text-slate-800">
          Phone Number *
        </label>
        <input
          id="ad-intake-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="(555) 555-5555"
          required
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ad-intake-business" className="text-sm font-semibold text-slate-800">
          Business (Optional)
        </label>
        <input
          id="ad-intake-business"
          value={business}
          onChange={(event) => setBusiness(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="Business name"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ad-intake-business-link" className="text-sm font-semibold text-slate-800">
          Business Link (Optional)
        </label>
        <input
          id="ad-intake-business-link"
          type="url"
          value={businessLink}
          onChange={(event) => setBusinessLink(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="https://yourbusiness.com"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ad-intake-description" className="text-sm font-semibold text-slate-800">
          What Kind of Ad Would You Like to Place? (Optional)
        </label>
        <textarea
          id="ad-intake-description"
          value={adDescription}
          onChange={(event) => setAdDescription(event.target.value)}
          className="min-h-[110px] w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          placeholder="Short description of the ad type, goals, placement ideas, etc."
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-base font-semibold text-white"
      >
        Submit Advertising Interest
      </button>
    </form>
  );
}
