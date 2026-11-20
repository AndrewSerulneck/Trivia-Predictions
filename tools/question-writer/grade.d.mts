// Types for grade.mjs (Phase 7h, R2 #25.10), so the main repo's tests import it without a cast.
export type WriterSlot = { n: number; [key: string]: unknown };
export type Written = { slot: WriterSlot; payload: Record<string, unknown>; grade?: Record<string, unknown> };
export type CodexResult = { output: unknown; tokens: number | null };
export type CodexCall = { prompt: string; schema: unknown; webSearch?: boolean; model: string; effort: string; timeoutMs?: number;
  spawnImpl?: (command: string, args: string[], options: unknown) => unknown };

export const CODEX_TIMEOUT_MS: number;
export function isLoginFailure(output: string): boolean;
export function runCodex(call: CodexCall): Promise<CodexResult>;
export function writtenItems(output: unknown, slots: WriterSlot[], seen?: Set<number>): { written: Written[]; dropped: number };
export function gradeItems(items: Written[], fields: string[]): Record<string, unknown>[];
export function attachGrades(items: Written[], output: unknown, version: string): number;
export function tokensUsed(stderr: string): number | null;
export type Rewrite = Written & { requestId: string };
export type Decline = { requestId: string; reason: string };
export function conversionItems(output: unknown, conversions: { n: number; requestId: string }[]): { rewrites: Rewrite[]; declines: Decline[] };
export function conversionPost(found: { rewrites: Rewrite[]; declines: Decline[] }): Record<string, unknown>[];
