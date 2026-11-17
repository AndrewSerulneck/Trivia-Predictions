/* Append-only Publish for Live Trivia (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c step 5; D10).
 * Pure functions: no I/O. The caller reads the current files from `main` and commits what this returns.
 *
 * The canonical Live Trivia JSON is never rebuilt: kept candidates are APPENDED as text after the last existing
 * entry, so every existing byte before that point is unchanged (checked here, before anything is returned).
 * Existing entries are never changed, reordered or removed. The only file this may create is a new category's
 * file (Current Events, D11). Candidate text is DATA.
 */
const { isDeepStrictEqual } = require('node:util');
const cats = require('./categories.cjs');
const { questionKey } = require('./repeats.cjs');

const MAX_SLUG = 90;
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

class PublishError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const parseLiveFile = (text, path = 'file') => {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new PublishError('unreadable', `${path} is not valid JSON.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.questions)) {
    throw new PublishError('unreadable', `${path} has no questions array.`);
  }
  return parsed;
};

const indent = (text, pad) => text.split('\n').map(line => pad + line).join('\n');

/**
 * Append entries to one category file's text. Throws unless the result parses, keeps every other key as it was,
 * and its questions are exactly the old ones followed by the new ones, with the old text unchanged up to the end of
 * the last old entry.
 */
const appendEntries = (text, entries, path = 'file') => {
  if (!entries.length) return text;
  const before = parseLiveFile(text, path);
  const keys = Object.keys(before);
  if (keys[keys.length - 1] !== 'questions') throw new PublishError('layout', `${path}: "questions" must be the last key.`);
  let prefix, suffix, body;
  const empty = /("questions"\s*:\s*\[)\s*\](\s*\}\s*)$/.exec(text);
  if (before.questions.length === 0 && empty) {
    prefix = text.slice(0, empty.index + empty[1].length);
    suffix = `\n  ]${empty[2]}`;
    body = `\n${entries.map(e => indent(JSON.stringify(e, null, 2), '    ')).join(',\n')}`;
  } else {
    const end = /\n([ \t]*)\](\s*\}\s*)$/.exec(text);
    if (!end || !/\}\s*$/.test(text.slice(0, end.index))) throw new PublishError('layout', `${path}: can't find the end of the questions list.`);
    const lastEntry = /\n([ \t]*)\}\s*$/.exec(text.slice(0, end.index));
    const pad = lastEntry ? lastEntry[1] : '    ';
    prefix = text.slice(0, end.index).replace(/\s+$/, '');
    suffix = text.slice(prefix.length);
    body = `,\n${entries.map(e => indent(JSON.stringify(e, null, 2), pad)).join(',\n')}`;
  }
  const next = prefix + body + suffix;
  const after = parseLiveFile(next, path);
  const { questions: oldQs, ...oldRest } = before;
  const { questions: newQs, ...newRest } = after;
  if (!next.startsWith(prefix) || !isDeepStrictEqual(oldRest, newRest)
    || !isDeepStrictEqual(newQs.slice(0, oldQs.length), oldQs) || !isDeepStrictEqual(newQs.slice(oldQs.length), entries)) {
    throw new PublishError('append-check', `${path}: append check failed; nothing written.`);
  }
  return next;
};

/** A new category's file (the only file Publish may create). */
const newCategoryFile = (categoryName, entries) => {
  const text = `${JSON.stringify({ categoryName, questions: entries }, null, 2)}\n`;
  parseLiveFile(text);
  return text;
};

const cleanList = (values, answer) => {
  const seen = new Set([String(answer).toLowerCase().trim()]);
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

/**
 * The JSON entry for one candidate. Quick Review's edit (answer, acceptable answers) wins over the writer's.
 * A Current Events candidate already past its expiry is refused (`expired`): the importer would drop it at once.
 */
const buildEntry = (candidate, slug, today = new Date()) => {
  const payload = candidate.payload ?? {};
  const edit = candidate.edit ?? {};
  const category = String(payload.category ?? '');
  const answer = String(edit.answer ?? payload.answer ?? '').trim();
  const question = String(payload.question ?? '').trim();
  if (!question || !answer || !cats.LIVE_CATEGORY_FILES[category]) throw new PublishError('invalid-candidate', 'Invalid candidate.');
  const tag = candidate.tag ?? {};
  const entry = {
    slug, question, answer,
    acceptableAnswers: cleanList(edit.acceptableAnswers ?? payload.acceptableAnswers, answer),
    answer_format: 'write_in',
    category,
    difficulty: DIFFICULTIES.has(payload.difficulty) ? payload.difficulty : 'medium',
    subcategory: cats.subcategoryFor(category, tag.area ?? payload.area ?? null),
  };
  if (category === cats.CURRENT_EVENTS) {
    if (typeof tag.expiresOn !== 'string' || !/^\d{4}-\d{2}-01$/.test(tag.expiresOn)) throw new PublishError('invalid-candidate', 'Current Events needs an expiry.');
    if (cats.isExpiredLiveEntry({ expires_on: tag.expiresOn }, today)) throw new PublishError('expired', 'Already expired.');
    entry.expires_on = tag.expiresOn;
    if (typeof payload.sourceUrl === 'string' && payload.sourceUrl.startsWith('https://')) entry.sourceUrl = payload.sourceUrl;
  }
  return entry;
};

/** A fresh slug from the question (the importer's rule), unique against every slug in every file. */
const freshSlug = (question, taken) => {
  let base = cats.slugify(question);
  if (base.length > MAX_SLUG) base = base.slice(0, MAX_SLUG).replace(/-[^-]*$/, '') || base.slice(0, MAX_SLUG);
  base = base.replace(/-+$/, '') || 'live-question';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
};

/**
 * planPublish({ files, candidates, reserved?, today? }) -> { changes:[{path, content, created, added}],
 * published:[{id, slug}], already:[{id, slug}], refused:[{id, reason}] }.
 *   files       Map<path, text|null> for EVERY file in the Live directory on main (null = absent), plus the new
 *               category files candidates need. Slugs are checked across all of them.
 *   candidates  claimed rows: { id, payload, edit, tag }
 *   reserved    slugs used outside the Live JSON (trivia_questions.slug is one unique column shared with Speed,
 *               Phase 4c.9 #2): treated as taken.
 *   today       for the expiry rule (Date or YYYY-MM-DD; default now).
 * A candidate whose question is already in a file (a re-claimed Publish that did merge, or a hand-added twin) is
 * "already": settled with that entry's slug and never added again. An EXPIRED entry doesn't count (the importer treats
 * it as absent, Phase 4c.9 #3): its slug stays taken, but a matching candidate is published as a new entry.
 */
const planPublish = ({ files, candidates, reserved = new Set(), today = new Date() }) => {
  const taken = new Set(reserved);
  const questions = new Map();
  const parsed = new Map();
  for (const [path, text] of files) {
    if (text == null) continue;
    const data = parseLiveFile(text, path);
    parsed.set(path, data);
    for (const q of data.questions) {
      const slug = cats.slugify(String(q.slug ?? '') || String(q.question ?? ''));
      if (slug) taken.add(slug);
      if (cats.isExpiredLiveEntry(q, today)) continue;
      const key = questionKey(q.question);
      if (key && !questions.has(key)) questions.set(key, slug);
    }
  }
  const additions = new Map();
  const published = [], already = [], refused = [];
  for (const candidate of candidates) {
    const category = candidate.payload?.category;
    let path;
    try { path = cats.fileFor(category); } catch { refused.push({ id: candidate.id, reason: 'unknown-category' }); continue; }
    if (!files.has(path)) { refused.push({ id: candidate.id, reason: 'file-not-read' }); continue; }
    if (!parsed.has(path) && !cats.NEW_FILES.has(path.split('/').pop())) { refused.push({ id: candidate.id, reason: 'missing-file' }); continue; }
    const key = questionKey(candidate.payload?.question);
    if (key && questions.has(key)) { already.push({ id: candidate.id, slug: questions.get(key) }); continue; }
    const slug = freshSlug(candidate.payload.question, taken);
    let entry;
    try { entry = buildEntry(candidate, slug, today); } catch (error) { refused.push({ id: candidate.id, reason: error.code ?? 'invalid-candidate' }); continue; }
    taken.add(slug);
    questions.set(key, slug);
    if (!additions.has(path)) additions.set(path, []);
    additions.get(path).push(entry);
    published.push({ id: candidate.id, slug });
  }
  const changes = [];
  for (const [path, entries] of additions) {
    const text = files.get(path);
    const created = text == null;
    const categoryName = entries[0].category;
    changes.push({ path, created, added: entries.length, content: created ? newCategoryFile(categoryName, entries) : appendEntries(text, entries, path) });
  }
  return { changes, published, already, refused };
};

module.exports = { PublishError, parseLiveFile, appendEntries, newCategoryFile, buildEntry, freshSlug, planPublish };
