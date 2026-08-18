import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "source", "manual.md");

function compactWhitespace(value) {
  return value.replace(/\s+/gu, "");
}

function isQuestionLine(line) {
  return /^問[0-9０-９]+[－-][0-9０-９]+/u.test(line.trim());
}

function shouldPreserveLine(line) {
  const trimmed = line.trim();
  return (
    !trimmed ||
    trimmed.startsWith("|") ||
    /^[-:| ]{3,}$/u.test(trimmed) ||
    /^#{1,6}\s/u.test(trimmed) ||
    /^```/u.test(trimmed) ||
    isQuestionLine(trimmed)
  );
}

function splitAfterJapanesePeriods(line) {
  const parts = [];
  let current = "";
  const openingBrackets = new Set(["（", "(", "「", "『", "【", "〔", "〈", "《"]);
  const closingBrackets = new Set(["）", ")", "」", "』", "】", "〕", "〉", "》"]);
  let bracketDepth = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    current += char;

    if (openingBrackets.has(char)) bracketDepth += 1;
    if (closingBrackets.has(char)) bracketDepth = Math.max(0, bracketDepth - 1);

    if (char !== "。" || bracketDepth > 0) continue;

    while (/[）」』】〕〉》]/u.test(line[index + 1] ?? "")) {
      index += 1;
      current += line[index];
    }

    const next = line[index + 1] ?? "";
    if (next && !/\s/u.test(next)) {
      parts.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts.length > 1 ? parts : [line.trimEnd()];
}

function repairSplitContinuations(lines) {
  const repaired = [];
  const continuationPattern = /^(?:[、。，．]|に|の|を|が|は|と|で|へ|から|より|や|及び|並びに|又は|若しくは|等|第|附則)/u;
  const openingBrackets = /[（(「『【〔〈《]/gu;
  const closingBrackets = /[）)」』】〕〉》]/gu;

  function hasUnclosedBracket(value) {
    const openCount = value.match(openingBrackets)?.length ?? 0;
    const closeCount = value.match(closingBrackets)?.length ?? 0;
    return openCount > closeCount;
  }

  for (const line of lines) {
    const previous = repaired.at(-1) ?? "";
    if (
      previous &&
      !shouldPreserveLine(previous) &&
      !shouldPreserveLine(line)
      && (
        hasUnclosedBracket(previous) ||
        (previous.endsWith("。）") && continuationPattern.test(line.trimStart()))
      )
    ) {
      repaired[repaired.length - 1] = `${previous}${line.trimStart()}`;
      continue;
    }
    repaired.push(line);
  }

  return repaired;
}

function formatManual(source) {
  const hasCrLf = source.includes("\r\n");
  const eol = hasCrLf ? "\r\n" : "\n";
  const lines = repairSplitContinuations(source.split(/\r?\n/));
  const formatted = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^```/u.test(line.trim())) {
      inCodeFence = !inCodeFence;
      formatted.push(line);
      continue;
    }

    if (inCodeFence || shouldPreserveLine(line)) {
      formatted.push(line);
      continue;
    }

    formatted.push(...splitAfterJapanesePeriods(line));
  }

  return formatted.join(eol);
}

const source = await readFile(sourcePath, "utf8");
const formatted = formatManual(source);

if (compactWhitespace(source) !== compactWhitespace(formatted)) {
  throw new Error("Formatting changed non-whitespace content in source/manual.md");
}

if (source !== formatted) {
  await writeFile(sourcePath, formatted, "utf8");
}

const changedLineCount = formatted.split(/\r?\n/).length - source.split(/\r?\n/).length;
console.log(`Formatted source/manual.md. Added ${changedLineCount} line breaks without changing non-whitespace content.`);
