import type { ReactNode } from "react";

/**
 * The question or title at the top of a sheet screen. `data-step-heading` is
 * where SlideSteps moves focus after each change, so every screen needs one.
 */
export const StepHeading = ({ children, hint }: { children: ReactNode; hint?: string }) => (
  <div className="mb-4">
    <h3 data-step-heading className="ht-h2 outline-none">
      {children}
    </h3>
    {hint ? <p className="mt-1 text-sm font-semibold text-ht-muted">{hint}</p> : null}
  </div>
);
