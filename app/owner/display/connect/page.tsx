"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { Dropdown } from "@/components/ui/Dropdown";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { OWNER_AUTH_NO_VENUE, ownerLoginWithReturn } from "@/lib/ownerAuthCodes";
import {
  parsePairCode,
  TV_CONNECT_COPY,
  TV_CONNECT_PATH,
  type TvConnectResult,
} from "@/lib/tvConnectShared";

// /owner/display/connect?c=<pairCode> — the page a partner's phone opens from the QR on a Hightop Challenge TV
// (docs/fire-tv-app-plan.md Phase 3). Pick the venue (only when there are several) and tap Connect; the TV
// switches to that venue's display within a few seconds. Signed out → sign in, then back here with the code.
//
// Sign-in and Connect only (plan D40, Phase AZ1): Amazon treats this page as part of the TV app, so nothing on it
// leads to signup, pricing or billing. No Back to the dashboard, no partner menu, and a signed-in partner with no
// venue is told so here instead of being sent to signup (ownerAuthRecoveryPath is deliberately not used).

type Venue = { id: string; name: string };
type Outcome = { kind: "connected" } | { kind: "expired" } | { kind: "error"; message: string } | null;

/** A 401 from an owner API: true when signed in with no venue (say so here); false → sign in, then come back. */
const isNoVenue401 = async (res: Response): Promise<boolean> => {
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return body.code === OWNER_AUTH_NO_VENUE;
};

const OwnerDisplayConnectPage = () => {
  const router = useRouter();
  const [pairCode, setPairCode] = useState<string | null | undefined>(undefined);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  useEffect(() => {
    const code = parsePairCode(new URLSearchParams(window.location.search).get("c"));
    setPairCode(code);
    if (!code) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          if (!(await isNoVenue401(res))) {
            router.replace(ownerLoginWithReturn(`${TV_CONNECT_PATH}?c=${code}`));
          }
          return;
        }
        const json = (await res.json()) as { ok: boolean; venues?: Venue[] };
        const loaded = json.venues ?? [];
        setVenues(loaded);
        setVenueId(loaded[0]?.id ?? "");
      } catch {
        setOutcome({ kind: "error", message: "Something went wrong. Try again." });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const connect = async () => {
    if (!pairCode || !venueId || submitting) return;
    setSubmitting(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/owner/tv-app/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairCode, venueId }),
      });
      if (res.status === 401) {
        if (!(await isNoVenue401(res))) {
          router.replace(ownerLoginWithReturn(`${TV_CONNECT_PATH}?c=${pairCode}`));
        } else {
          setVenues([]);
          setVenueId("");
        }
        return;
      }
      const json = (await res.json()) as TvConnectResult;
      if (json.ok) setOutcome({ kind: "connected" });
      else if (json.code === "expired") setOutcome({ kind: "expired" });
      else setOutcome({ kind: "error", message: json.error });
    } catch {
      setOutcome({ kind: "error", message: "Something went wrong. Try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const selected = venues.find((venue) => venue.id === venueId);

  return (
    <OwnerShell title="Connect TV" variant="dark" hideMenu>
      {loading || pairCode === undefined ? (
        <HightopLoader size="lg" className="py-10" />
      ) : (
        <div className="space-y-5 rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card">
          {outcome?.kind === "connected" ? (
            <p className="text-center text-2xl font-black text-ht-primary" data-testid="tv-connect-result">
              {TV_CONNECT_COPY.connected}
            </p>
          ) : outcome?.kind === "expired" || pairCode === null ? (
            <p className="text-center text-base font-bold text-ht-primary" data-testid="tv-connect-result">
              {TV_CONNECT_COPY.expired}
            </p>
          ) : venues.length === 0 ? (
            <p className="text-center text-sm font-semibold text-ht-muted">No venue found for this account.</p>
          ) : (
            <>
              {venues.length > 1 ? (
                <Dropdown
                  value={venueId}
                  onChange={setVenueId}
                  options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
                  ariaLabel="Venue"
                  className="min-h-12 w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
                />
              ) : (
                <p className="text-center text-xl font-black text-ht-primary">{selected?.name}</p>
              )}
              <button
                type="button"
                onClick={() => void connect()}
                disabled={submitting || !venueId}
                className="min-h-12 w-full rounded-xl bg-ht-cyan-500 px-4 text-base font-black text-slate-950 disabled:opacity-50"
                data-testid="tv-connect-button"
              >
                {submitting ? "Connecting…" : "Connect"}
              </button>
              {outcome?.kind === "error" ? (
                <p className="text-center text-sm font-semibold text-rose-300">{outcome.message}</p>
              ) : null}
            </>
          )}
        </div>
      )}
    </OwnerShell>
  );
};

export default OwnerDisplayConnectPage;
