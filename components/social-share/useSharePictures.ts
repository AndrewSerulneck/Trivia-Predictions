"use client";

import { useEffect, useRef, useState } from "react";
import { celebrationEffectsKey, normalizeCelebrationEffects, type CelebrationEffect } from "@/lib/socialShare/celebrationEffects";
import { buildShareDesignSpec, readyMadeDesignsFor, type StoryShareDesign, type StoryShareSize } from "@/lib/socialShare/shareDesigns";
import { webStoryPlatform } from "@/lib/socialShare/platform/webStoryPlatform";
import { prepareStorySharePayload, type PreparedStorySharePayload } from "@/lib/socialShare/storyPayloads";

/** One drawn picture; `effectsKey` says which celebration effects it was drawn with. */
export type SharePicture = { blob: Blob; url: string; effectsKey: string };

type PicturesState = {
  key: PreparedStorySharePayload | null;
  size: StoryShareSize | null;
  pictures: Partial<Record<StoryShareDesign, SharePicture>>;
  failed: boolean;
};

const EMPTY: PicturesState = { key: null, size: null, pictures: {}, failed: false };

/**
 * The ready-made pictures for one win at one size, drawn on the phone (no request, no
 * storage). The selected design is drawn first; the thumbnails ARE the pictures that get
 * shared, so nothing is drawn twice. Object URLs are released when the size or win changes
 * and when the sheet closes.
 *
 * Switching a celebration effect redraws them (the effects are part of the key), but the old
 * picture stays on screen until its replacement lands, so a tap doesn't flash an empty frame.
 * A picture whose `effectsKey` isn't the current one is only for show: the sheet never shares it.
 */
export const useSharePictures = (
  preparedStory: PreparedStorySharePayload,
  size: StoryShareSize,
  first: StoryShareDesign,
  active: boolean,
  effects: readonly CelebrationEffect[] = []
) => {
  const [state, setState] = useState<PicturesState>(EMPTY);
  // The URLs the state holds, kept in step with it, so each is released exactly once.
  const urlsRef = useRef(new Map<StoryShareDesign, string>());
  const effectsKey = celebrationEffectsKey(effects);

  // A new win or size, or a closed sheet: release every picture (Phase 9f.3, R6).
  useEffect(() => {
    if (!active) return;
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      // The state held those URLs: drop them with the pictures, or coming back to the same win and
      // size would hand out released `blob:` addresses.
      setState(EMPTY);
    };
  }, [active, preparedStory, size]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const chosen = normalizeCelebrationEffects(effectsKey.split("+"));
    const prepared = prepareStorySharePayload(preparedStory.payload, { templateVariant: preparedStory.templateVariant, size });
    const designs = readyMadeDesignsFor(prepared);
    const order = [first, ...designs.filter((design) => design !== first)].filter((design) => designs.includes(design));

    void (async () => {
      for (const design of order) {
        try {
          const blob = await webStoryPlatform.renderDesign(buildShareDesignSpec(prepared, design, size, { effects: chosen }));
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          const replaced = urlsRef.current.get(design);
          urlsRef.current.set(design, url);
          setState((current) => {
            const base = current.key === preparedStory && current.size === size ? current : { ...EMPTY, key: preparedStory, size };
            return { ...base, pictures: { ...base.pictures, [design]: { blob, url, effectsKey } } };
          });
          // An <img> already showing it keeps its decoded picture until the new one loads.
          if (replaced) URL.revokeObjectURL(replaced);
        } catch {
          if (cancelled) return;
          setState((current) => ({ ...(current.key === preparedStory && current.size === size ? current : { ...EMPTY, key: preparedStory, size }), failed: true }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `first` only orders the first draw; changing the selection must not redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, preparedStory, size, effectsKey]);

  const current = active && state.key === preparedStory && state.size === size ? state : EMPTY;
  return { designs: readyMadeDesignsFor(preparedStory), pictures: current.pictures, failed: current.failed };
};
