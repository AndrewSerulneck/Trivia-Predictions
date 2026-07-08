/**
 * Script to parse the malformed New-questions.json (actually TSV-like format)
 * and convert it to proper JSON matching the existing live trivia category format.
 *
 * Fixes:
 * 1. Malformed questions with "What is " prefix (e.g. "What is From which country...")
 * 2. Answer "C) Venezuela" → "Venezuela"
 * 3. Adds subcategory mappings based on category
 * 4. Preserves existing acceptableAnswers
 * 5. Converts to proper JSON array of question objects
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'data', 'live-trivia', 'New-questions.json');
const OUTPUT = path.join(__dirname, '..', 'data', 'live-trivia', 'New-questions.json');

// Subcategory mappings based on category name
const SUBCATEGORY_MAP = {
  'Animals': 'animals-nature',
  'General Knowledge': 'general-knowledge',
  'Geography': 'geography',
  'History': 'history',
  'Music': 'music',
  'Pop Culture': 'pop-culture',
  'Science': 'science',
  'Sports': 'sports',
};

// Read the file
const raw = fs.readFileSync(INPUT, 'utf-8');

/**
 * Parse the TSV-like record format into structured question objects.
 * 
 * Format:
 * [empty line with tab]
 * [index number]
 * slug\t"value"
 * question\t"value"   (value may be in '', "", or `` quotes)
 * answer\t"value"
 * answer_format\t"value"
 * category\t"value"
 * difficulty\t"value"
 * [optional: acceptableAnswers with sub-entries]
 */
function parseRecords(text) {
  const lines = text.split('\n');
  const records = [];
  let currentRecord = null;
  let inAcceptableAnswers = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      continue;
    }

    // Check if this is a record index (just a number)
    if (/^\d+$/.test(trimmed)) {
      if (currentRecord) {
        records.push(currentRecord);
      }
      currentRecord = { index: parseInt(trimmed, 10) };
      inAcceptableAnswers = false;
      continue;
    }

    if (!currentRecord) continue;

    // Check for the acceptableAnswers key line
    if (trimmed === 'acceptableAnswers') {
      inAcceptableAnswers = true;
      currentRecord.acceptableAnswers = [];
      continue;
    }

    // If we're in acceptableAnswers section, look for sub-entries
    // Format: \d+\t"value" (number, tab, quoted value)
    if (inAcceptableAnswers) {
      const subMatch = line.match(/^\d+\t(['`"])(.+)\1$/);
      if (subMatch) {
        currentRecord.acceptableAnswers.push(subMatch[2]);
        continue;
      }
      // Maybe the value is at the start of the line with just quotes
      const bareMatch = trimmed.match(/^['`"](.+)['`"]$/);
      if (bareMatch) {
        currentRecord.acceptableAnswers.push(bareMatch[1]);
        continue;
      }
      // If we hit another main key, exit acceptableAnswers mode
      // (but don't skip the line - let it be processed below)
      inAcceptableAnswers = false;
    }

    // Main key-value pair: key\t"value" (where value can be in "", '', or ``)
    const mainMatch = line.match(/^(\w+)\t(['`"])(.+)\2$/);
    if (mainMatch) {
      const key = mainMatch[1];
      const value = mainMatch[3];
      currentRecord[key] = value;
      continue;
    }

    // Also try matching without quotes (for edge cases)
    const bareMatch2 = line.match(/^(\w+)\t(.+)$/);
    if (bareMatch2) {
      const key = bareMatch2[1];
      const value = bareMatch2[2];
      currentRecord[key] = value;
    }
  }

  // Push the last record
  if (currentRecord) {
    records.push(currentRecord);
  }

  return records;
}

/**
 * Fix malformed question text.
 * Removes erroneous "What is " prefix when it creates a grammatically broken question.
 * e.g. "What is From which country do croissants originate?" → "From which country do croissants originate?"
 *      "What is The Byzantine Empire..." → "The Byzantine Empire..."
 *      "What is Taylor Swift's 2008 album..." → "Taylor Swift's 2008 album..."
 */
function fixQuestion(question) {
  if (!question) return question;

  let fixed = question;

  // Remove "What is " when followed by uppercase letter (indicating a new sentence/clause)
  // This catches: "What is From which country...", "What is The Byzantine...", "What is In physics..."
  fixed = fixed.replace(/^What is\s+([A-Z])/, '$1');

  // Fix other potential issues - remove duplicate spaces
  fixed = fixed.replace(/\s+/g, ' ').trim();

  return fixed;
}

/**
 * Fix malformed answer text.
 * e.g. "C) Venezuela" → "Venezuela"
 */
function fixAnswer(answer) {
  if (!answer) return answer;

  let fixed = answer;

  // Remove answer choice prefixes like "C) " or "B) " or "A) "
  fixed = fixed.replace(/^[A-D]\)\s*/, '');

  // Remove leading/trailing quotes that may have been captured
  fixed = fixed.replace(/^["']|["']$/g, '');

  return fixed.trim();
}

/**
 * Build acceptableAnswers array for a question.
 * Combines existing acceptableAnswers (if any) with common variations of the answer.
 */
function buildAcceptableAnswers(record) {
  const existing = record.acceptableAnswers || [];
  const answer = record.answer || '';

  // For answers that are just numbers, add the word form
  const numMap = {
    '2': ['two'],
    '4': ['four'],
    '6': ['six'],
    '7': ['seven'],
    '8': ['eight'],
    '10': ['ten'],
    '11': ['eleven'],
    '12': ['twelve'],
    '19': ['nineteen'],
    '64': ['sixty-four'],
    '206': ['two hundred six'],
    '365': ['three hundred sixty-five', 'three hundred and sixty-five'],
  };

  // For country/place answers, add common variations
  const answerVariants = {
    'United States': ['USA', 'US', 'America', 'United States of America'],
    'Pacific Ocean': ['Pacific'],
    'Urals': ['Ural Mountains'],
    'Ural Mountains': ['Urals'],
    'Greek': ['Ancient Greece', 'Athens'],
    'Aegean Sea': ['Aegean'],
    'Dead Sea': ['Dead'],
    'Vatican City': ['Vatican'],
    'Queen Victoria': ['Victoria'],
    'Vincent van Gogh': ['Van Gogh'],
  };

  const variants = [];

  // Add number word forms
  if (numMap[answer]) {
    variants.push(...numMap[answer]);
  }

  // Add answer variants
  if (answerVariants[answer]) {
    variants.push(...answerVariants[answer]);
  }

  // For "The Beatles" type answers, add version without "The"
  if (answer.startsWith('The ')) {
    variants.push(answer.substring(4));
  }

  // Deduplicate and combine
  const all = [...new Set([...existing, ...variants])];
  return all.length > 0 ? all : undefined;
}

// Parse the records
const records = parseRecords(raw);

console.log(`Parsed ${records.length} records from the file.\n`);

// Validate we got questions for all records
let emptyQuestions = 0;
records.forEach((r, i) => {
  if (!r.question) {
    emptyQuestions++;
    console.log(`  WARNING: Record ${i} (slug: "${r.slug || 'unknown'}") has empty question!`);
  }
});

// Transform to proper JSON format
const questions = records.map((record, idx) => {
  const fixedQuestion = fixQuestion(record.question || '');
  const fixedAnswer = fixAnswer(record.answer || '');
  const acceptable = buildAcceptableAnswers(record);

  const q = {
    slug: record.slug || '',
    question: fixedQuestion,
    answer: fixedAnswer,
    answer_format: 'write_in',
    category: record.category || 'General Knowledge',
    difficulty: record.difficulty || 'easy',
    subcategory: SUBCATEGORY_MAP[record.category] || 'general-knowledge',
  };

  if (acceptable && acceptable.length > 0) {
    q.acceptableAnswers = acceptable;
  }

  return q;
});

// Build the final JSON structure matching existing category files
const output = {
  categoryName: 'Mixed',
  questions: questions,
};

// Write the output
fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');
console.log(`\nWritten ${questions.length} questions to ${OUTPUT}`);

// Print summary of fixes
console.log('\n=== Fixes Applied ===');
let whatIsFixCount = 0;
let answerFixCount = 0;
records.forEach((r, i) => {
  const origQ = r.question || '';
  const fixedQ = fixQuestion(origQ);
  if (origQ !== fixedQ) {
    whatIsFixCount++;
    console.log(`  Q${i}: "${origQ}" → "${fixedQ}"`);
  }
  const origA = r.answer || '';
  const fixedA = fixAnswer(origA);
  if (origA !== fixedA) {
    answerFixCount++;
    console.log(`  A${i}: "${origA}" → "${fixedA}"`);
  }
});

console.log(`\n=== Summary ===`);
console.log(`  Total questions: ${questions.length}`);
console.log(`  Empty questions: ${emptyQuestions}`);
console.log(`  Fixed "What is" questions: ${whatIsFixCount}`);
console.log(`  Fixed answers: ${answerFixCount}`);
