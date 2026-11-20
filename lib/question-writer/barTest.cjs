/* The nightly bar test, shared by Speed (process.cjs) and Live (liveProcess.cjs) (Phase 7h, R2 #25.7):
 * the writer's ChatGPT grade when it sent a valid one for the game's current prompt version (D35), else one OpenAI API
 * call for the rest (4f.2), inside the night's approved dollars.
 */

/**
 * scoreBarTest({ items, audience, scoreUngraded }) -> { audiences, graded: { chatgpt, openai } }.
 * - items: [{ id, grade, row, apiRow }]: `grade` is the raw `payload.grade`, `row` what `audienceFromWriter` scores,
 *   `apiRow` what the API scorer gets (its `id` must equal the item's `id`).
 * - audience: the game's module ({ writerGrade, audienceFromWriter }).
 * - scoreUngraded(apiRows) -> [{ id, audience }]: called once, only when some item has no valid writer grade.
 * `audiences` follows `items`' order. Throws 'bar-test-result-missing' if any item ends up without a score.
 */
const scoreBarTest = async ({ items, audience, scoreUngraded }) => {
  const byId = new Map();
  const ungraded = [];
  for (const item of items) {
    const grade = audience.writerGrade(item.grade);
    if (grade) byId.set(item.id, audience.audienceFromWriter(item.row, grade));
    else ungraded.push(item);
  }
  if (ungraded.length) {
    for (const s of await scoreUngraded(ungraded.map(item => item.apiRow))) byId.set(s.id, s.audience);
  }
  const audiences = items.map(item => {
    const result = byId.get(item.id);
    if (!result) throw new Error('bar-test-result-missing');
    return result;
  });
  return { audiences, graded: { chatgpt: items.length - ungraded.length, openai: ungraded.length } };
};

module.exports = { scoreBarTest };
