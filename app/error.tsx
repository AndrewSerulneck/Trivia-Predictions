"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const showDebug = process.env.NODE_ENV !== "production";

  useEffect(() => {
    console.error("[app-error]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="space-y-3 rounded-ht-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-300">
      <h2 className="text-base font-semibold">Something went wrong</h2>
      <p>Try again. If this keeps happening, contact an admin.</p>
      {showDebug ? (
        <div className="rounded-md border border-rose-400/30 bg-black/25 p-3 font-mono text-xs text-rose-100">
          <p className="font-semibold">Debug</p>
          <p className="mt-2 break-words">Message: {error.message || "No message available"}</p>
          {error.digest ? <p className="mt-1 break-words">Digest: {error.digest}</p> : null}
        </div>
      ) : error.digest ? (
        <p className="font-mono text-xs text-rose-200/80">Error digest: {error.digest}</p>
      ) : null}
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
