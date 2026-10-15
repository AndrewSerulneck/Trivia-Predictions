export type SubjectSpan = { source: "question" | "answer" | "image"; start: number; end: number; text: string; role: string };
export type PrimarySubject = { key: string; kind: "person" | "group" | "work"; name: string; spans: SubjectSpan[]; creators: string[] };
export type SubjectEvidence = {
  policyVersion: string; classifierVersion: string; registryVersion: string; contentHash: string;
  coverage: "identified" | "generic" | "unknown"; subjects: PrimarySubject[]; unresolved: string[];
  history?: { key: string; introducedAt: string; source: string }[];
};
export type SubjectProposal = { kind: "person" | "group" | "work"; name: string; source: "question" | "answer"; start: number; end: number };
export type SelectionInfo = {
  requested: number; returned: number;
  reason: "insufficient_subject_variety" | "bounded_selection_shortfall" | null;
  coverage: { identified: number; generic: number; unknown: number }; explored: number;
};
