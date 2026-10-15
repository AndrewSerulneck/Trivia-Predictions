import type { TriviaQuestion } from "@/types";
import type { SelectionInfo, SubjectEvidence } from "@/types/speedTriviaVariety";
import { extract } from "@/lib/speed-trivia-uniqueness/subjects.cjs";

// Hard CPU ceiling: at most 12,000 search nodes in the already-read pool.
// Input order is randomized by the caller; there are no database/provider calls.
export const SELECTION_NODE_LIMIT = 12000;
const cache = new Map<string, SubjectEvidence>();
const classify = (question: TriviaQuestion): SubjectEvidence => {
  const signature = JSON.stringify([question.question, question.options[question.correctAnswer], question.category]);
  const prior = cache.get(signature);
  if (prior) return prior;
  const evidence = extract({ ...question, correct_answer: question.correctAnswer, category: question.category || "General Knowledge", status: "active", question_pool: "anytime_blitz", answer_format: "multiple_choice" });
  if (cache.size >= 10000) cache.clear();
  cache.set(signature, evidence);
  return evidence;
};

export const selectVariedTrivia = (questions: TriviaQuestion[], requested: number, answered = new Set<string>()): { questions: TriviaQuestion[]; selection: SelectionInfo } => {
  const limit = Math.max(1, Math.min(100, Math.floor(requested) || 15));
  const candidates = [...new Map(questions.map(question => [question.id, question])).values()].map(question => ({ question, evidence: classify(question), seen: answered.has(question.id) }));
  const keys = candidates.map(candidate => candidate.evidence.subjects.map(subject => subject.key));
  const categories = candidates.map(candidate => candidate.question.category || "uncategorized");
  let explored = 0, exhausted = false, alternativesTruncated = false;
  const unseenAlternatives: number[][] = [];
  // Greedy balanced choices establish a lower bound. Bounded reconsideration
  // explores conflicting multi-subject choices within each tier, preserving
  // the maximum unseen prefix before any seen rows can fill spare slots.
  const searchTier = (pool: number[], target: number, reserved: Set<string>, counts: Map<string, number>, collectAlternatives = false): number[] => {
    let best: number[] = [];
    const visit = (remaining: number[], picked: number[], used: Set<string>, balance: Map<string, number>): boolean => {
      if (++explored > SELECTION_NODE_LIMIT) { exhausted = true; return false; }
      if (picked.length > best.length) { best = [...picked]; if (collectAlternatives) unseenAlternatives.length = 0; }
      if (collectAlternatives && picked.length === best.length) {
        if (unseenAlternatives.length < 128) unseenAlternatives.push([...picked]); else alternativesTruncated = true;
      }
      if (picked.length >= target) return true;
      const compatible = remaining.filter(index => keys[index].every(key => !used.has(key)));
      if (picked.length + compatible.length < best.length) return false;
      const min = Math.min(...compatible.map(index => balance.get(categories[index]) || 0));
      const allKeys = compatible.flatMap(index => keys[index]);
      if (compatible.length + picked.length <= target && new Set(allKeys).size === allKeys.length) {
        const rest = [...compatible].sort((a, b) => (balance.get(categories[a]) || 0) - (balance.get(categories[b]) || 0));
        const completed = [...picked, ...rest];
        if (completed.length > best.length) { best = completed; if (collectAlternatives) { unseenAlternatives.length = 0; unseenAlternatives.push(completed); } }
        return completed.length === target;
      }
      const equivalent = new Set<string>();
      const eligible = compatible.filter(index => {
        if ((balance.get(categories[index]) || 0) !== min) return false;
        if (!keys[index].length) return true;
        const signature = categories[index] + ":" + [...keys[index]].sort().join("|");
        if (equivalent.has(signature)) return false;
        equivalent.add(signature); return true;
      });
      // Try every option in the least represented compatible categories. A
      // failed choice can be skipped; the node budget bounds adversarial pools.
      for (const index of eligible) {
        if (exhausted) break;
        const nextUsed = new Set(used); keys[index].forEach(key => nextUsed.add(key));
        const nextCounts = new Map(balance); nextCounts.set(categories[index], (nextCounts.get(categories[index]) || 0) + 1);
        if (visit(compatible.filter(other => other !== index), [...picked, index], nextUsed, nextCounts)) return true;
      }
      return false;
    };
    visit(pool, [], reserved, counts);
    return best;
  };
  const unseen = candidates.map((candidate, index) => candidate.seen ? -1 : index).filter(index => index >= 0);
  const seen = candidates.map((candidate, index) => candidate.seen ? index : -1).filter(index => index >= 0);
  const maximumUnseen = searchTier(unseen, limit, new Set<string>(), new Map<string, number>(), true);
  let selected = maximumUnseen;
  if (selected.length < limit && !exhausted) {
    for (const alternative of [maximumUnseen, ...unseenAlternatives].filter(choice => choice.length === maximumUnseen.length)) {
      const counts = new Map<string, number>(), reserved = new Set<string>();
      for (const index of alternative) { keys[index].forEach(key => reserved.add(key)); counts.set(categories[index], (counts.get(categories[index]) || 0) + 1); }
      const fill = searchTier(seen, limit - alternative.length, reserved, counts);
      if (alternative.length + fill.length > selected.length) selected = [...alternative, ...fill];
      if (selected.length === limit || exhausted) break;
    }
  }
  const coverage = { identified: 0, generic: 0, unknown: 0 };
  for (const index of selected) coverage[candidates[index].evidence.coverage]++;
  return { questions: selected.map(index => candidates[index].question), selection: { requested: limit, returned: selected.length, reason: selected.length === limit ? null : exhausted || alternativesTruncated ? "bounded_selection_shortfall" : "insufficient_subject_variety", coverage, explored: Math.min(explored, SELECTION_NODE_LIMIT) } };
};
