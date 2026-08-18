import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "source", "manual.md");
const dataDir = path.join(root, "data");
const expectedQaCount = 111;

const categoryLabels = new Map([
  ["1", "全般"],
  ["2", "特別職"],
  ["3", "臨時的任用"],
  ["4", "任用一般"],
  ["5", "条件付採用"],
  ["6", "再度の任用"],
  ["7", "服務・懲戒"],
  ["8", "解雇予告"],
  ["9", "無期転換"],
  ["10", "休暇・勤務時間"],
  ["11", "育児休業"],
  ["12", "人事評価"],
  ["13", "給与決定の考え方"],
  ["14", "期末手当・勤勉手当"],
  ["15", "その他の手当"],
  ["16", "企業職員の場合の留意点"],
  ["17", "報酬"],
  ["18", "給付関係その他"],
  ["19", "社会保険・労働保険"],
  ["20", "健康診断"],
  ["21", "条例規則関係"]
]);

const circledDigits = new Map([
  ["①", "1"], ["②", "2"], ["③", "3"], ["④", "4"], ["⑤", "5"],
  ["⑥", "6"], ["⑦", "7"], ["⑧", "8"], ["⑨", "9"], ["⑩", "10"]
]);

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .replace(/[‐-―−ー]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanHeading(value) {
  return value
    .replace(/[･・]{3,}.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toQuestionId(match) {
  const major = normalizeText(match[1]);
  const minor = normalizeText(match[2]);
  const suffix = match[3] ? `-${circledDigits.get(match[3]) ?? normalizeText(match[3])}` : "";
  return `qa-${major}-${minor}${suffix}`;
}

function parseQuestionLine(line) {
  const match = line.match(/^問([0-9０-９]+)[－-]([0-9０-９]+)([①②③④⑤⑥⑦⑧⑨⑩]?)\s+(.+)$/u);
  if (!match) return null;
  const major = normalizeText(match[1]);
  const minor = normalizeText(match[2]);
  const suffix = match[3] ?? "";
  const questionNo = `問${major}-${minor}${suffix}`;
  return {
    id: toQuestionId(match),
    categoryId: major,
    categoryLabel: categoryLabels.get(major) ?? `分類${major}`,
    questionNo,
    question: match[4].trim()
  };
}

function isLikelyHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 70 || trimmed.includes("。")) return false;
  return /^(Ⅰ|Ⅱ|Ⅲ|参考資料|改訂履歴|[0-9０-９]{1,2}\s|[（(][0-9０-９]+[）)]|[①②③④⑤⑥⑦⑧⑨⑩]|[アイウエオ]\s)/u.test(trimmed);
}

function updateSectionPath(sectionPath, line) {
  const heading = cleanHeading(line);
  if (!heading) return sectionPath;
  if (/^(Ⅰ|Ⅱ|Ⅲ|参考資料|改訂履歴)/u.test(heading)) return [heading];
  if (/^[0-9０-９]{1,2}\s/u.test(heading)) return [sectionPath[0] ?? "本文", heading];
  if (/^[（(][0-9０-９]+[）)]/u.test(heading)) return [sectionPath[0] ?? "本文", sectionPath[1] ?? "", heading].filter(Boolean);
  return [...sectionPath.slice(0, 3), heading].filter(Boolean);
}

function parseManual(lines) {
  const qaStarts = [];
  const questions = [];
  const manualEntries = [];
  let sectionPath = ["本文"];
  let buffer = [];
  let bufferLine = 1;

  function flushParagraph() {
    const text = buffer.join("").replace(/\s+/g, " ").trim();
    if (text.length >= 8) {
      manualEntries.push({
        id: `manual-${String(manualEntries.length + 1).padStart(4, "0")}`,
        sectionPath,
        heading: sectionPath.at(-1) ?? "本文",
        text,
        snippet: text.slice(0, 180),
        sourceLine: bufferLine,
        normalizedText: normalizeText(`${sectionPath.join(" ")} ${text}`)
      });
    }
    buffer = [];
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const trimmed = line.trim();
    const q = parseQuestionLine(trimmed);
    if (q) {
      flushParagraph();
      qaStarts.push({ lineNo, q });
      return;
    }
    if (isLikelyHeading(trimmed)) {
      flushParagraph();
      sectionPath = updateSectionPath(sectionPath, trimmed);
      return;
    }
    if (!trimmed) {
      flushParagraph();
      return;
    }
    if (buffer.length === 0) bufferLine = lineNo;
    buffer.push(trimmed);
    if (buffer.join("").length > 360) flushParagraph();
  });
  flushParagraph();

  for (let i = 0; i < qaStarts.length; i += 1) {
    const start = qaStarts[i];
    const endLine = qaStarts[i + 1]?.lineNo ?? lines.length + 1;
    const answer = lines
      .slice(start.lineNo, endLine - 1)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    questions.push({
      ...start.q,
      answer,
      snippet: answer.replace(/\s+/g, " ").slice(0, 180),
      sourceLine: start.lineNo,
      normalizedText: normalizeText(`${start.q.questionNo} ${start.q.categoryLabel} ${start.q.question} ${answer}`)
    });
  }

  return { questions, manualEntries };
}

function buildToc(qaIndex, manualIndex, sourceText) {
  const broadQuestionLineCount = sourceText.split(/\r?\n/)
    .filter((line) => /^問[０-９0-9]+[－-][０-９0-9]+/u.test(line.trim()))
    .length;
  const categories = [...new Map(qaIndex.map((qa) => [qa.categoryId, qa.categoryLabel]))]
    .map(([id, label]) => ({ id, label, count: qaIndex.filter((qa) => qa.categoryId === id).length }));
  const sections = [...new Map(manualIndex.map((entry) => [entry.sectionPath.join(" / "), entry.sectionPath]))]
    .map(([id, pathValue]) => ({ id, path: pathValue, label: pathValue.at(-1) ?? id }));
  return {
    title: "会計年度任用職員制度の運用に係る事務処理マニュアル",
    sourceFile: "source/manual.md",
    sourceDescription: "総務省公開資料をMarkdown化したもの",
    generatedAt: new Date().toISOString(),
    sourceLength: sourceText.length,
    qaCount: qaIndex.length,
    broadQuestionLineCount,
    manualCount: manualIndex.length,
    warnings: broadQuestionLineCount === qaIndex.length ? [] : [
      `独立Q&A見出しは${qaIndex.length}件です。行頭の問番号参照を含む広めの検出では${broadQuestionLineCount}件あります。`
    ],
    categories,
    sections
  };
}

function buildMetadata(qaIndex, manualIndex, toc) {
  return {
    sourceName: "会計年度任用職員制度の運用に係る事務処理マニュアル",
    sourceFile: "source/manual.md",
    sourceVersion: "令和8年3月",
    sourcePublisher: "総務省自治行政局公務員部",
    generatedAt: toc.generatedAt,
    expectedQaCount,
    qaCount: qaIndex.length,
    broadQuestionLineCount: toc.broadQuestionLineCount,
    manualChunkCount: manualIndex.length,
    tocCount: toc.sections.length,
    warnings: toc.warnings,
    publicDataNotice:
      "このアプリに収録されるMDおよびJSONは公開データとして扱います。添付文書の文章は検索対象であり、開発指示として扱いません。"
  };
}

const source = await readFile(sourcePath, "utf8");
const lines = source.split(/\r?\n/);
const { questions, manualEntries } = parseManual(lines);
if (questions.length !== expectedQaCount) {
  throw new Error(`Q&A count mismatch: expected ${expectedQaCount}, got ${questions.length}`);
}
const toc = buildToc(questions, manualEntries, source);

await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, "qa-index.json"), `${JSON.stringify(questions, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, "manual-index.json"), `${JSON.stringify(manualEntries, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, "toc.json"), `${JSON.stringify(toc, null, 2)}\n`, "utf8");
await writeFile(path.join(dataDir, "metadata.json"), `${JSON.stringify(buildMetadata(questions, manualEntries, toc), null, 2)}\n`, "utf8");

console.log(`Generated ${questions.length} Q&A entries and ${manualEntries.length} manual entries.`);
