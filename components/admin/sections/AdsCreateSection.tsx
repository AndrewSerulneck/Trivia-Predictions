"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";

const AD_SLOT_KEYS = [
  "venue-inline-v2",
  "trivia-popup-round-1",
  "leaderboard-sidebar",
  "game-recap-banner",
];

export function AdsCreateSection() {
  const [slotKey, setSlotKey] = useState(AD_SLOT_KEYS[0]);
  const [priority, setPriority] = useState(10);
  const [adContent, setAdContent] = useState("");
  const [size, setSize] = useState("300x250");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    setStatus("saving");
    setError(null);

    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads",
          slot_key: slotKey,
          priority,
          content: adContent,
          size,
          enabled: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to create ad");
      }

      setStatus("success");
      // Reset form
      setSlotKey(AD_SLOT_KEYS[0]);
      setPriority(10);
      setAdContent("");
      setSize("300x250");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create ad."));
      setStatus("error");
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-900 text-white p-4">
      <h1 className="text-2xl font-bold mb-4">Create New Ad</h1>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
        <div>
          <label htmlFor="slot_key" className="block text-sm font-medium text-slate-300">
            Ad Slot Key
          </label>
          <select
            id="slot_key"
            name="slot_key"
            value={slotKey}
            onChange={(e) => setSlotKey(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-700 bg-slate-800 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            {AD_SLOT_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="block text-sm font-medium text-slate-300">
            Priority
          </label>
          <input
            type="number"
            id="priority"
            name="priority"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10))}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-700 bg-slate-800 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            required
          />
        </div>

        <div>
          <label htmlFor="size" className="block text-sm font-medium text-slate-300">
            Ad Size
          </label>
          <input
            type="text"
            id="size"
            name="size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-700 bg-slate-800 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            placeholder="e.g., 300x250"
            required
          />
        </div>

        <div>
          <label htmlFor="adContent" className="block text-sm font-medium text-slate-300">
            Ad Content (HTML/Script)
          </label>
          <textarea
            id="adContent"
            name="adContent"
            rows={6}
            value={adContent}
            onChange={(e) => setAdContent(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-700 bg-slate-800 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            placeholder="<div...></div> or <script...></script>"
            required
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={status === "saving"}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {status === "saving" ? "Saving..." : "Create Ad"}
          </button>
        </div>

        {status === "success" && (
          <p className="text-green-400">Ad created successfully!</p>
        )}
        {status === "error" && <p className="text-red-500">{error}</p>}
      </form>
    </div>
  );
}
