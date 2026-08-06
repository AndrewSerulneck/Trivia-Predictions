"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type AdminSelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type AdminSelectProps<T extends string> = {
  value: T;
  options: AdminSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Trigger classes — pass the same classes the native `<select>` used (e.g. `adminField`). */
  className?: string;
  disabled?: boolean;
};

/**
 * Admin-theme replacement for a native `<select>`. Native select popups are
 * OS-rendered chrome: on mobile the options open as a system action sheet whose
 * font and format don't match the field, and most browsers ignore font/size on
 * `<option>` even on desktop. This renders the options in-app with the admin
 * slate theme so the popup matches the trigger's own styling.
 *
 * Modeled on the accessible pattern in components/ui/Dropdown.tsx (button +
 * role="listbox", outside-click/Escape to close), themed for the admin surface
 * (slate tokens instead of the player-facing ht-* tokens).
 */
export function AdminSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled,
}: AdminSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        className={`flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-current transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-[1400] mt-2 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1 shadow-lg"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`block w-full truncate rounded-md px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? "bg-indigo-50 font-semibold text-indigo-700"
                    : "text-slate-900 hover:bg-slate-100"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
