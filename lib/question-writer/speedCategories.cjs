/* The Speed Trivia categories the writer uses: the player categories (lib/triviaCategories.ts dbValues), never database
 * inventory (standing rule, docs/speed-trivia-backlog-and-quality-plan.md §7). Moved here from the deleted Gemini
 * generator (Phase 4f.1, D40). Tripwire: tests/speed-trivia-generator-categories-contract.test.ts.
 */
const SPEED_CATEGORIES = Object.freeze([
  'Animals', 'General Knowledge', 'Geography', 'History', 'Music', 'Pop Culture', 'Science', 'Sports', 'Current Events',
]);
// Dated categories need a month and year in the wording, a source URL and an expiry (D16).
const DATED_CATEGORIES = Object.freeze(['Current Events']);

module.exports = { SPEED_CATEGORIES, DATED_CATEGORIES };
