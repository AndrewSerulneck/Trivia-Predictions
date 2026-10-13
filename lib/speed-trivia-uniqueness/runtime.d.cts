import type { AdmissionBudget, AdmissionClient, AdmissionSession, SessionOptions } from "@/types/speedTriviaAdmission";
import type { AdmissionEvidence } from "@/types/speedTriviaUniqueness";
export class AdmissionError extends Error { code: string; evidence: AdmissionEvidence | null; constructor(code: string, message: string, evidence?: AdmissionEvidence | null); }
export function createBudget(options?: { dollars?: number; inputTokens?: number; outputTokens?: number; requests?: number; candidates?: number; retries?: number; elapsedMs?: number; now?: () => number }): AdmissionBudget;
export function createSession(options: SessionOptions): Promise<AdmissionSession>;
export function rpc(client: AdmissionClient, name: string, args?: Record<string, unknown>): Promise<unknown>;
export function speed(row: { question_pool?: unknown } | null): boolean;
export function stateHash(row: unknown): string;
export function canonicalText(value: unknown): string;
export function sign(secret: string, envelope: unknown): string;
export function signText(secret: string, text: string): string;
