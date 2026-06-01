"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="m-0 min-h-screen bg-[#08080b] p-0 text-white">
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="w-full max-w-md rounded-lg border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-100">
            <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
            <p className="mt-3 text-rose-100/85">The app hit an error while loading. Try again, or refresh the page.</p>
            {error.digest ? <p className="mt-3 font-mono text-xs text-rose-100/70">Error digest: {error.digest}</p> : null}
            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-md bg-rose-700 px-3 py-2 font-medium text-white transition hover:bg-rose-800"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
