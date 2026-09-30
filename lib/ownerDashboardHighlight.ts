// Which dashboard row to ring after a save (plan §4d: "the new row gets a
// 2-second cyan ring"). The save routes return no id for a new row, so the row
// is found by diffing the refetched list against the ids known before the save;
// an edit already knows its id.

export type PendingHighlight<L> = {
  /** The list as it was when the change was made; the refetch is the first list that is not this object. */
  baseline: L;
  knownIds: ReadonlySet<string>;
  /** Set up front for an edit. */
  id: string | null;
};

export type HighlightLoad = { status: "loading" } | { status: "error" } | { status: "ready"; items: { id: string }[] };

export type HighlightResolution = { resolved: false } | { resolved: true; id: string | null };

/** `resolved: false` = keep waiting (same list, or still loading / failed). */
export const resolvePendingHighlight = <L extends HighlightLoad>(
  pending: PendingHighlight<L>,
  current: L,
): HighlightResolution => {
  if (current === pending.baseline || current.status !== "ready") return { resolved: false };
  const id = pending.id ?? current.items.find((item) => !pending.knownIds.has(item.id))?.id ?? null;
  return { resolved: true, id };
};

export const knownItemIds = (load: HighlightLoad): ReadonlySet<string> =>
  new Set(load.status === "ready" ? load.items.map((item) => item.id) : []);
