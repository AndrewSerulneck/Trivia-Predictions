"use client";

import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DISPLAY_CODE_ALPHABET, DISPLAY_CODE_LENGTH } from "@/lib/displayCode";
import { gameHref } from "@/lib/domainSplit";
import { forgetTvVenueId, readRememberedTvVenueId, rememberTvVenueId } from "@/lib/tvApp";
import {
  normalizeTvCode,
  parseTypedDisplayCode,
  TV_CONNECT_COPY,
  TV_PAIR_POLL_MS,
  TV_PAIR_SECRET_HEADER,
  tvConnectUrl,
  type TvDisplayCodeResult,
  type TvPairingCreated,
  type TvPairingStatus,
} from "@/lib/tvConnectShared";
import { getVenueScreenTheme, SCREEN_COLORS } from "@/lib/venueScreenBrand";

// The Hightop Challenge TV app's Connect screen, /tv-app (docs/fire-tv-app-plan.md Phase 3, D2, D10; mockups v2
// section A). Two equal choices: Option 1 scan the QR with a signed-in phone, OR Option 2 type the 4-character
// display code with the remote. Try demo sits top right. Authored at 1920×1080 and scaled to the viewport.
//
// Cost (plan "Connecting a TV"): one create, then one status read every 3 s only while this screen is visible and
// the code is unexpired (≤ 200 per code). An expired code waits for a key press; it never regenerates by itself.

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const CONNECTED_HOLD_MS = 1_500;
const QR_PX = 380;
const QR_QUIET_PX = 32;

const theme = getVenueScreenTheme("idle");
// Every focusable control has a 4px border, so the ring swaps the whole border (never mix `border` + `borderColor`).
const FOCUS_RING = {
  border: `4px solid ${SCREEN_COLORS.cyan300}`,
  boxShadow: "0 0 0 8px rgba(34,211,238,0.28), 0 0 48px rgba(34,211,238,0.55)",
  background: "rgba(34,211,238,0.12)",
} as const;

export const tvDisplayHref = (venueId: string): string => gameHref(`/venue/${encodeURIComponent(venueId)}/screen`);

type Pairing =
  | { state: "loading" }
  | { state: "ready"; pairCode: string; pollSecret: string; expiresAtMs: number }
  | { state: "expired" }
  | { state: "error" };

const FitCanvas = ({ children }: { children: ReactNode }) => {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black text-white">
      <div
        className="relative shrink-0 origin-center overflow-hidden"
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, background: theme.stageGradient }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0"
          style={{ height: 6, opacity: 0.5, background: `linear-gradient(90deg, ${SCREEN_COLORS.cyan500}, ${SCREEN_COLORS.amber500} 85%)` }}
        />
        {children}
      </div>
    </div>
  );
};

const Wordmark = ({ size }: { size: number }) => (
  <div
    className="whitespace-nowrap font-black"
    style={{
      fontSize: size,
      letterSpacing: "-0.045em",
      lineHeight: 0.94,
      paddingBottom: "0.22em",
      marginBottom: "-0.22em",
      backgroundImage: `linear-gradient(100deg, ${SCREEN_COLORS.white} 0%, ${SCREEN_COLORS.cyan400} 46%, ${SCREEN_COLORS.amber400} 100%)`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
    }}
  >
    Hightop Challenge
  </div>
);

const OptionTag = ({ children }: { children: ReactNode }) => (
  <div
    className="rounded-full font-black uppercase"
    style={{
      fontSize: 30,
      letterSpacing: "0.16em",
      color: SCREEN_COLORS.cyan300,
      background: "rgba(34,211,238,0.12)",
      border: "2px solid rgba(103,232,249,0.35)",
      padding: "4px 26px",
    }}
  >
    {children}
  </div>
);

const optionCardStyle = {
  borderRadius: 36,
  border: "4px solid rgba(148,163,184,0.28)",
  background: "rgba(255,255,255,0.04)",
  padding: "36px 44px",
  gap: 28,
} as const;

const QrSlot = ({ pairing }: { pairing: Pairing }) => {
  const side = QR_PX + QR_QUIET_PX * 2;
  if (pairing.state === "ready") {
    return (
      <div className="shrink-0 rounded-[28px] bg-white" style={{ padding: QR_QUIET_PX }} data-testid="tv-connect-qr">
        <QRCodeSVG
          value={tvConnectUrl(pairing.pairCode)}
          size={QR_PX}
          level="M"
          marginSize={0}
          bgColor="#ffffff"
          fgColor={SCREEN_COLORS.canvas}
          title="Scan to connect this TV"
        />
      </div>
    );
  }
  const message =
    pairing.state === "loading"
      ? null
      : pairing.state === "expired"
        ? { title: "Code expired", body: "Press OK for a new code" }
        : { title: "Can't connect.", body: "Press OK to try again" };
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center text-center"
      style={{ width: side, height: side, borderRadius: 28, border: "4px dashed rgba(148,163,184,0.45)", gap: 18 }}
      data-testid="tv-connect-qr-placeholder"
    >
      {message ? (
        <>
          <div className="font-black" style={{ fontSize: 52 }}>
            {message.title}
          </div>
          <div className="font-bold" style={{ fontSize: 36, color: "#94a3b8" }}>
            {message.body}
          </div>
        </>
      ) : null}
    </div>
  );
};

export const TvConnectScreen = () => {
  const router = useRouter();
  const [view, setView] = useState<"checking" | "connect" | "connected">("checking");
  const [pairing, setPairing] = useState<Pairing>({ state: "loading" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [focused, setFocused] = useState<"code" | "demo" | null>(null);
  // Focus lands on the code boxes (`boxesRef`, not editable), never straight on the hidden input: on a TV a focused
  // input opens the on-screen keyboard over the QR after any remote press (e.g. Back from Try demo), and that keyboard
  // eats the next Back. OK, a tap or a typed character moves focus into the input, which opens the keyboard then.
  // (`inputmode="none"` can't do this: Android's WebView keeps the remote's OK for itself on an input.) Phase 5.
  const boxesRef = useRef<HTMLLabelElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const demoRef = useRef<HTMLButtonElement>(null);
  const creatingRef = useRef(false);
  const reopenKeyboardRef = useRef(false);

  const goToDisplay = useCallback((venueId: string) => {
    rememberTvVenueId(venueId);
    setView("connected");
    window.setTimeout(() => window.location.replace(tvDisplayHref(venueId)), CONNECTED_HOLD_MS);
  }, []);

  const createPairing = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setPairing({ state: "loading" });
    try {
      const response = await fetch("/api/tv-app/pairings", { method: "POST", cache: "no-store" });
      const json = (await response.json()) as TvPairingCreated | { ok: false };
      if (!response.ok || !json.ok) throw new Error("create failed");
      setPairing({
        state: "ready",
        pairCode: json.pairCode,
        pollSecret: json.pollSecret,
        expiresAtMs: Date.parse(json.expiresAt),
      });
    } catch {
      setPairing({ state: "error" });
    } finally {
      creatingRef.current = false;
    }
  }, []);

  // First open: a remembered venue goes straight to its display. `?change=1` (the remote's Menu → Change venue)
  // forgets it and shows this screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("change")) {
      forgetTvVenueId();
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      const remembered = readRememberedTvVenueId();
      if (remembered) {
        window.location.replace(tvDisplayHref(remembered));
        return;
      }
    }
    setView("connect");
    void createPairing();
  }, [createPairing]);

  useEffect(() => {
    if (view === "connect") boxesRef.current?.focus();
  }, [view]);

  // Poll only while this screen is visible and the code is unexpired.
  useEffect(() => {
    if (view !== "connect" || pairing.state !== "ready") return;
    let active = true;
    let timer: number | null = null;
    const { pollSecret, expiresAtMs } = pairing;

    const tick = async () => {
      if (!active) return;
      if (Date.now() >= expiresAtMs) {
        setPairing({ state: "expired" });
        return;
      }
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/tv-app/pairings/status", {
            cache: "no-store",
            headers: { [TV_PAIR_SECRET_HEADER]: pollSecret },
          });
          const json = (await response.json()) as TvPairingStatus | { ok: false };
          if (!active) return;
          if (json.ok && json.state === "connected") {
            goToDisplay(json.venueId);
            return;
          }
          if (json.ok && json.state === "expired") {
            setPairing({ state: "expired" });
            return;
          }
        } catch {
          // A dropped request just waits for the next tick.
        }
      }
      if (active) timer = window.setTimeout(tick, TV_PAIR_POLL_MS);
    };

    timer = window.setTimeout(tick, TV_PAIR_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !active) return;
      if (timer !== null) window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [goToDisplay, pairing, view]);

  // An expired or failed code renews only on a key press, a tap or the window regaining focus.
  useEffect(() => {
    if (view !== "connect" || (pairing.state !== "expired" && pairing.state !== "error")) return;
    const renew = () => void createPairing();
    window.addEventListener("keydown", renew);
    window.addEventListener("pointerdown", renew);
    window.addEventListener("focus", renew);
    return () => {
      window.removeEventListener("keydown", renew);
      window.removeEventListener("pointerdown", renew);
      window.removeEventListener("focus", renew);
    };
  }, [createPairing, pairing.state, view]);

  const submitCode = useCallback(
    async (value: string) => {
      const parsed = parseTypedDisplayCode(value);
      if (!parsed || codeBusy) return;
      setCodeBusy(true);
      setCodeError(null);
      try {
        const response = await fetch("/api/tv-app/display-code", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: parsed }),
        });
        const json = (await response.json()) as TvDisplayCodeResult;
        if (json.ok) {
          goToDisplay(json.venueId);
          return;
        }
        setCodeError(json.error || TV_CONNECT_COPY.codeNotFound);
      } catch {
        setCodeError("Can't connect.");
      } finally {
        setCodeBusy(false);
      }
      setCode("");
      // The input was disabled while busy, which blurred it; reopen the keyboard once it's enabled again.
      reopenKeyboardRef.current = true;
    },
    [codeBusy, goToDisplay],
  );

  useEffect(() => {
    if (codeBusy || !reopenKeyboardRef.current) return;
    reopenKeyboardRef.current = false;
    codeRef.current?.focus();
  }, [codeBusy]);

  const onCodeChange = (raw: string) => {
    const cleaned = [...normalizeTvCode(raw)].filter((ch) => DISPLAY_CODE_ALPHABET.includes(ch)).join("");
    const next = cleaned.slice(0, DISPLAY_CODE_LENGTH);
    setCode(next);
    if (codeError) setCodeError(null);
    if (next.length === DISPLAY_CODE_LENGTH) void submitCode(next);
  };

  // Remote D-pad: Up from the code goes to Try demo; Down or Left from Try demo comes back.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (focused === "code" && event.key === "ArrowUp") {
      event.preventDefault();
      demoRef.current?.focus();
    } else if (focused === "demo" && (event.key === "ArrowDown" || event.key === "ArrowLeft")) {
      event.preventDefault();
      boxesRef.current?.focus();
    }
  };

  // On the boxes: OK opens the input (and the keyboard); a typed character (a real keyboard) goes straight in.
  const onBoxesKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      codeRef.current?.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      codeRef.current?.focus();
      onCodeChange(code + event.key);
    }
  };

  if (view === "checking") return <FitCanvas>{null}</FitCanvas>;

  if (view === "connected") {
    return (
      <FitCanvas>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 30 }} data-testid="tv-connected">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 220, height: 220, background: "rgba(110,231,183,0.15)", border: `8px solid ${SCREEN_COLORS.emerald300}` }}
          >
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke={SCREEN_COLORS.emerald300} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div className="font-black" style={{ fontSize: 110, letterSpacing: "-0.03em" }}>
            {TV_CONNECT_COPY.connected}
          </div>
        </div>
      </FitCanvas>
    );
  }

  const chars = Array.from({ length: DISPLAY_CODE_LENGTH }, (_, i) => code[i] ?? "");
  const activeBox = focused === "code" ? Math.min(code.length, DISPLAY_CODE_LENGTH - 1) : -1;

  return (
    <FitCanvas>
      <div
        className="absolute inset-0 flex flex-col"
        style={{ padding: "64px 120px 76px", gap: 44 }}
        onKeyDown={onKeyDown}
        data-testid="tv-connect"
      >
        <div className="flex items-end justify-between" style={{ gap: 40 }}>
          <div>
            <Wordmark size={76} />
            <h1 className="font-black" style={{ fontSize: 100, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 22 }}>
              Connect this TV
            </h1>
          </div>
          <button
            ref={demoRef}
            type="button"
            onClick={() => router.push("/tv-app/demo")}
            onFocus={() => setFocused("demo")}
            onBlur={() => setFocused(null)}
            className="whitespace-nowrap rounded-full font-extrabold outline-none"
            style={{
              fontSize: 40,
              borderRadius: 999,
              color: "#cbd5e1",
              border: "4px solid rgba(148,163,184,0.45)",
              padding: "12px 44px",
              ...(focused === "demo" ? { ...FOCUS_RING, color: SCREEN_COLORS.white } : null),
            }}
          >
            Try demo
          </button>
        </div>

        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(0, 1fr) 150px minmax(0, 1fr)" }}>
          <div className="flex min-w-0 flex-col items-center" style={optionCardStyle}>
            <OptionTag>Option 1</OptionTag>
            <div className="whitespace-nowrap font-black" style={{ fontSize: 52, letterSpacing: "-0.02em" }}>
              Scan with your phone
            </div>
            <QrSlot pairing={pairing} />
          </div>

          <div
            className="flex items-center justify-center self-center justify-self-center rounded-full font-black"
            style={{
              width: 116,
              height: 116,
              fontSize: 46,
              background: SCREEN_COLORS.amber400,
              color: "#1b1203",
              boxShadow: "0 0 40px rgba(251,191,36,0.45)",
            }}
          >
            OR
          </div>

          <div className="flex min-w-0 flex-col items-center" style={optionCardStyle}>
            <OptionTag>Option 2</OptionTag>
            <div className="whitespace-nowrap font-black" style={{ fontSize: 52, letterSpacing: "-0.02em" }}>
              Type your display code
            </div>
            <label
              ref={boxesRef}
              tabIndex={0}
              onKeyDown={onBoxesKeyDown}
              onFocus={(event) => {
                if (event.target === event.currentTarget) setFocused("code");
              }}
              onBlur={(event) => {
                if (event.target === event.currentTarget) setFocused(null);
              }}
              className="relative flex cursor-text outline-none"
              style={{ gap: 20 }}
              data-testid="tv-connect-code-boxes"
            >
              <span className="sr-only">Display code</span>
              {chars.map((ch, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="flex items-center justify-center font-black"
                  style={{
                    width: 124,
                    height: 156,
                    borderRadius: 22,
                    fontSize: 98,
                    border: "4px solid rgba(148,163,184,0.45)",
                    background: "rgba(255,255,255,0.05)",
                    ...(i === activeBox ? FOCUS_RING : null),
                  }}
                >
                  {ch}
                </span>
              ))}
              <input
                ref={codeRef}
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitCode(code);
                }}
                onFocus={() => setFocused("code")}
                onBlur={() => setFocused(null)}
                disabled={codeBusy}
                tabIndex={-1}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                aria-label="Display code"
                data-testid="tv-connect-code"
                // Invisible (opacity, not colour): global form CSS forces an !important border and focus ring on inputs.
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </label>
            <div className="font-bold" style={{ fontSize: 32, color: codeError ? SCREEN_COLORS.amber300 : "#94a3b8" }} aria-live="polite">
              {codeError ?? "On your dashboard under Display"}
            </div>
          </div>
        </div>
      </div>
    </FitCanvas>
  );
};
