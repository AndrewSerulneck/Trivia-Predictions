/* The fact rules (D26, docs/speed-trivia-backlog-and-quality-plan.md Phase 4a.2; Andrew's 4a.1 spot check, 2026-11-16).
 * One home for the rules the subject cleanup, the question writer and the bar test all use. Pure data: no I/O.
 *
 *   1. One fact, one question: a fact counts once, however it's worded (Beethoven's deafness, the koala's fingerprints).
 *   2. LIVE TRIVIA ONLY (Andrew, 2026-11-16): ask what the subject is famous for: the FACT must be widely known, not
 *      just the subject (a chameleon changes color; its tongue and eyes are obscure). Live is write-in: players must
 *      RECALL the answer. Speed Trivia is multiple choice: the answer is on screen and players can RECOGNIZE it or
 *      guess, so a Speed question can be much harder, but it must still be knowable: a recognizable subject and a
 *      fairly common fact, never specialist-only (known 2+ of 5 in the cleanup; Live needs 3+).
 *   3. Spread first: a subject's questions should need different kinds of knowledge (the Nile: "longest river in
 *      Africa" is geography, "the river of ancient Egypt" is history). A second fact of the same kind comes only after
 *      every kind the subject has, and only if it is also widely known (koala: diet, pouch and fingerprints).
 *   4. Five per subject is a ceiling, not a target.
 */

const FACT_RULES_VERSION = 'fact-rules-v2';
const CEILING = 5;

// The kinds of knowledge (rule 3). Order is only for display.
const KINDS = Object.freeze(['geography', 'history', 'science_nature', 'culture', 'sports', 'people', 'words_names', 'other']);
const KIND_HELP = 'geography = places, maps, borders; history = past events and eras; science_nature = how nature, the body, '
  + 'space or technology works; culture = films, TV, music, books, art, games; sports = teams, players, records; '
  + "people = a person's life, family, job or nationality; words_names = names, nicknames, words, symbols, brands; other = none of these";

const RULE_ONE_FACT = 'One fact, one question: two questions that need the same piece of knowledge test the same fact, however differently they are worded.';
// Andrew, 2026-11-16: the difference between the two games. Every Speed/Live rule that judges difficulty starts here.
const RECALL_VS_RECOGNITION = 'Speed Trivia is multiple choice: the answer is on screen, so players can recognize it or make an educated guess, and a question can be much harder than a write-in. It must still be knowable for the average American: a subject they recognize and a fact that is fairly common knowledge, never specialist-only. Live Trivia is write-in: players must recall the answer with no options, so it must be easier and the fact itself must be widely known.';
// Speed (multiple choice): a lower bar than Live, not no bar (Andrew, 2026-11-16).
const RULE_SPEED_FACT = 'Multiple choice: the answer is on screen, so the question can be much harder than a write-in, but it must still be knowable for the average American: a subject they recognize, and a fact that is fairly common knowledge or that a casual fan could reason out from the options. Never a specialist-only fact. Make it hard with close, plausible wrong options, never with an obscure subject.';
// Live only (rule 2).
const RULE_KNOWN_FACT = 'Ask what the subject is famous for: most of the crowd must know the FACT before they hear the question, not just the subject. A famous subject does not make an obscure fact about it fair game (everyone knows a chameleon changes color; few know how its tongue or eyes work).';
const RULE_KINDS = `Spread a subject's questions across different kinds of knowledge (the Nile: "longest river in Africa" is geography, "the river of ancient Egypt" is history); a second fact of the same kind only if it is also widely known. Kinds: ${KIND_HELP}.`;
const RULE_CEILING = `${CEILING} questions per subject is a ceiling, not a target: most subjects have only one or two facts worth asking.`;
const FACT_RULES = Object.freeze({
  speed: Object.freeze([RULE_ONE_FACT, RULE_SPEED_FACT, RULE_KINDS, RULE_CEILING]),
  live: Object.freeze([RULE_ONE_FACT, RULE_KNOWN_FACT, RULE_KINDS, RULE_CEILING]),
});

module.exports = { FACT_RULES_VERSION, CEILING, KINDS, KIND_HELP, RECALL_VS_RECOGNITION, RULE_ONE_FACT, RULE_SPEED_FACT,
  RULE_KNOWN_FACT, RULE_KINDS, RULE_CEILING, FACT_RULES };
