// Shared className tokens for admin form controls and layout.
// Import these instead of writing inline strings so every admin input,
// select, and label looks identical without per-file maintenance.

export const adminField =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

// Accent (indigo/purple) variant for triggers that should read as a filled,
// tappable control — used by the venue selector so it's obvious it opens a
// dropdown (purple fill + white text + inherited white chevron).
export const adminFieldAccent =
  "w-full rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-indigo-700 focus:ring-2 focus:ring-indigo-300";

export const adminFieldReadOnly =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none";

export const adminLabel =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";
