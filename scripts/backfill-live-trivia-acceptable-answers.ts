import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeSuggestedAnswer, suggestAcceptableAnswers } from "@/lib/triviaAnswerSuggestions";

type LiveQuestion = {
  answer?: string;
  acceptableAnswers?: string[];
};

type LiveCategoryFile = {
  categoryName?: string;
  questions?: LiveQuestion[];
};

const targetDir = path.join(process.cwd(), "data", "live-trivia", "categories");

let updatedFiles = 0;
let updatedQuestions = 0;
let addedAnswers = 0;

for (const fileName of readdirSync(targetDir).filter((entry) => entry.endsWith(".json")).sort()) {
  const filePath = path.join(targetDir, fileName);
  const sourceText = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(sourceText) as LiveCategoryFile;
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  let fileChanged = false;

  for (const question of questions) {
    const answer = String(question.answer ?? "").trim();
    if (!answer) continue;

    const existing = Array.isArray(question.acceptableAnswers) ? question.acceptableAnswers : [];
    const seen = new Set<string>([normalizeSuggestedAnswer(answer)]);
    const merged: string[] = [];

    for (const value of existing) {
      const answerText = String(value ?? "").trim();
      const key = normalizeSuggestedAnswer(answerText);
      if (!answerText || !key || seen.has(key)) continue;
      seen.add(key);
      merged.push(answerText);
    }

    for (const suggestion of suggestAcceptableAnswers(answer)) {
      const key = normalizeSuggestedAnswer(suggestion);
      if (!suggestion || !key || seen.has(key)) continue;
      seen.add(key);
      merged.push(suggestion);
      addedAnswers += 1;
      fileChanged = true;
    }

    const originalCount = Array.isArray(question.acceptableAnswers) ? question.acceptableAnswers.length : 0;
    if (merged.length !== originalCount) {
      question.acceptableAnswers = merged;
      updatedQuestions += 1;
      fileChanged = true;
    } else if (merged.length > 0) {
      question.acceptableAnswers = merged;
    }
  }

  if (fileChanged) {
    writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    updatedFiles += 1;
  }
}

console.log(
  JSON.stringify(
    {
      updatedFiles,
      updatedQuestions,
      addedAnswers,
    },
    null,
    2
  )
);
