// Helpers for write.mjs (private repo; docs/speed-trivia-backlog-and-quality-plan.md Phase 4d.1 in the main repo).
// Pure functions, no dependencies, so the main repo's tests can import them.

/**
 * The questions sent to the grader: { n, ...the brief's fields } per written item. For multiple choice, `answer` is
 * the marked option. Nulls are left out (regular questions have no sourceUrl).
 */
export const gradeItems = (items, fields) => items.map(({ slot, payload }) => {
  const source = { ...payload };
  if (Array.isArray(payload.options) && Number.isInteger(payload.correctIndex)) source.answer = payload.options[payload.correctIndex];
  const item = { n: slot.n };
  for (const field of fields) if (source[field] != null) item[field] = source[field];
  return item;
});

/**
 * Puts each grade on its item ({ version, familiar, fun, estCorrect, flags }), matched by slot number. Returns how
 * many items got one. The site re-checks every grade; an item without one is graded by Gemini.
 */
export const attachGrades = (items, output, version) => {
  const bySlot = new Map();
  for (const grade of Array.isArray(output?.grades) ? output.grades : []) {
    if (Number.isInteger(grade?.n) && !bySlot.has(grade.n)) bySlot.set(grade.n, grade);
  }
  let graded = 0;
  for (const item of items) {
    const grade = bySlot.get(item.slot.n);
    if (!grade) continue;
    item.grade = { version, familiar: grade.familiar, fun: grade.fun, estCorrect: grade.estCorrect, flags: grade.flags };
    graded++;
  }
  return graded;
};

/** codex prints "tokens used\n12,345" on stderr, after the answer; null when absent. */
export const tokensUsed = (stderr) => {
  const match = /tokens used\s+([\d,]+)/i.exec(stderr);
  return match ? Number(match[1].replace(/,/g, "")) || null : null;
};

const CONVERSION_FIELDS = ["question", "answer", "acceptableAnswers", "answerIsPerson", "category", "area", "era", "subject",
  "difficulty", "sourceUrl", "whyTrue"];

/**
 * Phase 4e (D37): the conversion prompt's answers, matched to their requests by n (`conversions` = the brief's
 * [{ n, requestId }]). Returns { rewrites: [{ slot:{n}, requestId, payload }], declines: [{ requestId, reason }] }.
 * Unknown or repeated n are dropped. The site re-validates everything.
 */
export const conversionItems = (output, conversions) => {
  const byN = new Map((Array.isArray(conversions) ? conversions : []).map((c) => [c.n, c.requestId]));
  const done = new Set();
  const rewrites = [];
  const declines = [];
  for (const item of Array.isArray(output?.items) ? output.items : []) {
    const requestId = byN.get(item?.n);
    if (!requestId || done.has(item.n)) continue;
    done.add(item.n);
    if (item.declined === true) { declines.push({ requestId, reason: typeof item.reason === "string" ? item.reason : "" }); continue; }
    const payload = {};
    for (const field of CONVERSION_FIELDS) payload[field] = item[field] ?? null;
    rewrites.push({ slot: { n: item.n }, requestId, payload });
  }
  return { rewrites, declines };
};

/** The conversions post body's items: rewrites (with any grade) and declines. */
export const conversionPost = ({ rewrites, declines }) => [
  ...rewrites.map(({ requestId, payload, grade }) => ({ requestId, payload, ...(grade ? { grade } : {}) })),
  ...declines.map(({ requestId, reason }) => ({ requestId, declined: true, reason })),
];
