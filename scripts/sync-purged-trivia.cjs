#!/usr/bin/env node
/**
 * Synchronizes the Supabase 'trivia_questions' table with the local JSON files.
 * Deletes any questions from the database that are no longer present in the local JSON categories.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const CATEGORY_DIR = "data/live-trivia/categories";

// Use environment variables for Supabase config
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const files = fs.readdirSync(CATEGORY_DIR).filter(f => f.endsWith(".json"));
  
  // 1. Gather all valid slugs from the cleaned JSON files
  const validSlugs = new Set();
  for (const file of files) {
    const filePath = path.join(CATEGORY_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const questions = Array.isArray(data) ? data : data.questions;
    questions.forEach(q => {
      if (q.slug) validSlugs.add(q.slug);
    });
  }

  console.log(`Found ${validSlugs.size} valid slugs in local files.`);

  // 2. Fetch all questions from the database for the live_showdown pool
  const { data: dbQuestions, error } = await supabase
    .from("trivia_questions")
    .select("id, slug, question")
    .eq("question_pool", "live_showdown");

  if (error) {
    console.error("Error fetching from Supabase:", error.message);
    process.exit(1);
  }

  console.log(`Found ${dbQuestions.length} live_showdown questions in database.`);

  // 3. Identify and delete non-compliant questions
  let deleteCount = 0;
  for (const q of dbQuestions) {
    if (!validSlugs.has(q.slug)) {
      console.log(`[DELETING] Q: "${q.question}" (Slug: ${q.slug})`);
      const { error: fkError } = await supabase
        .from("trivia_session_questions")
        .delete()
        .eq("question_id", q.slug);

      if (fkError) {
        console.error(`  Failed to remove dependent session references for ${q.slug}:`, fkError.message);
      }

      const { error: liveAnswersError } = await supabase
        .from("live_showdown_answers")
        .delete()
        .eq("question_id", q.slug);

      if (liveAnswersError) {
        console.error(`  Failed to remove dependent live showdown answer rows for ${q.slug}:`, liveAnswersError.message);
      }

      const { error: delError } = await supabase
        .from("trivia_questions")
        .delete()
        .eq("slug", q.slug);

      if (delError) {
        console.error(`  Failed to delete ${q.id}:`, delError.message);
      } else {
        deleteCount++;
      }
    }
  }

  console.log(`Successfully purged ${deleteCount} questions from Supabase.`);
}

main().catch(console.error);
