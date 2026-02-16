export default function Loading() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
        Loading...
      </div>
    </div>
  );
}
