const state = {
  qa: [],
  manual: [],
  toc: [],
  metadata: null,
  qaListMode: true,
  selectedResultId: null,
};

const keywordPresets = [
  { label: "給与", query: "給与" },
  { label: "給料", query: "給料" },
  { label: "報酬", query: "報酬" },
  { label: "期末手当", query: "期末手当" },
  { label: "勤勉手当", query: "勤勉手当" },
  { label: "勤務時間", query: "勤務時間" },
  { label: "休暇", query: "休暇" },
  { label: "任期", query: "任期" },
  { label: "再度の任用", query: "再度の任用" },
  { label: "再度任用", query: "再度任用" },
];

const queryInput = document.querySelector("#query");
const keywordPresetsEl = document.querySelector("#keyword-presets");
const qaListButton = document.querySelector("#qa-list-button");
const resultsEl = document.querySelector("#results");
const summaryEl = document.querySelector("#summary");
const filterEl = document.querySelector("#filter");
const metadataEl = document.querySelector("#metadata");
const detailEl = document.querySelector("#detail");

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―ー－]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function terms() {
  return normalizeText(queryInput.value).split(" ").filter(Boolean);
}

function activeMode() {
  return document.querySelector("input[name='mode']:checked").value;
}

function score(item, searchTerms) {
  if (searchTerms.length === 0) return 0;
  const text = item.normalizedText;
  if (!searchTerms.every((term) => text.includes(term))) return 0;

  let value = item.type === "qa" ? 5 : 2;
  for (const term of searchTerms) {
    const hits = text.split(term).length - 1;
    value += hits;
    if (item.titleNormalized?.includes(term)) value += 6;
  }
  return value;
}

function snippet(value, searchTerms, limit = 180) {
  const plain = value.replace(/\s+/g, " ").trim();
  if (plain.length <= limit) return highlight(plain, searchTerms);
  const normalized = normalizeText(plain);
  const firstHit = searchTerms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstHit - 50);
  const end = Math.min(plain.length, start + limit);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < plain.length ? "..." : "";
  return `${prefix}${highlight(plain.slice(start, end), searchTerms)}${suffix}`;
}

function highlight(value, searchTerms) {
  let html = escapeHtml(value);
  for (const term of searchTerms.filter((item) => item.length > 1)) {
    const escaped = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(escaped, "gi"), (match) => `<mark>${match}</mark>`);
  }
  return html;
}

function isTableLine(line) {
  return /^\s*\|.+\|\s*$/.test(line) || line.includes("\t");
}

function isListLine(line) {
  return /^\s*(?:[-*・]|[0-9０-９]+[.)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/u.test(line);
}

function splitSentences(value) {
  const sentences = [];
  let current = "";
  const closers = new Set(["」", "』", "）", ")", "】", "］", "]"]);
  const chars = [...value];
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    current += char;
    if (!/[。！？]/u.test(char)) continue;
    while (closers.has(chars[index + 1])) {
      index += 1;
      current += chars[index];
    }
    sentences.push(current.trim());
    current = "";
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

function splitReadableParagraph(value) {
  const compact = value.replace(/[ \t]+/g, " ").trim();
  if (compact.length <= 160) return [compact];

  const sentences = splitSentences(compact);
  if (sentences.length <= 1) return [compact];

  const groups = [];
  let group = "";
  let count = 0;
  for (const sentence of sentences) {
    const next = group ? `${group}${sentence}` : sentence;
    if (group && (next.length > 190 || count >= 2)) {
      groups.push(group);
      group = sentence;
      count = 1;
      continue;
    }
    group = next;
    count += 1;
  }
  if (group) groups.push(group);
  return groups;
}

function renderReadableText(value, searchTerms) {
  const blocks = [];
  let current = [];
  let currentType = "";

  function flush() {
    if (current.length === 0) return;
    blocks.push({ type: currentType, lines: current });
    current = [];
    currentType = "";
  }

  for (const rawLine of value.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const type = isTableLine(line) ? "table" : isListLine(line) ? "list" : "paragraph";
    if (current.length > 0 && type !== currentType) flush();
    currentType = type;
    current.push(line);
  }
  flush();

  return blocks.map((block) => {
    if (block.type === "table") {
      return `<div class="detail-table" role="region" aria-label="表形式テキスト"><pre>${highlight(block.lines.join("\n"), searchTerms)}</pre></div>`;
    }
    if (block.type === "list") {
      return `<div class="detail-list">${block.lines.map((line) => `<p>${highlight(line, searchTerms)}</p>`).join("")}</div>`;
    }
    return splitReadableParagraph(block.lines.join(" "))
      .map((paragraph) => `<p>${highlight(paragraph, searchTerms)}</p>`)
      .join("");
  }).join("");
}

function buildQaItems() {
  return state.qa.map((item) => ({
    ...item,
    type: "qa",
    title: `${item.questionNo} ${item.question}`,
    titleNormalized: normalizeText(`${item.questionNo} ${item.question}`),
    filterKey: `qa:${item.categoryLabel}`,
  }));
}

function buildManualItems() {
  return state.manual.map((item) => ({
    ...item,
    type: "manual",
    title: item.sectionPath.at(-1) || "本文",
    titleNormalized: normalizeText(item.sectionPath.join(" ")),
    filterKey: `manual:${item.sectionPath[0] || "本文"}`,
  }));
}

function buildItems() {
  const qaItems = buildQaItems();
  const manualItems = buildManualItems();
  const mode = activeMode();
  if (mode === "qa") return qaItems;
  if (mode === "manual") return manualItems;
  return [...qaItems, ...manualItems];
}

function buildAllItems() {
  return [...buildQaItems(), ...buildManualItems()];
}

function findItemById(id) {
  return buildAllItems().find((entry) => entry.id === id);
}

function detailElementId(item) {
  return `detail-inline-${item.id.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function resultButtonA11yAttrs(item, isSelected) {
  const controls = isSelected ? ` aria-controls="${escapeHtml(detailElementId(item))}"` : "";
  return `aria-expanded="${isSelected}"${controls}`;
}

function focusResultButton(id) {
  const button = resultsEl.querySelector(`button[data-result-id="${CSS.escape(id)}"]`);
  button?.focus({ preventScroll: true });
}

function clearSelection() {
  state.selectedResultId = null;
  detailEl.innerHTML = "<h2>詳細</h2><p>検索結果を選択すると、該当するQ&amp;Aまたは本文を表示します。</p>";
}

function renderFilters() {
  const current = filterEl.value;
  const labels = new Map();
  const filterItems = state.qaListMode ? buildQaItems() : buildItems();
  for (const item of filterItems) {
    labels.set(item.filterKey, item.filterKey.replace(/^qa:/, "Q&A: ").replace(/^manual:/, "本文: "));
  }
  filterEl.innerHTML = `<option value="">すべて</option>${[...labels.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "ja"))
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("")}`;
  if (labels.has(current)) filterEl.value = current;
}

function updateKeywordPresetState() {
  const currentQuery = normalizeText(queryInput.value);
  keywordPresetsEl.querySelectorAll("button").forEach((button) => {
    const isActive = normalizeText(button.dataset.query || "") === currentQuery;
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderKeywordPresets() {
  keywordPresetsEl.innerHTML = keywordPresets.map((preset) => `<button
    class="keyword-preset"
    type="button"
    data-query="${escapeHtml(preset.query)}"
    aria-pressed="false"
    aria-label="${escapeHtml(`${preset.label}で検索`)}"
  >${escapeHtml(preset.label)}</button>`).join("");
  updateKeywordPresetState();
}

function updateQaListButtonState() {
  qaListButton.setAttribute("aria-pressed", String(state.qaListMode));
}

function renderQaList() {
  const filterValue = filterEl.value;
  const qaItems = buildQaItems()
    .filter((item) => !filterValue || item.filterKey === filterValue)
    .sort((a, b) => a.sourceLine - b.sourceLine);

  summaryEl.textContent = `Q&A一覧 ${qaItems.length}件を表示しています。`;
  let currentCategory = "";
  resultsEl.innerHTML = qaItems.map((item) => {
    const isSelected = state.selectedResultId === item.id;
    const categoryHeading = item.categoryLabel !== currentCategory
      ? `<h2 class="qa-index-category">${escapeHtml(item.categoryLabel)}</h2>`
      : "";
    currentCategory = item.categoryLabel;
    return `${categoryHeading}<article class="result qa-index-item${isSelected ? " is-selected" : ""}" data-result-id="${escapeHtml(item.id)}">
      <button class="result-select qa-index-select" type="button" data-result-id="${escapeHtml(item.id)}" ${resultButtonA11yAttrs(item, isSelected)}>
        <span class="qa-index-number">${escapeHtml(item.questionNo)}</span>
        <span class="qa-index-question">${escapeHtml(item.question)}</span>
      </button>
      ${isSelected ? renderInlineDetail(item, terms()) : ""}
    </article>`;
  }).join("");
  const selected = state.selectedResultId ? findItemById(state.selectedResultId) : null;
  if (selected) renderDetail(selected, terms());
  else detailEl.innerHTML = "<h2>回答</h2><p>中央のQ&amp;Aを選択すると、回答全文を表示します。</p>";
}

function render() {
  renderFilters();
  updateKeywordPresetState();
  updateQaListButtonState();
  if (state.qaListMode) {
    renderQaList();
    return;
  }
  const searchTerms = terms();
  const filterValue = filterEl.value;
  if (searchTerms.length === 0) {
    summaryEl.textContent = "検索語を入力してください。";
    resultsEl.innerHTML = "";
    clearSelection();
    return;
  }

  const ranked = buildItems()
    .filter((item) => !filterValue || item.filterKey === filterValue)
    .map((item) => ({ item, score: score(item, searchTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.sourceLine - b.item.sourceLine)
    .slice(0, 50);

  summaryEl.textContent = ranked.length > 0 ? `${ranked.length}件を表示しています。` : "該当する結果はありません。検索語を減らしてください。";
  resultsEl.innerHTML = ranked.map(({ item }) => {
    const isQa = item.type === "qa";
    const body = isQa ? item.answer : item.text;
    const badge = isQa ? "Q&A" : "本文";
    const source = isQa ? `${item.categoryLabel} / ${item.questionNo} / 行 ${item.sourceLine}` : `${item.sectionPath.join(" / ")} / 行 ${item.sourceLine}`;
    const isSelected = state.selectedResultId === item.id;
    return `<article class="result${isSelected ? " is-selected" : ""}" data-result-id="${escapeHtml(item.id)}">
      <button class="result-select" type="button" data-result-id="${escapeHtml(item.id)}" ${resultButtonA11yAttrs(item, isSelected)}>
        <div class="result-head"><span class="badge">${badge}</span><span class="source">${escapeHtml(source)}</span></div>
        <h2>${highlight(item.title, searchTerms)}</h2>
        <p>${snippet(body, searchTerms)}</p>
      </button>
      ${isSelected ? renderInlineDetail(item, searchTerms) : ""}
    </article>`;
  }).join("");
  const selected = state.selectedResultId ? ranked.find(({ item }) => item.id === state.selectedResultId)?.item : null;
  if (selected) renderDetail(selected, searchTerms);
  else if (ranked[0]) renderDetail(ranked[0].item, searchTerms);
  else detailEl.innerHTML = "<h2>詳細</h2><p>表示できる結果がありません。</p>";
}

function renderDetailHtml(item, searchTerms = terms(), options = {}) {
  const isQa = item.type === "qa";
  const body = isQa ? item.answer : item.text;
  const source = isQa ? `${item.categoryLabel} / ${item.questionNo} / MD ${item.sourceLine}行目` : `${item.sectionPath.join(" / ")} / MD ${item.sourceLine}行目`;
  const closeButton = options.closable ? `<button class="inline-detail-close" type="button" data-close-detail>閉じる</button>` : "";
  return `<div class="detail-heading-row">
      <div class="result-head"><span class="badge">${isQa ? "公式Q&A" : "マニュアル本文"}</span><span class="source">${escapeHtml(source)}</span></div>
      ${closeButton}
    </div>
    <h2>${highlight(item.title, searchTerms)}</h2>
    <div class="detail-body">${renderReadableText(body, searchTerms)}</div>`;
}

function renderDetail(item, searchTerms = terms()) {
  detailEl.innerHTML = renderDetailHtml(item, searchTerms);
}

function renderInlineDetail(item, searchTerms = terms()) {
  return `<div id="${escapeHtml(detailElementId(item))}" class="inline-detail">
    ${renderDetailHtml(item, searchTerms, { closable: true })}
  </div>`;
}

function selectResult(id) {
  const item = findItemById(id);
  if (!item) return;
  state.selectedResultId = id;
  render();
  focusResultButton(id);
}

async function loadJson(name) {
  const response = await fetch(`./data/${name}`);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.json();
}

async function init() {
  try {
    const [qa, manual, toc, metadata] = await Promise.all([
      loadJson("qa-index.json"),
      loadJson("manual-index.json"),
      loadJson("toc.json"),
      loadJson("metadata.json"),
    ]);
    state.qa = qa;
    state.manual = manual;
    state.toc = toc;
    state.metadata = metadata;
    metadataEl.textContent = `${metadata.sourceVersion} / Q&A ${metadata.qaCount}件 / 本文 ${metadata.manualChunkCount}件`;
    qaListButton.textContent = `Q&A一覧（${metadata.qaCount}件）`;
    const params = new URLSearchParams(location.search);
    queryInput.value = params.get("q") || "";
    const requestedView = params.get("view");
    state.qaListMode = requestedView === "qa-list" || (requestedView !== "search" && !queryInput.value.trim());
    const mode = params.get("mode");
    const modeInput = mode ? document.querySelector(`input[name='mode'][value='${CSS.escape(mode)}']`) : null;
    if (modeInput) modeInput.checked = true;
    render();
    filterEl.value = params.get("filter") || "";
    render();
    queryInput.focus({ preventScroll: true });
  } catch (error) {
    summaryEl.textContent = "検索データの読込に失敗しました。";
    metadataEl.textContent = String(error.message || error);
  }
}

function updateUrl() {
  const params = new URLSearchParams(location.search);
  if (!state.qaListMode && queryInput.value.trim()) params.set("q", queryInput.value.trim());
  else params.delete("q");
  const mode = activeMode();
  if (mode === "all") params.delete("mode");
  else params.set("mode", mode);
  if (filterEl.value) params.set("filter", filterEl.value);
  else params.delete("filter");
  if (state.qaListMode) params.set("view", "qa-list");
  else if (!queryInput.value.trim()) params.set("view", "search");
  else params.delete("view");
  history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);
}

queryInput.addEventListener("input", () => {
  state.qaListMode = false;
  clearSelection();
  updateUrl();
  render();
});
keywordPresetsEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-query]");
  if (!button) return;
  state.qaListMode = false;
  clearSelection();
  queryInput.value = button.dataset.query || "";
  updateUrl();
  render();
});
qaListButton.addEventListener("click", () => {
  state.qaListMode = !state.qaListMode;
  clearSelection();
  if (state.qaListMode) {
    queryInput.value = "";
    filterEl.value = "";
  }
  updateUrl();
  render();
});
filterEl.addEventListener("change", () => {
  clearSelection();
  render();
  updateUrl();
});
resultsEl.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-detail]");
  if (closeButton) {
    const previousResultId = state.selectedResultId;
    clearSelection();
    render();
    if (previousResultId) focusResultButton(previousResultId);
    return;
  }
  const button = event.target.closest("button[data-result-id]");
  if (!button) return;
  selectResult(button.dataset.resultId);
});
document.querySelectorAll("input[name='mode']").forEach((input) => input.addEventListener("change", () => {
  state.qaListMode = false;
  clearSelection();
  updateUrl();
  render();
}));

renderKeywordPresets();
init();
