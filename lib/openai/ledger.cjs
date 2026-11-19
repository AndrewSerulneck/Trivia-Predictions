/* The cost ledger for OpenAI question checks (Phase 4f.2): one llm_usage_logs row per model per run (a nightly game,
 * a Keep Queue run, one Admin save), not one per call, so the ledger stays small. The budgets still cap every call;
 * this only records what was spent. Never throws: a ledger failure must not fail the work it records.
 */
const FEATURES = Object.freeze([
  'speed_question_checks', // Speed repeat check + ungraded bar test (nightly, Keep Queue, Admin)
  'live_question_checks', // Live repeat check + ungraded bar test (nightly)
  'question_tagging', // a subject tag for one Speed question (Admin, Quick Keep, Keep Queue)
  'live_trivia_rewrite', // Admin "Convert to Live export"
]);

/** Rows for a budget summary's byModel ({ model: { calls, inputTokens, outputTokens, dollars } }). */
const rowsFor = ({ feature, byModel, metadata = null }) => Object.entries(byModel ?? {})
  .filter(([, entry]) => entry && entry.calls > 0)
  .map(([model, entry]) => ({
    provider: 'openai', model, feature,
    input_tokens: Math.max(0, Math.round(entry.inputTokens)), output_tokens: Math.max(0, Math.round(entry.outputTokens)),
    cost_cents: Number((Math.max(0, entry.dollars) * 100).toFixed(4)),
    metadata: { ...(metadata ?? {}), calls: entry.calls },
  }));

/** Write the rows with a service-role client. Returns how many were written (0 on any failure). */
const recordUsage = async (client, { feature, byModel, metadata }) => {
  if (!FEATURES.includes(feature)) return 0;
  const rows = rowsFor({ feature, byModel, metadata });
  if (!rows.length || typeof client?.from !== 'function') return 0;
  try {
    const { error } = await client.from('llm_usage_logs').insert(rows);
    if (error) { console.warn('OpenAI cost ledger: not written.'); return 0; }
    return rows.length;
  } catch {
    console.warn('OpenAI cost ledger: not written.');
    return 0;
  }
};

/** Record a runtime.createBudget() budget's spend. */
const recordBudget = (client, { feature, budget, metadata }) => {
  let byModel = null;
  try { byModel = budget?.summary?.().byModel ?? null; } catch { byModel = null; }
  return recordUsage(client, { feature, byModel, metadata });
};

module.exports = { FEATURES, rowsFor, recordUsage, recordBudget };
