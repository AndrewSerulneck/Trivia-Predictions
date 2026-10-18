import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Finds the word "reward(s)" in ON-SCREEN text: string literals, template literals and JSX text in
// app/, components/ and lib/ .ts/.tsx files, plus llms.txt (identifiers, imports and comments are not
// text, so they never match). scripts/ and docs/ are deliberately not scanned.
// Used by tests/prizes-wording-contract.test.ts. Plan: docs/rewards-to-prizes-rename-plan.md.

export const REWARD_WORD = /\brewards?\b/i;

export type WordingHit = { file: string; text: string };

const SOURCE_DIRS = ["app", "components", "lib"];

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

export const wordingSourceFiles = (): string[] => SOURCE_DIRS.flatMap(walk).sort();

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

const textOf = (node: ts.Node): string | null => {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return node.text;
  }
  if (ts.isJsxText(node)) return node.text;
  return null;
};

/** Every literal in a source file whose text contains the word, whitespace-squashed. */
export const scanSource = (file: string, source: string): WordingHit[] => {
  // Most files never say the word: skip the TypeScript parse for them.
  if (!REWARD_WORD.test(source)) return [];
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const hits: WordingHit[] = [];
  const visit = (node: ts.Node): void => {
    const text = textOf(node);
    // Import / export specifiers are module paths, not words on screen.
    const isModulePath =
      ts.isStringLiteral(node) && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent));
    if (text !== null && !isModulePath && REWARD_WORD.test(text)) hits.push({ file, text: squash(text) });
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return hits;
};

export const scanLlmsTxt = (): WordingHit[] =>
  readFileSync("llms.txt", "utf8")
    .split("\n")
    .filter((line) => REWARD_WORD.test(line))
    .map((line) => ({ file: "llms.txt", text: squash(line) }));

export const scanAllWording = (): WordingHit[] => [
  ...wordingSourceFiles().flatMap((file) => scanSource(file, readFileSync(file, "utf8"))),
  ...scanLlmsTxt(),
];
