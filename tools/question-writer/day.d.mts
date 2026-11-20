// Types for day.mjs (Phase 7h), for the main repo's tests.
export const LOGIN_MESSAGE: string;
export type ApiReply = { status: number; body: Record<string, unknown> & { ok?: boolean; code?: string } };
export function writeDay(input: {
  games: string[];
  api: (route: string, init?: { method?: string; body?: string }) => Promise<ApiReply>;
  codex: (call: { prompt: string; schema: unknown; webSearch?: boolean; effort?: string }) => Promise<{ output: unknown; tokens: number | null }>;
  model: string;
  gradeEffort: string;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}): Promise<{ failed: boolean; login: boolean }>;
