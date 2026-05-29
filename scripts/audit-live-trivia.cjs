#!/usr/bin/env node
/**
 * Audits existing live trivia questions to ensure they use Rigid Identifiers.
 * Rejects questions that have high linguistic variance or descriptive answers.
 */

const fs = require("node:fs");
const path = require("node:path");

const CATEGORY_DIR = "data/live-trivia/categories";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const json = await response.json();
  const text = json.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

async function auditBatch(questions) {
  const prompt = `
    Audit the following trivia questions for 'Rigid Identifier' compliance.
    A Rigid Identifier is a proper noun, technical term, or specific entity with NO common synonyms.
    
    BAD ANSWERS: Descriptive occupations ('Real estate agent'), generic phrases, common nouns with many alternatives ('Soccer' vs 'Football').
    GOOD ANSWERS: Full names of people, specific cities/countries, years, chemical elements, sports teams, book/movie titles.

    Input JSON: ${JSON.stringify(questions)}

    Return a JSON object with a "results" array of booleans, where true means the question is a Rigid Identifier and false means it should be PURGED.
    Ensure the array length matches the input length exactly.
    Format: { "results": [true, false, true, ...] }
  `;

  const res = await callGemini(prompt);
  return res.results;
}

async function main() {
  const files = fs.readdirSync(CATEGORY_DIR).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const filePath = path.join(CATEGORY_DIR, file);
    console.log(`Auditing ${file}...`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const questions = Array.isArray(data) ? data : data.questions;
    const originalCount = questions.length;

    const auditedQuestions = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      try {
        const results = await auditBatch(batch);
        batch.forEach((q, idx) => {
          if (results[idx]) {
            auditedQuestions.push(q);
          } else {
            console.log(`  [PURGED] Q: "${q.question}" A: "${q.answer}"`);
          }
        });
        await sleep(2000); // Throttling
      } catch (err) {
        console.error(`  Error auditing batch ${i}:`, err.message);
        // On error, keep the batch to be safe, or skip. Here we keep.
        auditedQuestions.push(...batch);
      }
    }

    if (Array.isArray(data)) {
      fs.writeFileSync(filePath, JSON.stringify(auditedQuestions, null, 2));
    } else {
      data.questions = auditedQuestions;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    
    console.log(`Finished ${file}: ${originalCount} -> ${auditedQuestions.length} questions.`);
  }
}

main().catch(console.error);
