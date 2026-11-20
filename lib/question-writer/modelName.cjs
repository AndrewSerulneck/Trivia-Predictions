/* The writer's model-name rule (Phase 7h, R2 #25.9): one home for the regex that `candidates.cjs` (the post's model
 * labels) and `speed-trivia-quality/audience.cjs` (the grader model on a writer grade) both use. Its own module because
 * audience.cjs can't require candidates.cjs (candidates.cjs requires audience.cjs).
 */
const MODEL_NAME = /^[A-Za-z0-9._:-]{1,80}$/;

/** The model name as reported, or null when absent or malformed (it is only a label). */
const cleanModel = value => (typeof value === 'string' && MODEL_NAME.test(value) ? value : null);

module.exports = { MODEL_NAME, cleanModel };
