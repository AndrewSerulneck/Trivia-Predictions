"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-3 rounded-ht-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-300">
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p>Try again. If this keeps happening, contact an admin.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-rose-700 px-3 py-2 font-medium text-white transition hover:bg-rose-800"
      >
        Retry
      </button>
    </div>
  );
}
