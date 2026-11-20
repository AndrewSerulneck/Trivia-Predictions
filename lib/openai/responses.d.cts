export const ENDPOINT: string;
export const RATES: Readonly<Record<string, Readonly<{ input: number; output: number }>>>;
export const EFFORT: Readonly<Record<string, string | null>>;
export const MIN_ATTEMPT_MS: number;
export function rateFor(model: string): { input: number; output: number };
export function priceOf(model: string, inputTokens: number, outputTokens: number): number;
export function claimFor(input: { model: string; prompt: string; maxOutputTokens: number; slack?: number }): { dollars: number; inputTokens: number; outputTokens: number; requests: number };
export type OpenAIUsage = { inputTokens: number; outputTokens: number; reasoningTokens: number; dollars: number };
export type OpenAIReply = { usage: OpenAIUsage; model: string; complete: boolean; text: string };
export function callJson(input: {
  model: string; apiKey: string | null | undefined; prompt: string; schema: Record<string, unknown>; name?: string;
  maxOutputTokens: number; timeoutMs?: number; transport?: typeof fetch; signal?: AbortSignal;
  retries?: number; sleep?: (ms: number) => Promise<void>;
  /** Phase 7e: total milliseconds for the call, across attempts and retry waits. */
  deadlineMs?: number; now?: () => number;
}): Promise<OpenAIReply>;
export function jsonOf(reply: OpenAIReply, prefix: string): unknown;
