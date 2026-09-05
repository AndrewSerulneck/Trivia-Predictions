"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import {
  EXIT_BACK_CIRCLE_LAYOUT_CLASS,
  EXIT_BACK_TONE_CLASS,
} from "@/components/navigation/ExitBackButton";
import { type NavTone } from "@/components/navigation/StepBackButton";
import { SignOutButton } from "@/components/navigation/SignOutButton";

// ─────────────────────────────────────────────────────────────────────────────
// OwnerAccountMenu — the Partner Dashboard's account drawer trigger.
//
// This is what makes Sign Out reachable from every authenticated /owner/* page
// instead of only the dashboard.
//
// The trigger sits in OwnerShell's leading header slot.
// ─────────────────────────────────────────────────────────────────────────────

type OwnerAccountMenuProps = {
  /** Matches OwnerShell's variant so the trigger circle sits right on either surface. */
  tone?: NavTone;
};

export const OwnerAccountMenu = ({ tone = "dark" }: OwnerAccountMenuProps) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`${EXIT_BACK_CIRCLE_LAYOUT_CLASS} ${EXIT_BACK_TONE_CLASS[tone]}`}
      >
        <UserRound aria-hidden="true" className="h-4 w-4" />
      </button>

      {open ? (
        <>
          {/* Click-away scrim — transparent, closes on any outside tap. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[4990] cursor-default"
          />
          <div
            role="menu"
            className="absolute left-0 z-[5000] mt-2 w-56 overflow-hidden rounded-2xl border border-ht-hairline bg-ht-surface p-2 shadow-ht-modal"
          >
            <SignOutButton variant="partner" />
          </div>
        </>
      ) : null}
    </div>
  );
};
