"use client";

import { useEffect, useState } from "react";
import { buildShareDesignSpec, readyMadeDesignsFor, type StoryShareDesign, type StoryShareSize } from "@/lib/socialShare/shareDesigns";
import { webStoryPlatform } from "@/lib/socialShare/platform/webStoryPlatform";
import { prepareStorySharePayload, type PreparedStorySharePayload } from "@/lib/socialShare/storyPayloads";

export type SharePicture = { blob: Blob; url: string };

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
 */
export const useSharePictures = (
  preparedStory: PreparedStorySharePayload,
  size: StoryShareSize,
  first: StoryShareDesign,
  active: boolean
) => {
  const [state, setState] = useState<PicturesState>(EMPTY);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const created: string[] = [];
    const prepared = prepareStorySharePayload(preparedStory.payload, { templateVariant: preparedStory.templateVariant, size });
    const designs = readyMadeDesignsFor(prepared);
    const order = [first, ...designs.filter((design) => design !== first)].filter((design) => designs.includes(design));

    void (async () => {
      for (const design of order) {
        try {
          const blob = await webStoryPlatform.renderDesign(buildShareDesignSpec(prepared, design, size));
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setState((current) => {
            const base = current.key === preparedStory && current.size === size ? current : { ...EMPTY, key: preparedStory, size };
            return { ...base, pictures: { ...base.pictures, [design]: { blob, url } } };
          });
        } catch {
          if (cancelled) return;
          setState((current) => ({ ...(current.key === preparedStory && current.size === size ? current : { ...EMPTY, key: preparedStory, size }), failed: true }));
        }
      }
    })();

    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
    // `first` only orders the first draw; changing the selection must not redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, preparedStory, size]);

  const current = active && state.key === preparedStory && state.size === size ? state : EMPTY;
  return { designs: readyMadeDesignsFor(preparedStory), pictures: current.pictures, failed: current.failed };
};
