// One day's writing for write.mjs (private repo; docs/speed-trivia-backlog-and-quality-plan.md Phases 4b, 4d.1, 4e
// and 7h in the main repo). Kept out of write.mjs so the main repo's tests can run it with a fake site and codex.
//
// Per game: GET the brief -> one codex call per writing prompt -> one separate grading call per prompt (the bar test,
// D35) -> POST the batch. Then, for Live, the Make Live conversions (4e).
// Phase 7h (R2 #25.1): a failed or partial grading call never stops the day; the batch goes with the grades it has
// and the site grades the rest through the OpenAI API. Only a login failure on a WRITING call stops the run, and even
// then the game's batch so far is posted first.
import { attachGrades, conversionItems, conversionPost, gradeItems, writtenItems } from "./grade.mjs";

export const LOGIN_MESSAGE = "ChatGPT login needs renewing: run renew-login.sh (see README).";

/**
 * writeDay({ games, api, codex, model, gradeEffort, log, warn }) -> { failed, login }.
 * - api(route, init) -> { status, body } (the site; a rejected token exits inside it).
 * - codex({ prompt, schema, webSearch, effort? }) -> { output, tokens } (runCodex with the model bound).
 * `login` is true when a writing call found the ChatGPT login expired: the caller exits 3 and later games are skipped.
 */
export const writeDay = async ({ games, api, codex, model, gradeEffort, log = console.log, warn = console.error }) => {
  let failed = false;
  let login = false;

  // The bar test, in a fresh session that sees only the rubric and the finished questions. Never throws.
  const grade = async (label, written, block) => {
    if (!written.length || !block?.prompt) return { graded: 0, tokens: 0 };
    try {
      const { prompt: rubric, schema, webSearch, fields, version } = block;
      const result = await codex({ prompt: `${rubric}\n${JSON.stringify(gradeItems(written, fields))}`, schema, webSearch, effort: gradeEffort });
      return { graded: attachGrades(written, result.output, version), tokens: result.tokens ?? 0 };
    } catch (error) {
      warn(`${label} grading: ${error.message} (the site grades these instead).`);
      return { graded: 0, tokens: 0 };
    }
  };

  // Phase 4e: rewrite queued Speed questions as Live ones, grade the rewrites, post them. A failure leaves the
  // requests queued, so the next night's brief sends them again.
  const convert = async (game, prompt) => {
    let found;
    let tokens = 0;
    try {
      const result = await codex(prompt);
      tokens += result.tokens ?? 0;
      found = conversionItems(result.output, prompt.conversions);
    } catch (error) {
      if (error.login) { login = true; return; }
      warn(`${game} conversions: ${error.message}`);
      failed = true;
      return;
    }
    const scored = await grade(`${game} conversions`, found.rewrites, prompt.grade);
    tokens += scored.tokens;
    const items = conversionPost(found);
    if (!items.length) { warn(`${game} conversions: nothing returned.`); failed = true; return; }
    const sent = await api("/api/question-writer/conversions", { method: "POST", body: JSON.stringify({ graderModel: model, items }) });
    if (sent.status !== 200 || !sent.body.ok) { warn(`${game} conversions: not saved (${sent.status} ${sent.body.code ?? ""}).`); failed = true; return; }
    log(JSON.stringify({ game, conversions: prompt.conversions.length, rewritten: found.rewrites.length, declined: found.declines.length,
      graded: scored.graded, received: sent.body.received, declinedReceived: sent.body.declined, already: sent.body.already, invalid: sent.body.invalid, tokens }));
  };

  for (const game of games) {
    const { status, body: brief } = await api(`/api/question-writer/brief?game=${encodeURIComponent(game)}`);
    if (status !== 200 || !brief.ok || !Array.isArray(brief.prompts)) { warn(`${game}: brief unavailable (${status}).`); failed = true; continue; }
    const items = [];
    const seen = new Set();
    let tokens = 0;
    let graded = 0;
    const conversion = brief.prompts.find((prompt) => prompt.kind === "conversion");
    for (const prompt of brief.prompts.filter((p) => p.kind !== "conversion")) {
      let written = [];
      try {
        const result = await codex(prompt);
        tokens += result.tokens ?? 0;
        const picked = writtenItems(result.output, prompt.slots, seen);
        written = picked.written;
        if (picked.dropped) warn(`${game} ${prompt.kind}: ${picked.dropped} repeated slot(s) dropped.`);
      } catch (error) {
        if (error.login) { login = true; break; }
        warn(`${game} ${prompt.kind}: ${error.message}`);
        failed = true;
      }
      items.push(...written);
      const scored = await grade(`${game} ${prompt.kind}`, written, prompt.grade);
      tokens += scored.tokens;
      graded += scored.graded;
    }
    if (!items.length) { if (!login) { warn(`${game}: nothing written.`); failed = true; } }
    else {
      const sent = await api("/api/question-writer/candidates", { method: "POST", body: JSON.stringify({ game, model, graderModel: model, items }) });
      if (sent.status !== 200 || !sent.body.ok) { warn(`${game}: not saved (${sent.status} ${sent.body.code ?? ""}).`); failed = true; }
      else log(JSON.stringify({ game, written: items.length, graded, received: sent.body.received, invalid: sent.body.invalid,
        gradedReceived: sent.body.graded, idempotent: sent.body.idempotent, tokens }));
    }
    if (login) break;
    if (conversion) await convert(game, conversion);
    if (login) break;
  }
  return { failed, login };
};
