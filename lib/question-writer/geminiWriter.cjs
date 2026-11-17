/* Gemini fallback writer (D13, docs/speed-trivia-backlog-and-quality-plan.md Phase 4b step 5). Used only when the
 * day has no ChatGPT batch. Same brief, rules and gates; capped at $0.10 per game per day.
 * Current Events slots are skipped: they need live web search, and Gemini 2.5 Flash without it would write from
 * stale knowledge (paid search grounding is not in the approved cost). Output is DATA, validated by parsePost.
 */
const { RATES } = require('../speed-trivia-uniqueness/gemini.cjs');
const { createBudget } = require('../speed-trivia-uniqueness/runtime.cjs');

const FALLBACK_MODEL = 'gemini-2.5-flash';
const FALLBACK_MAX_DOLLARS = 0.10; // per game per day (D13); a lower cap may be passed, never a higher one
const MAX_OUTPUT_TOKENS = 6144;

// Gemini's OpenAPI-subset schema for the same shape as rules.SPEED_OUTPUT_SCHEMA.
const GEMINI_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          slot: { type: 'INTEGER' },
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctIndex: { type: 'INTEGER' },
          category: { type: 'STRING' },
          area: { type: 'STRING', nullable: true },
          era: { type: 'STRING', nullable: true },
          subject: { type: 'STRING' },
          difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
          sourceUrl: { type: 'STRING', nullable: true },
          whyTrue: { type: 'STRING' },
        },
        required: ['slot', 'question', 'options', 'correctIndex', 'category', 'subject', 'difficulty', 'whyTrue'],
      },
    },
  },
  required: ['items'],
});

// The same for rules.LIVE_OUTPUT_SCHEMA (Phase 4c).
const GEMINI_LIVE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          slot: { type: 'INTEGER' },
          question: { type: 'STRING' },
          answer: { type: 'STRING' },
          acceptableAnswers: { type: 'ARRAY', items: { type: 'STRING' } },
          answerIsPerson: { type: 'BOOLEAN' },
          category: { type: 'STRING' },
          area: { type: 'STRING', nullable: true },
          era: { type: 'STRING', nullable: true },
          subject: { type: 'STRING' },
          difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
          sourceUrl: { type: 'STRING', nullable: true },
          whyTrue: { type: 'STRING' },
        },
        required: ['slot', 'question', 'answer', 'acceptableAnswers', 'answerIsPerson', 'category', 'subject', 'difficulty', 'whyTrue'],
      },
    },
  },
  required: ['items'],
});

/** Write the brief's regular slots with Gemini. Returns { items:[{slot, payload}], dollars, skipped }. */
const writeWithGemini = async ({ brief, apiKey, model = FALLBACK_MODEL, maxDollars = FALLBACK_MAX_DOLLARS, transport = fetch }) => {
  if (!apiKey) throw new Error('missing-GEMINI_API_KEY');
  const rate = RATES[model];
  if (!rate) throw new Error('fallback-model-not-priced');
  const budget = createBudget({ dollars: Math.min(Number(maxDollars) || 0, FALLBACK_MAX_DOLLARS), elapsedMs: 180_000 });
  const items = [];
  const skipped = [];
  for (const prompt of brief.prompts) {
    if (prompt.webSearch) { skipped.push(prompt.kind); continue; }
    const inputCeiling = Buffer.byteLength(prompt.prompt) + 4096;
    const reservation = budget.reserve({
      dollars: (inputCeiling * rate.input + MAX_OUTPUT_TOKENS * rate.output) / 1e6,
      inputTokens: inputCeiling, outputTokens: MAX_OUTPUT_TOKENS, requests: 1,
    });
    const response = await transport(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt.prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json', responseSchema: brief.game === 'live' ? GEMINI_LIVE_SCHEMA : GEMINI_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(`fallback-http-${response.status}`);
    const usage = data.usageMetadata;
    if (!Number.isSafeInteger(usage?.promptTokenCount) || !Number.isSafeInteger(usage?.candidatesTokenCount)) throw new Error('fallback-usage-missing');
    const out = usage.candidatesTokenCount + (usage.thoughtsTokenCount || 0);
    budget.settle(reservation, { dollars: (usage.promptTokenCount * rate.input + out * rate.output) / 1e6, inputTokens: usage.promptTokenCount, outputTokens: out });
    if (data.candidates?.[0]?.finishReason !== 'STOP') throw new Error('fallback-truncated-or-blocked');
    let parsed;
    try { parsed = JSON.parse((data.candidates[0].content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('')); }
    catch { throw new Error('fallback-json-invalid'); }
    const bySlot = new Map(prompt.slots.map(slot => [slot.n, slot]));
    for (const payload of Array.isArray(parsed?.items) ? parsed.items : []) {
      const slot = bySlot.get(payload?.slot);
      if (slot) items.push({ slot, payload: { area: null, era: null, sourceUrl: null, ...payload } });
    }
  }
  return { items, dollars: budget.summary().dollars, skipped };
};

module.exports = { FALLBACK_MODEL, FALLBACK_MAX_DOLLARS, GEMINI_SCHEMA, GEMINI_LIVE_SCHEMA, writeWithGemini };
