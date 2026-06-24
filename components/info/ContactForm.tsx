"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [venueName, setVenueName] = useState("");
  const [cityState, setCityState] = useState("");
  const [numLocations, setNumLocations] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone) {
      setErrorMessage("Please fill out name, email, and phone number.");
      return;
    }

    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailLooksValid) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          venueName: venueName.trim(),
          cityState: cityState.trim(),
          numLocations: numLocations.trim(),
          message: message.trim(),
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to submit contact form.");
      }
      setSubmitted(true);
      setName("");
      setEmail("");
      setPhone("");
      setVenueName("");
      setCityState("");
      setNumLocations("");
      setMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit contact form.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 transition-colors";
  const labelClass = "block text-sm font-semibold text-slate-300 mb-1.5";

  return (
    <form onSubmit={submit} className="space-y-5">
      {errorMessage && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {errorMessage}
        </div>
      )}
      {submitted && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Thanks — we&apos;ll be in touch soon at {email || "your email"}.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="contact-name" className={labelClass}>Name *</label>
          <input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Your full name"
            required
          />
        </div>
        <div>
          <label htmlFor="contact-email" className={labelClass}>Email *</label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@yourbar.com"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="contact-phone" className={labelClass}>Phone *</label>
          <input
            id="contact-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="(555) 555-5555"
            required
          />
        </div>
        <div>
          <label htmlFor="contact-venue" className={labelClass}>Bar / Restaurant Name</label>
          <input
            id="contact-venue"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            className={inputClass}
            placeholder="The Rusty Nail"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="contact-city-state" className={labelClass}>City & State</label>
          <input
            id="contact-city-state"
            value={cityState}
            onChange={(e) => setCityState(e.target.value)}
            className={inputClass}
            placeholder="Chicago, IL"
          />
        </div>
        <div>
          <label htmlFor="contact-locations" className={labelClass}>Number of Locations</label>
          <input
            id="contact-locations"
            type="number"
            min="1"
            value={numLocations}
            onChange={(e) => setNumLocations(e.target.value)}
            className={inputClass}
            placeholder="1"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className={labelClass}>Message / Questions</label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} min-h-[120px] resize-y`}
          placeholder="Tell us about your venue or ask us anything…"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-cyan-400 px-6 py-4 text-base font-black text-slate-950 transition-opacity disabled:opacity-60 htm-btn-glow"
      >
        {isSubmitting ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
