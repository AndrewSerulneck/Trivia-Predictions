import "server-only";
import { getAnswerVariants } from "@/lib/triviaAnswerVariants";

function isStandaloneNumber(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value);
}

const WORD_TO_NUMBER = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
  ["hundred", 100],
]);

const UNIT_WORDS = new Set([
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
]);

// COUNTRY_ALIASES maps canonical country names to their known aliases.
// Format: "canonical name" → ["alias1", "alias2", ...]
// 
// The canonical name should be the modern/current official name.
// Aliases include: historical names, abbreviations, alternative spellings.
// 
// When adding new entries:
// 1. Choose a single canonical name (prefer modern/current name)
// 2. List all known abbreviations and historical names
// 3. Ensure no overlapping aliases across different countries
// 4. Add test cases for the new aliases
const COUNTRY_ALIASES = new Map<string, string[]>([
  ["great britain", ["uk", "u.k.", "u k", "united kingdom", "britain"]],
  ["united kingdom", ["uk", "u.k.", "u k", "great britain", "britain"]],
  ["united states", ["us", "u.s.", "u s", "usa", "u.s.a.", "u s a", "america", "united states of america"]],
  ["russia", ["ussr", "u.s.s.r.", "soviet union", "russian federation"]],
  ["iran", ["persia"]],
  ["thailand", ["siam"]],
  ["ireland", ["republic of ireland", "irish republic", "eire"]],
  ["france", ["french republic"]],
  ["germany", ["west germany", "east germany", "deutsch", "deutschland"]],
  ["netherlands", ["holland", "dutch"]],
  ["south korea", ["korea", "republic of korea"]],
  ["north korea", ["dprk", "democratic peoples republic of korea"]],
  ["vietnam", ["french indochina", "french indo china"]],
  ["laos", ["french indochina", "french indo china"]],
  ["cambodia", ["french indochina", "french indo china", "kampuchea"]],
  ["sri lanka", ["ceylon"]],
  ["israel", ["palestine"]],
  ["turkey", ["ottoman empire", "ottoman"]],
  ["greece", ["hellas"]],
  ["china", ["peoples republic of china", "prc", "peoples republic of china", "chinese peoples republic"]],
  ["egypt", ["united arab republic"]],
  ["zimbabwe", ["rhodesia", "southern rhodesia"]],
  ["benin", ["dahomey"]],
  ["burkina faso", ["upper volta"]],
  ["congo", ["belgian congo", "zaire", "democratic republic of congo"]],
  ["tajikistan", ["tajik soviet socialist republic"]],
  ["kyrgyzstan", ["kirghiz soviet socialist republic"]],
  ["uzbekistan", ["uzbek soviet socialist republic"]],
  ["turkmenistan", ["turkmen soviet socialist republic"]],
  ["kazakhstan", ["kazakh soviet socialist republic"]],
  ["georgia", ["georgian soviet socialist republic", "soviet georgia"]],
  ["armenia", ["armenian soviet socialist republic", "soviet armenia"]],
  ["azerbaijan", ["azerbaijani soviet socialist republic", "soviet azerbaijan"]],
  ["ukraine", ["ukrainian soviet socialist republic", "soviet ukraine"]],
  ["belarus", ["byelorussian soviet socialist republic", "soviet belarus"]],
  ["moldova", ["moldavian soviet socialist republic", "soviet moldova"]],
  ["estonia", ["estonian soviet socialist republic", "soviet estonia"]],
  ["latvia", ["latvian soviet socialist republic", "soviet latvia"]],
  ["lithuania", ["lithuanian soviet socialist republic", "soviet lithuania"]],
  ["pakistan", ["islamic republic of pakistan"]],
  ["bangladesh", ["east pakistan"]],
  ["myanmar", ["burma"]],
  ["laos", ["french indochina"]],
]);

// HISTORICAL_TERM_ALIASES maps historical/geographic regions to modern countries
const HISTORICAL_TERM_ALIASES = new Map<string, string[]>([
  ["mesopotamia", ["iraq"]],
  ["indus valley", ["pakistan", "india"]],
  ["fertile crescent", ["iraq", "syria", "israel", "palestine", "lebanon"]],
  ["golconda", ["india"]],
  ["phoenicia", ["lebanon", "syria"]],
]);

// PERSON_NAME_ALIASES maps full names to common abbreviations and nicknames
const PERSON_NAME_ALIASES = new Map<string, string[]>([
  ["john f. kennedy", ["jfk", "j.f.k.", "john fitzgerald kennedy"]],
  ["franklin d. roosevelt", ["fdr", "f.d.r.", "franklin delano roosevelt"]],
  ["martin luther king", ["mlk", "m.l.k.", "martin luther king jr", "martin luther king junior"]],
  ["theodore roosevelt", ["teddy roosevelt", "ted roosevelt"]],
  ["thomas jefferson", ["t.j.", "tom jefferson"]],
  ["benjamin franklin", ["ben franklin"]],
  ["stephen curry", ["steph curry"]],
  ["alexander hamilton", ["hamilton"]],
  ["george washington", ["washington"]],
  ["abraham lincoln", ["lincoln", "abe lincoln"]],
  ["william shakespeare", ["shakespeare", "bard"]],
]);

// EVENT_ALIASES maps full event names to abbreviations
const EVENT_ALIASES = new Map<string, string[]>([
  ["world war ii", ["world war 2", "ww2", "wwii", "second world war"]],
  ["world war i", ["world war 1", "ww1", "wwi", "first world war"]],
  ["north atlantic treaty organization", ["nato"]],
  ["united nations", ["un", "u.n."]],
]);

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCaseAndWhitespace(value: string): string {
  return collapseWhitespace(String(value ?? "").toLowerCase().trim());
}

function flattenDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Collapse commas inside numbers before punctuation stripping so "4,000" → "4000" not "4 000".
function collapseNumericCommas(value: string): string {
  return value.replace(/(\d),(\d)/g, "$1$2");
}

function stripPunctuationPossessivesAndHyphens(value: string): string {
  let normalized = value.replace(/[-_]+/g, " ");
  normalized = normalized.replace(/[''`]/g, "");
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  return collapseWhitespace(normalized);
}

function normalizeCommonAbbreviations(value: string): string {
  let normalized = ` ${value} `;
  // Keep legacy US/UK normalization for backwards compatibility
  normalized = normalized.replace(/\b(u s a|usa|u s|us|united states of america|united states)\b/g, " united states ");
  normalized = normalized.replace(/\b(u k|uk|united kingdom)\b/g, " united kingdom ");
  normalized = normalized.replace(/\btv\b/g, " television ");
  return collapseWhitespace(normalized);
}

/**
 * Normalize country names and aliases to their canonical form.
 * E.g., "USSR" → "russia", "Persia" → "iran", "UK" → "great britain"
 */
function normalizeCountryNames(value: string): string {
  let normalized = ` ${value} `;
  
  // Normalize country aliases
  for (const [canonical, aliases] of COUNTRY_ALIASES) {
    // Build regex patterns for both canonical and aliases
    const allVariants = [canonical, ...aliases];
    for (const variant of allVariants) {
      const pattern = variant.replace(/\s+/g, "\\s+");
      const regex = new RegExp(`\\b${pattern}\\b`, "gi");
      normalized = normalized.replace(regex, ` ${canonical} `);
    }
  }
  
  return collapseWhitespace(normalized);
}

/**
 * Normalize historical terms and regions to their modern country equivalents.
 * E.g., "Mesopotamia" → "iraq", "Persia" → "iran"
 */
function normalizeHistoricalTerms(value: string): string {
  let normalized = ` ${value} `;
  
  for (const [canonical, aliases] of HISTORICAL_TERM_ALIASES) {
    for (const alias of aliases) {
      const pattern = alias.replace(/\s+/g, "\\s+");
      const regex = new RegExp(`\\b${pattern}\\b`, "gi");
      normalized = normalized.replace(regex, ` ${canonical} `);
    }
  }
  
  return collapseWhitespace(normalized);
}

/**
 * Normalize person names to include common abbreviations and nicknames.
 * E.g., "JFK" → "john f. kennedy", "FDR" → "franklin d. roosevelt"
 */
function normalizePersonNames(value: string): string {
  let normalized = ` ${value} `;
  
  for (const [canonical, aliases] of PERSON_NAME_ALIASES) {
    for (const alias of aliases) {
      const pattern = alias.replace(/\s+/g, "\\s+");
      const regex = new RegExp(`\\b${pattern}\\b`, "gi");
      normalized = normalized.replace(regex, ` ${canonical} `);
    }
  }
  
  return collapseWhitespace(normalized);
}

/**
 * Normalize historical event names to include common abbreviations.
 * E.g., "WW2" → "world war ii", "NATO" → "north atlantic treaty organization"
 */
function normalizeEventNames(value: string): string {
  let normalized = ` ${value} `;
  
  for (const [canonical, aliases] of EVENT_ALIASES) {
    for (const alias of aliases) {
      const pattern = alias.replace(/\s+/g, "\\s+");
      const regex = new RegExp(`\\b${pattern}\\b`, "gi");
      normalized = normalized.replace(regex, ` ${canonical} `);
    }
  }
  
  return collapseWhitespace(normalized);
}

/**
 * Get the canonical country name for a given input.
 * Returns null if the input is not a recognized country or alias.
 * E.g., "uk" → "great britain", "ussr" → "russia"
 */
function getCanonicalCountryName(value: string): string | null {
  const lower = value.toLowerCase().trim();
  
  // Check if it's a primary key
  if (COUNTRY_ALIASES.has(lower)) {
    return lower;
  }
  
  // Check if it's an alias of any primary key
  for (const [primary, aliases] of COUNTRY_ALIASES) {
    if (aliases.includes(lower)) {
      return primary;
    }
  }
  
  return null;
}

/**
 * Check if two values represent the same country using alias mapping.
 * E.g., "uk" matches "great britain", "ussr" matches "russia"
 */
function isCountryMatch(userAnswer: string, correctAnswer: string): boolean {
  const userCanonical = getCanonicalCountryName(userAnswer);
  const correctCanonical = getCanonicalCountryName(correctAnswer);
  
  // If both normalize to the same canonical country, it's a match
  if (userCanonical && correctCanonical && userCanonical === correctCanonical) {
    return true;
  }
  
  return false;
}

/**
 * Check if two values represent the same historical region.
 * E.g., "mesopotamia" matches "iraq"
 */
function isHistoricalTermMatch(userAnswer: string, correctAnswer: string): boolean {
  const userLower = userAnswer.toLowerCase();
  const correctLower = correctAnswer.toLowerCase();
  
  // Check if user answer is an alias for the correct answer
  for (const [canonical, aliases] of HISTORICAL_TERM_ALIASES) {
    const isUserAlias = aliases.some(alias => userLower.includes(alias));
    const isCorrectMatch = correctLower.includes(canonical) || aliases.some(alias => correctLower.includes(alias));
    if (isUserAlias && isCorrectMatch) return true;
  }
  
  return false;
}

/**
 * Check if two values represent the same person using alias mapping.
 * E.g., "jfk" matches "john f. kennedy"
 */
function isPersonNameMatch(userAnswer: string, correctAnswer: string): boolean {
  const userLower = userAnswer.toLowerCase();
  const correctLower = correctAnswer.toLowerCase();
  
  for (const [canonical, aliases] of PERSON_NAME_ALIASES) {
    const isUserAlias = aliases.some(alias => userLower.includes(alias));
    const isCorrectMatch = correctLower.includes(canonical) || aliases.some(alias => correctLower.includes(alias));
    if (isUserAlias && isCorrectMatch) return true;
  }
  
  return false;
}

/**
 * Check if two values represent the same historical event using alias mapping.
 * E.g., "ww2" matches "world war ii"
 */
function isEventMatch(userAnswer: string, correctAnswer: string): boolean {
  const userLower = userAnswer.toLowerCase();
  const correctLower = correctAnswer.toLowerCase();
  
  for (const [canonical, aliases] of EVENT_ALIASES) {
    const isUserAlias = aliases.some(alias => userLower.includes(alias));
    const isCorrectMatch = correctLower.includes(canonical) || aliases.some(alias => correctLower.includes(alias));
    if (isUserAlias && isCorrectMatch) return true;
  }
  
  return false;
}

function stripLeadingArticle(value: string): string {
  return value.replace(/^(the|a|an)\s+/, "").trim();
}

function normalizeSpelledNumbersToDigits(value: string): string {
  const tokens = value.split(" ").filter(Boolean);
  const output: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;

    if (isStandaloneNumber(token)) {
      output.push(String(Number(token)));
      continue;
    }

    if (token === "one" && tokens[i + 1] === "hundred") {
      output.push("100");
      i += 1;
      continue;
    }

    if (token === "hundred") {
      output.push("100");
      continue;
    }

    const maybeNumber = WORD_TO_NUMBER.get(token);
    if (maybeNumber === undefined) {
      output.push(token);
      continue;
    }

    if (maybeNumber >= 20 && maybeNumber % 10 === 0) {
      const next = tokens[i + 1];
      if (next && UNIT_WORDS.has(next)) {
        const nextValue = WORD_TO_NUMBER.get(next) ?? 0;
        output.push(String(maybeNumber + nextValue));
        i += 1;
        continue;
      }
    }

    output.push(String(maybeNumber));
  }

  return collapseWhitespace(output.join(" "));
}

function normalizeForTriviaComparison(value: string): string {
  let normalized = normalizeCaseAndWhitespace(value);
  normalized = flattenDiacritics(normalized);
  normalized = collapseNumericCommas(normalized);
  normalized = stripPunctuationPossessivesAndHyphens(normalized);
  normalized = normalizeCommonAbbreviations(normalized);
  // NEW: Normalize countries, historical terms, people, and events
  normalized = normalizeCountryNames(normalized);
  normalized = normalizeHistoricalTerms(normalized);
  normalized = normalizePersonNames(normalized);
  normalized = normalizeEventNames(normalized);
  normalized = stripLeadingArticle(normalized);
  normalized = normalizeSpelledNumbersToDigits(normalized);
  return collapseWhitespace(normalized);
}

function singularizeWord(value: string): string {
  if (value.length <= 3) return value;
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("es") && value.length > 4) return value.slice(0, -2);
  if (value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

function arePluralizationVariants(left: string, right: string): boolean {
  if (!left || !right) return false;
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);
  if (leftTokens.length !== rightTokens.length) return false;
  for (let i = 0; i < leftTokens.length; i += 1) {
    const l = leftTokens[i]!;
    const r = rightTokens[i]!;
    if (l === r) continue;
    if (singularizeWord(l) !== singularizeWord(r)) return false;
  }
  return true;
}

function damerauLevenshteinDistance(left: string, right: string): number {
  const leftLen = left.length;
  const rightLen = right.length;

  if (leftLen === 0) return rightLen;
  if (rightLen === 0) return leftLen;

  const matrix: number[][] = Array.from({ length: leftLen + 1 }, () => Array(rightLen + 1).fill(0));

  for (let i = 0; i <= leftLen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= rightLen; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= leftLen; i += 1) {
    for (let j = 1; j <= rightLen; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const deletion = matrix[i - 1][j] + 1;
      const insertion = matrix[i][j - 1] + 1;
      const substitution = matrix[i - 1][j - 1] + cost;
      let best = Math.min(deletion, insertion, substitution);

      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        best = Math.min(best, matrix[i - 2][j - 2] + 1);
      }

      matrix[i][j] = best;
    }
  }

  return matrix[leftLen][rightLen];
}

// Extract the first standalone integer from a normalized answer (e.g. "4000 feet" → "4000").
function extractNumericPart(normalized: string): string | null {
  const match = normalized.match(/\b(\d+)\b/);
  return match ? (match[1] ?? null) : null;
}

// Checks whether two words represent the same root. Tries exact match, singularization,
// and plain -s stripping. The plain -s strip handles cases like "noses" → "nose" where
// singularize() would incorrectly give "nos" due to its -es rule.
function wordMatchesVariant(userWord: string, correctWord: string): boolean {
  if (userWord === correctWord) return true;
  if (singularizeWord(userWord) === singularizeWord(correctWord)) return true;
  const uBase = userWord.endsWith("s") ? userWord.slice(0, -1) : userWord;
  const cBase = correctWord.endsWith("s") ? correctWord.slice(0, -1) : correctWord;
  if (uBase === correctWord || userWord === cBase || uBase === cBase) return true;
  return false;
}

// Returns true when every word in the user's answer (fewer words than correct) matches
// a word in the correct answer by exact text or singularization. Uses strict word-level
// matching only — no Levenshtein — so "lion" cannot slide into "lionel".
function userWordsSubsetOfCorrect(userNorm: string, correctNorm: string): boolean {
  const userWords = userNorm.split(" ").filter(Boolean);
  const correctWords = correctNorm.split(" ").filter(Boolean);
  if (userWords.length === 0 || userWords.length >= correctWords.length) return false;
  for (const userWord of userWords) {
    if (!correctWords.some((cw) => wordMatchesVariant(userWord, cw))) return false;
  }
  return true;
}

function parseLeadingYearAnswer(normalized: string): { year: string; shortYear: string } | null {
  const match = normalized.match(/^(\d{4})\s+.+$/);
  if (!match) return null;
  const year = match[1]!;
  return { year, shortYear: year.slice(-2) };
}

function submittedContainsRequiredYear(userNorm: string, correctNorm: string): boolean {
  const parsed = parseLeadingYearAnswer(correctNorm);
  if (!parsed) return true;
  const { year, shortYear } = parsed;
  return new RegExp(`\\b(?:${year}|${shortYear})\\b`).test(userNorm);
}

// Words that are too generic to count as an identifying match on their own.
// If a user submits only generic tokens (e.g. "New" for "New York") it should
// not pass — the substantive identifying word (e.g. "York") must also match.
const GENERIC_TOKENS = new Set([
  "the", "a", "an", "of", "in", "at", "by", "on", "to", "or", "and",
  "for", "from", "with", "as", "is", "are", "was", "be", "do",
  "new", "old", "big", "little", "great", "good", "bad", "long", "short",
  "mr", "mrs", "ms", "dr", "sir", "st", "mt",
  "city", "town", "state", "country", "island", "river", "lake", "sea",
  "north", "south", "east", "west",
]);

function isGenericToken(word: string): boolean {
  if (word.length <= 2) return true;
  return GENERIC_TOKENS.has(word);
}

// Stricter per-token fuzzy match used only inside tokenFuzzySubsetMatch.
// Short tokens (≤4 chars) must match exactly via wordMatchesVariant (already
// tried before this is called), so we return false here for them — prevents
// "yore" from fuzzy-sliding into "york". For longer tokens we require both
// a tight edit distance AND ≥0.85 similarity.
function tokenSimilarMatch(userToken: string, correctToken: string): boolean {
  if (userToken === correctToken) return true;
  if (arePluralizationVariants(userToken, correctToken)) return true;
  const maxLen = Math.max(userToken.length, correctToken.length);
  if (maxLen <= 4) return false;
  const distance = damerauLevenshteinDistance(userToken, correctToken);
  const similarity = 1 - distance / maxLen;
  if (maxLen <= 8) return distance <= 1 && similarity >= 0.80;
  return distance <= 2 && similarity >= 0.80;
}

// Token-level fuzzy subset match: every user token fuzzy-matches a distinct
// correct token, AND at least one matched correct token is substantive (4+ chars,
// non-generic). This catches "lanister" → "house lannister" while blocking
// a standalone "new" from matching "new york".
function tokenFuzzySubsetMatch(userNorm: string, correctNorm: string): boolean {
  const userTokens = userNorm.split(" ").filter(Boolean);
  const correctTokens = correctNorm.split(" ").filter(Boolean);

  // Only runs when user gave fewer words than the correct answer.
  if (userTokens.length === 0 || userTokens.length >= correctTokens.length) return false;

  const usedCorrectIndices = new Set<number>();
  let hasSubstantiveMatch = false;

  for (const userToken of userTokens) {
    let bestIdx = -1;

    // Prefer exact/singularization match first for stability.
    for (let i = 0; i < correctTokens.length; i++) {
      if (!usedCorrectIndices.has(i) && wordMatchesVariant(userToken, correctTokens[i]!)) {
        bestIdx = i;
        break;
      }
    }

    // Fall back to stricter token-level fuzzy match if no exact hit.
    if (bestIdx === -1) {
      for (let i = 0; i < correctTokens.length; i++) {
        if (!usedCorrectIndices.has(i) && tokenSimilarMatch(userToken, correctTokens[i]!)) {
          bestIdx = i;
          break;
        }
      }
    }

    // This user token matched nothing — the answer doesn't fit.
    if (bestIdx === -1) return false;

    usedCorrectIndices.add(bestIdx);
    const matchedCorrectToken = correctTokens[bestIdx]!;
    if (matchedCorrectToken.length >= 4 && !isGenericToken(matchedCorrectToken)) {
      hasSubstantiveMatch = true;
    }
  }

  // Require at least one substantive identifying token to have matched, so
  // purely generic submissions ("new", "the") never accidentally pass.
  return hasSubstantiveMatch;
}

function isSimilarShortAnswer(left: string, right: string): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (arePluralizationVariants(left, right)) return true;

  const maxLen = Math.max(left.length, right.length);
  const distance = damerauLevenshteinDistance(left, right);
  const similarity = 1 - distance / maxLen;

  if (maxLen <= 4) {
    return distance <= 1;
  }
  if (maxLen <= 8) {
    // Require both distance AND similarity so that "lion" (4) does not match "lionel" (6)
    // where similarity would be 0.67 — well below 0.75.
    return distance <= 2 && similarity >= 0.75;
  }
  return distance <= 3 && similarity >= 0.80;
}

export function gradeWriteInAnswer(userSubmitted: string, correctTarget: string): boolean {
  const targetRaw = String(correctTarget ?? "");
  const submittedRaw = String(userSubmitted ?? "");

  if (!targetRaw || !submittedRaw) return false;

  const normalizedTarget = normalizeForTriviaComparison(targetRaw);
  const normalizedSubmitted = normalizeForTriviaComparison(submittedRaw);
  if (!normalizedTarget || !normalizedSubmitted) return false;

  // 1. Exact match.
  if (normalizedSubmitted === normalizedTarget) return true;

  // 2. Pluralization variants ("noses" ↔ "nose", "countries" ↔ "country").
  if (arePluralizationVariants(normalizedSubmitted, normalizedTarget)) return true;

  // 3. NEW: Country/region matching (UK ↔ Great Britain, USSR ↔ Russia, etc.)
  if (isCountryMatch(submittedRaw, targetRaw)) return true;

  // 4. NEW: Historical region matching (Mesopotamia ↔ Iraq, Persia ↔ Iran)
  if (isHistoricalTermMatch(submittedRaw, targetRaw)) return true;

  // 5. NEW: Person name matching (JFK ↔ John F. Kennedy, FDR ↔ Franklin D. Roosevelt)
  if (isPersonNameMatch(submittedRaw, targetRaw)) return true;

  // 6. NEW: Historical event matching (WW2 ↔ World War II, NATO ↔ North Atlantic Treaty Organization)
  if (isEventMatch(submittedRaw, targetRaw)) return true;

  // 7. Numeric + measurement: when the correct answer is a number paired with a unit
  //    (e.g. "4000 feet", "206 mph"), accept a submission that supplies just the
  //    numeric part ("4000", "206") or the same number with the same words ("4000 feet").
  //    Rejects if the user substitutes a different unit ("4000 meters" ≠ "4000 feet").
  const targetNumeric = extractNumericPart(normalizedTarget);
  if (targetNumeric !== null && !isStandaloneNumber(normalizedTarget)) {
    const submittedNumeric = extractNumericPart(normalizedSubmitted);
    if (submittedNumeric === targetNumeric) {
      if (isStandaloneNumber(normalizedSubmitted)) return true;
      // Submitted has extra words — accept only if every submitted word appears in the target.
      const submittedWords = normalizedSubmitted.split(" ").filter(Boolean);
      const targetWords = normalizedTarget.split(" ").filter(Boolean);
      if (submittedWords.every((w) => targetWords.includes(w))) return true;
    }
  }

  // 8. Pure standalone numbers require exact equality; mixed cases rejected here.
  if (isStandaloneNumber(normalizedTarget) || isStandaloneNumber(normalizedSubmitted)) {
    return (
      isStandaloneNumber(normalizedTarget) &&
      isStandaloneNumber(normalizedSubmitted) &&
      normalizedSubmitted === normalizedTarget
    );
  }

  // 8b. If the canonical answer starts with a specific four-digit year, require
  // the submission to preserve that year information using either the full year
  // or an approved two-digit shorthand. This prevents "Dolphins" from passing
  // for "1972 Dolphins" while still allowing exact stored variants like
  // "72 Dolphins" or subset matches such as "2016 Warriors".
  if (!submittedContainsRequiredYear(normalizedSubmitted, normalizedTarget)) {
    return false;
  }

  // 9. Partial word match: user's answer is a meaningful subset of the correct answer
  //    ("Noses" → "Nose Prints", "Nose" → "Nose Prints", "Prints" → "Nose Prints").
  if (userWordsSubsetOfCorrect(normalizedSubmitted, normalizedTarget)) return true;

  // 9b. Token-level fuzzy subset: user gave fewer words than the correct answer and each
  //     of their tokens fuzzy-matches a distinct correct token, with at least one
  //     substantive (4+ char, non-generic) token matching. This handles cases like
  //     "Lanister" → "House Lannister" (typo + prefix word) and "Lannister" → "House
  //     Lannister" (omitted prefix). The substantive-token guard prevents a bare "New"
  //     from sliding through as a match for "New York".
  if (tokenFuzzySubsetMatch(normalizedSubmitted, normalizedTarget)) return true;

  // 10. Fuzzy string similarity (typos, transpositions).
  return isSimilarShortAnswer(normalizedSubmitted, normalizedTarget);
}

function uniqueAnswerTargets(targets: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const target of targets) {
    const answer = String(target ?? "").trim();
    const key = normalizeForTriviaComparison(answer);
    if (!answer || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push(answer);
  }
  return unique;
}

export async function gradeWriteInAnswerWithVariants(
  userSubmitted: string,
  correctTarget: string,
  questionId?: string,
  answerIndex?: number,
  acceptableTargets: string[] = [],
  answerVariantIndexes: number[] = []
): Promise<boolean> {
  for (const target of uniqueAnswerTargets([correctTarget, ...acceptableTargets])) {
    if (gradeWriteInAnswer(userSubmitted, target)) {
      return true;
    }
  }

  const normalizedSubmitted = normalizeForTriviaComparison(userSubmitted);
  if (!normalizedSubmitted) {
    return false;
  }

  if (!questionId || !Number.isInteger(answerIndex) || Number(answerIndex) < 0) {
    return false;
  }

  try {
    const indexes = Array.from(
      new Set(
        [answerIndex, ...answerVariantIndexes]
          .map((index) => Number(index))
          .filter((index) => Number.isInteger(index) && index >= 0)
      )
    );
    for (const index of indexes) {
      const variants = await getAnswerVariants(questionId, index);
      for (const variant of variants) {
        const normalizedVariant = normalizeForTriviaComparison(variant);
        if (normalizedVariant && normalizedSubmitted === normalizedVariant) {
          return true;
        }
      }
    }
  } catch (error) {
    console.error("Error checking answer variants:", error);
  }

  return false;
}

export function normalizeWriteInForStorage(value: string): string {
  return normalizeForTriviaComparison(String(value ?? ""));
}
