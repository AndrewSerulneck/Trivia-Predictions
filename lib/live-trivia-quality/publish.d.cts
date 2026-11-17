export declare class PublishError extends Error {
  code: string;
  constructor(code: string, message: string);
}
export type PublishCandidate = {
  id: string;
  payload: Record<string, unknown>;
  edit?: { answer?: string; acceptableAnswers?: string[] } | null;
  tag?: { area?: string | null; expiresOn?: string } | null;
};
export type PublishChange = { path: string; content: string; created: boolean; added: number };
export declare function parseLiveFile(text: string, path?: string): { categoryName?: string; questions: Record<string, unknown>[] };
export declare function appendEntries(text: string, entries: Record<string, unknown>[], path?: string): string;
export declare function newCategoryFile(categoryName: string, entries: Record<string, unknown>[]): string;
export declare function buildEntry(candidate: PublishCandidate, slug: string, today?: Date | string): Record<string, unknown>;
export declare function freshSlug(question: string, taken: Set<string>): string;
export declare function planPublish(input: {
  files: Map<string, string | null>;
  candidates: PublishCandidate[];
  reserved?: ReadonlySet<string>;
  today?: Date | string;
}): {
  changes: PublishChange[];
  published: { id: string; slug: string }[];
  already: { id: string; slug: string }[];
  refused: { id: string; reason: string }[];
};
