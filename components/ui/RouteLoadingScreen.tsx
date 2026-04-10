"use client";

export function RouteLoadingScreen({
  title = "Loading Hightop Challenge",
  subtitle = "Getting everything ready...",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border-4 border-slate-900 bg-white p-6 text-center shadow-[8px_8px_0_#0f172a]">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-slate-900 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900" />
        </div>
        <p className="text-lg font-black text-slate-900">{title}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-slate-900" />
        </div>
      </div>
    </div>
  );
}
