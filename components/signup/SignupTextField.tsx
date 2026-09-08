"use client";

import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";

// Partner Self-Serve Signup — the one input.
//
// Phase 3 (docs/partner-self-serve-signup-plan.md §4), the "focus and keyboard"
// rules, made inheritable so none of the six screens re-derives them:
//
//   - AUTOFOCUS. Each step opens with its field focused, so a partner answers by
//     typing, not by tapping first. Done in an effect behind a rAF rather than
//     React's `autoFocus` attribute, because the step is mounted by
//     AnimatePresence AFTER the outgoing step finishes exiting — focusing in the
//     same frame as mount can land before the element is laid out.
//     ⚠️ iOS Safari only raises the soft keyboard for a focus that is close
//     enough to a user gesture. The ~260 ms step transition may be too long, and
//     no headless tool can tell us. This is item 3 of
//     docs/self-serve-signup-device-checklist.md and it has a documented fix
//     order — do not "fix" it speculatively.
//
//   - `enterKeyHint` so the phone's return key reads "next" / "go" instead of
//     "return", and `onEnter` so pressing it actually advances. Enter is
//     preventDefault-ed, so wrapping a step in a <form> for password-manager
//     affordances stays safe: it cannot double-fire.
//
//   - `inputMode` / `autoComplete` are REQUIRED props, not optional ones. They
//     are the difference between iOS offering to fill a partner's name, email
//     and a strong password, and iOS offering nothing at all. A field that
//     genuinely has no autofill meaning passes `autoComplete="off"` explicitly.
//
//   - 16px minimum type (`ht-input`, --ht-text-base) so iOS never zooms the
//     viewport on focus. Do not shrink it.

type SignupTextFieldProps = {
  id: string;
  /** Accessible name. Visually hidden — the SignupQuestion heading is what the eye reads. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Fires on the keyboard's return key. Wire it to the same handler as the footer's Next. */
  onEnter?: () => void;
  /** Re-open a prediction list when the field regains focus (the address step). */
  onFocus?: () => void;
  /** Fires when focus leaves. The email step validates format here, not per keystroke. */
  onBlur?: () => void;
  /**
   * `"search"` additionally turns OFF autocorrect and autocapitalisation — a
   * phone "helpfully" capitalising or rewriting a bar name mid-query is what
   * makes a Places lookup return nothing.
   */
  type?: "text" | "email" | "password" | "tel" | "search";
  inputMode: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete: string;
  enterKeyHint?: InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  placeholder?: string;
  /** One line. Rendered under the field; also flips the border to the error tone. */
  error?: string;
  /** Trailing control inside the field box (a password reveal toggle, a spinner). */
  trailing?: ReactNode;
  /** Set false on a step whose first control is not this field (e.g. a map). */
  autoFocus?: boolean;
  name?: string;
  maxLength?: number;
};

export function SignupTextField({
  id,
  label,
  value,
  onChange,
  onEnter,
  onFocus,
  onBlur,
  type = "text",
  inputMode,
  autoComplete,
  enterKeyHint = "next",
  placeholder,
  error,
  trailing,
  autoFocus = true,
  name,
  maxLength,
}: SignupTextFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...(onFocus ? { onFocus } : {})}
          {...(onBlur ? { onBlur } : {})}
          {...(type === "search" ? { autoCorrect: "off", autoCapitalize: "off", spellCheck: false } : {})}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !onEnter) {
              return;
            }
            event.preventDefault();
            onEnter();
          }}
          inputMode={inputMode}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
          {...(placeholder ? { placeholder } : {})}
          {...(maxLength ? { maxLength } : {})}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`ht-input w-full ${trailing ? "pr-12" : ""} ${
            error ? "border-ht-rose-400 focus:border-ht-rose-400" : ""
          }`}
        />
        {trailing ? (
          <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="ht-caption text-ht-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
