import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

const readJson = async (name) => JSON.parse(await readFile(path.join(dataDir, name), "utf8"));

const qa = await readJson("qa-index.json");
const manual = await readJson("manual-index.json");
const toc = await readJson("toc.json");
const metadata = await readJson("metadata.json");

assert.equal(qa.length, 111, "Q&A count must match actual question headings in the source MD");
assert.equal(new Set(qa.map((item) => item.id)).size, qa.length, "Q&A IDs must be unique");

for (const item of qa) {
  assert.ok(item.id.startsWith("qa-"), `invalid id: ${item.id}`);
  assert.ok(item.questionNo, `missing questionNo: ${item.id}`);
  assert.ok(item.question, `missing question: ${item.id}`);
  assert.ok(item.answer, `missing answer: ${item.id}`);
  assert.ok(item.categoryLabel, `missing category: ${item.id}`);
  assert.ok(item.normalizedText.length > item.question.length, `normalized text looks too sparse: ${item.id}`);
}

assert.ok(manual.length > 100, "manual index should contain body chunks");
assert.ok(toc.sections.length > 10, "toc should contain section entries");
assert.equal(metadata.qaCount, qa.length, "metadata qaCount should match");
assert.equal(metadata.manualChunkCount, manual.length, "metadata manualChunkCount should match");

const vacation = qa.find((item) => item.id === "qa-10-1");
assert.ok(vacation, "問１０－１ should exist");
assert.match(vacation.normalizedText, /休暇/);
assert.doesNotMatch(vacation.answer, /^問10-2/m, "an answer must not include the next question heading");

for (const splitId of ["qa-13-11-1", "qa-13-11-2", "qa-13-11-3", "qa-18-2-1", "qa-18-2-2"]) {
  assert.ok(qa.some((item) => item.id === splitId), `split question must exist: ${splitId}`);
}

assert.equal(
  qa.filter((item) => /^qa-1-11(?:-|$)/.test(item.id)).length,
  1,
  "answer references such as 問1-11で示したとおり must not become extra questions"
);

console.log(`Validated ${qa.length} Q&A items and ${manual.length} manual chunks.`);
