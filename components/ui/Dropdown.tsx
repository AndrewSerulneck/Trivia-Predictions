"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type DropdownSize = "sm" | "base";

// Matches the text-size/weight classes already used at each call site today, so
// swapping a native <select> for this component changes nothing visually except
// the popup itself.
const OPTION_TEXT_CLASSES: Record<DropdownSize, string> = {
  sm: "text-sm font-bold",
  base: "text-base font-bold",
};

type DropdownProps<T extends string> = {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Trigger classes — pass the same classes the native `<select>` used, so the closed control looks identical. */
  className?: string;
  /** Controls the OPTION ROW text size/weight only. Defaults to "base". */
  size?: DropdownSize;
  /** Escape hatch for a custom trigger (e.g. a rich card) instead of the default label + chevron button. */
  renderTrigger?: (selected: DropdownOption<T> | undefined, isOpen: boolean) => ReactNode;
  disabled?: boolean;
};

/**
 * Brand-consistent replacement for a native `<select>`. Native select popups are
 * OS-rendered chrome — most browsers ignore font-family/size on `<option>` and
 * position the popup unpredictably (often centering the selected item under the
 * click point rather than anchoring below the trigger). This component fixes
 * both: real Tailwind classes render the option text, and the popup always opens
 * directly below the trigger at the trigger's width.
 *
 * Modeled directly on the accessible dropdown already hand-built in
 * components/leaderboard/LeaderboardTable.tsx (button + role="listbox" popup,
 * outside-click/Escape to close) — this generalizes that exact pattern.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  size = "base",
  renderTrigger,
  disabled,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!isOpen) return;

    const close = ({ returnFocus = false }: { returnFocus?: boolean } = {}) => {
      setIsOpen(false);
      if (returnFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close({ returnFocus: true });
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const focusOption = (index: number, direction: 1 | -1 = 1) => {
    const enabled = options
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option }) => !option.disabled)
      .map(({ optionIndex }) => optionIndex);
    if (enabled.length === 0) return;
    const target = enabled.includes(index)
      ? index
      : direction === 1
        ? enabled.find((optionIndex) => optionIndex > index) ?? enabled[0]
        : [...enabled].reverse().find((optionIndex) => optionIndex < index) ?? enabled[enabled.length - 1];
    optionRefs.current[target]?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      const selectedIndex = options.findIndex((option) => option.value === value);
      focusOption(event.key === "ArrowUp" ? selectedIndex - 1 : selectedIndex, event.key === "ArrowUp" ? -1 : 1);
    });
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(-1);
    } else if (event.key === "End") {
      event.preventDefault();
      const lastIndex = options.length - 1;
      const enabled = options.map((option, optionIndex) => (!option.disabled ? optionIndex : -1)).filter((optionIndex) => optionIndex >= 0);
      focusOption(enabled[enabled.length - 1] ?? lastIndex);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
        className={
          renderTrigger
            ? className
            : `flex items-center justify-between gap-2 disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`
        }
      >
        {renderTrigger ? (
          renderTrigger(selected, isOpen)
        ) : (
          <>
            <span className="truncate">{selected?.label ?? ""}</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {isOpen ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-[1400] mt-2 w-full max-h-64 overflow-y-auto rounded-ht-md border border-ht-elevated-2 bg-ht-elevated p-1 shadow-ht-modal"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`block w-full truncate rounded-ht-sm px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  OPTION_TEXT_CLASSES[size]
                } ${
                  isSelected
                    ? "bg-ht-cyan-500/15 text-ht-cyan-300"
                    : "text-ht-primary hover:bg-ht-elevated-2"
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
