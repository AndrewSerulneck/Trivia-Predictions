"use client";

import { useMemo, useState } from "react";
import type { Venue } from "@/types";
import { getErrorMessage } from "@/lib/errors";
import { AdFormFields, defaultAdDraft, draftToPayload, type AdDraft } from "./adFormShared";

type AdsCreateSectionProps = {
  venues: Venue[];
};

const MAX_UPLOAD_BYTES = 300 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function AdsCreateSection({ venues }: AdsCreateSectionProps) {
  const [draft, setDraft] = useState<AdDraft>(defaultAdDraft());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingPlaceholder, setApplyingPlaceholder] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [placeholderApplySummary, setPlaceholderApplySummary] = useState("");

  const imagePreview = useMemo(() => draft.imageUrl.trim(), [draft.imageUrl]);

  async function uploadImage(file: File) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image must be 300KB or smaller.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/ads/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { ok: boolean; imageUrl?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.imageUrl) {
        throw new Error(payload.error ?? "Failed to upload ad image.");
      }
      setDraft((prev) => ({ ...prev, imageUrl: payload.imageUrl ?? prev.imageUrl }));
      setSuccess("Image uploaded.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to upload image."));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
    setSuccess("");
    setPlaceholderApplySummary("");

    try {
      const payload = draftToPayload(draft);
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "ads", ...payload }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to create advertisement.");
      }

      setDraft(defaultAdDraft());
      setSuccess("Advertisement created successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create advertisement."));
    } finally {
      setSaving(false);
    }
  }

  async function applyDraftAsInlinePlaceholderTemplate() {
    if (!draft.isPlaceholder) {
      setError("Mark this ad as Placeholder before applying to all inline slots.");
      return;
    }

    const confirmed = window.confirm(
      "This will create placeholder ads in any inline slots that currently have no placeholder. This will NOT overwrite or delete existing ads. Proceed?"
    );
    if (!confirmed) return;

    setApplyingPlaceholder(true);
    setError("");
    setSuccess("");
    setPlaceholderApplySummary("");

    try {
      const payload = draftToPayload(draft);
      const response = await fetch("/api/admin?resource=apply-placeholder-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: {
            advertiserName: payload.advertiserName,
            imageUrl: payload.imageUrl,
            clickUrl: payload.clickUrl,
            altText: payload.altText,
            width: payload.width,
            height: payload.height,
            adType: payload.adType,
            displayTrigger: payload.displayTrigger,
            priority: payload.priority,
            placementKey: payload.placementKey,
            startDate: payload.startDate,
            endDate: payload.endDate ?? null,
            frequencyInterval: payload.frequencyInterval,
            dismissDelaySeconds: payload.dismissDelaySeconds,
            popupCooldownSeconds: payload.popupCooldownSeconds,
            sequenceIndex: payload.sequenceIndex,
          },
        }),
      });

      const body = (await response.json()) as {
        ok: boolean;
        created?: number;
        skipped?: number;
        errors?: Array<{ slotId: string; pageKey: string; error: string }>;
        error?: string;
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to apply placeholders.");
      }

      const created = Number(body.created ?? 0);
      const skipped = Number(body.skipped ?? 0);
      const errors = Array.isArray(body.errors) ? body.errors : [];
      const errorPreview = errors
        .slice(0, 5)
        .map((entry) => `${entry.slotId}/${entry.pageKey}: ${entry.error}`)
        .join(" | ");

      setPlaceholderApplySummary(
        `Created ${created} placeholders. Skipped ${skipped} slots. Errors ${errors.length}${
          errorPreview ? ` (${errorPreview})` : ""
        }.`
      );
      setSuccess(`Created ${created} placeholders. Skipped ${skipped}.`);
      if (errors.length > 0) {
        setError(`Some slots failed: ${errorPreview}`);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to apply placeholders."));
    } finally {
      setApplyingPlaceholder(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Create Advertisement</h2>
        <p className="mt-1 text-sm text-slate-500">
          Configure ad targeting, delivery rules, and placement for Join, Venue, Live Trivia, Speed Trivia, Bingo, Pick 'Em, and Fantasy pages.
        </p>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Upload Image (JPEG/PNG/WebP, max 300KB)
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading || saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void uploadImage(file);
            }}
            className="block w-full text-sm text-slate-600"
          />
          {uploading ? <p className="mt-1 text-xs text-slate-500">Uploading image...</p> : null}
          {imagePreview ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img src={imagePreview} alt="Ad preview" className="max-h-48 w-auto rounded" />
            </div>
          ) : null}
        </div>

        <AdFormFields
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setError("");
          }}
          venues={venues}
          disabled={saving || uploading || applyingPlaceholder}
          onApplyPlaceholderToAllInlineSlots={applyDraftAsInlinePlaceholderTemplate}
          applyingPlaceholderToAllInlineSlots={applyingPlaceholder}
          placeholderApplySummary={placeholderApplySummary}
        />

        <div className="mt-6">
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={saving || uploading || applyingPlaceholder}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Advertisement"}
          </button>
        </div>
      </div>
    </div>
  );
}
