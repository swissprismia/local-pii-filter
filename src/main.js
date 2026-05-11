import { env, pipeline } from "@huggingface/transformers";
import "./styles.css";

const MODEL_ID = "openai/privacy-filter";
const LOCAL_MODEL_PATH = "/models/";
const LOCAL_MODEL_ONLY = import.meta.env.VITE_LOCAL_MODEL_ONLY === "true";
const MAX_DETECTION_CHARS = 3000;
const CHUNK_OVERLAP_CHARS = 200;
const SAMPLE_TEXT =
  "My name is Alice Smith. Email me at alice.smith@example.com or call +1 415 555 0199. My account number is 123456789.";

const state = {
  classifier: null,
  spans: [],
  inputText: SAMPLE_TEXT,
  outputText: SAMPLE_TEXT,
  redactionsApplied: false,
  busy: false,
  status: "Ready",
  mode: "tokenize",
  replacement: "[REDACTED]",
  threshold: 0.5,
  detectionRuns: [],
  progress: {
    active: false,
    percent: 0,
    label: "",
  },
  selectedLabels: new Set(),
  customKeywords: "",
  tokenMap: new Map(),
  detokenizeInput: "",
  detokenizedOutput: "",
  detokenizeApplied: false,
  bottomTab: "findings",
  toast: null,
};

let toastTimerId = null;

const CUSTOM_LABEL = "custom";

const labels = [
  "account_number",
  "private_address",
  "private_email",
  "private_person",
  "private_phone",
  "private_url",
  "private_date",
  "secret",
  CUSTOM_LABEL,
];

const app = document.querySelector("#app");

const EMBED_MODE = (() => {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return new URLSearchParams(window.location.search).has("embed");
})();

env.allowLocalModels = true;
env.localModelPath = LOCAL_MODEL_PATH;
if (LOCAL_MODEL_ONLY) {
  env.allowRemoteModels = false;
}

let lastReportedHeight = 0;
function reportEmbedHeight() {
  if (!EMBED_MODE) return;
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0,
  );
  if (height === lastReportedHeight) return;
  lastReportedHeight = height;
  try {
    window.parent.postMessage({ type: "prismia:resize", height }, "*");
  } catch {}
}

if (EMBED_MODE && typeof ResizeObserver !== "undefined") {
  const observer = new ResizeObserver(reportEmbedHeight);
  observer.observe(document.documentElement);
  if (document.body) observer.observe(document.body);
}

function render() {
  const visibleSpanCount = thresholdedSpans().length;
  const actionableSpanCount = filteredSpans().length;

  app.innerHTML = `
    <div class="app-frame ${EMBED_MODE ? "embed" : ""}">
      ${renderHeader()}

      <main class="shell">
        <section class="workspace">

        <div class="editor-grid">
          <section class="panel input-panel">
            <div class="panel-header">
              <h2>Input</h2>
              <button class="ghost" data-action="reset">Reset sample</button>
            </div>
            <textarea id="input" spellcheck="false" placeholder="Paste text here...">${escapeHtml(
              state.inputText,
            )}</textarea>
            <div class="actions">
              <button class="primary" data-action="analyze" ${state.busy ? "disabled" : ""}>
                ${state.busy ? "Analyzing..." : "Detect PII"}
              </button>
              <button class="ghost" data-action="clear">Clear</button>
              <span class="estimate">${renderEstimate()}</span>
            </div>
            <div class="custom-keywords">
              <label for="custom-keywords">
                Custom terms to redact
                <span class="hint">One per line or comma-separated. Whole-word, case-insensitive. Labeled <code>custom</code>.</span>
              </label>
              <textarea id="custom-keywords" spellcheck="false" placeholder="Acme Corp, OpenAI, ProjectX">${escapeHtml(
                state.customKeywords,
              )}</textarea>
            </div>
            ${renderProgress()}
          </section>

          <section class="panel output-panel">
            <div class="panel-header">
              <h2>Output</h2>
              <button class="ghost" data-action="copy" ${!state.outputText ? "disabled" : ""}>Copy</button>
            </div>
            <div class="output" id="output">${renderHighlightedText()}</div>
            <div class="redaction-controls">
              <label>
                Action
                <select id="mode">
                  <option value="replace" ${state.mode === "replace" ? "selected" : ""}>Replace with label</option>
                  <option value="custom" ${state.mode === "custom" ? "selected" : ""}>Replace with custom text</option>
                  <option value="mask" ${state.mode === "mask" ? "selected" : ""}>Mask characters</option>
                  <option value="remove" ${state.mode === "remove" ? "selected" : ""}>Remove</option>
                  <option value="tokenize" ${state.mode === "tokenize" ? "selected" : ""}>Tokenize (reversible)</option>
                </select>
              </label>
              <label class="${state.mode === "custom" ? "" : "is-disabled"}">
                Custom replacement
                <input id="replacement" type="text" value="${escapeHtml(state.replacement)}" ${
                  state.mode === "custom" ? "" : "disabled"
                } />
              </label>
              <button class="primary" data-action="apply" ${actionableSpanCount === 0 ? "disabled" : ""}>Apply</button>
            </div>
          </section>
        </div>

        ${renderBottomPanel()}
      </main>

      ${
        EMBED_MODE
          ? ""
          : `
        <footer class="footer">
          <div class="footer-inner">
            <div class="footer-brand">
              <img src="/assets/logo_icon_blue.svg" alt="PrismIA" />
              <span>© ${new Date().getFullYear()} PrismIA. All rights reserved.</span>
            </div>
            <span>Local browser inference for privacy review.</span>
          </div>
        </footer>
      `
      }
      ${renderToast()}
    </div>
  `;

  bindEvents();
  reportEmbedHeight();
}

function bindEvents() {
  document.querySelector("#input").addEventListener("input", (event) => {
    state.inputText = event.target.value;
    state.outputText = event.target.value;
    state.redactionsApplied = false;
    state.spans = [];
    state.selectedLabels.clear();
  });

  document.querySelector("#mode").addEventListener("change", (event) => {
    state.mode = event.target.value;
    render();
  });

  document.querySelector("#replacement").addEventListener("input", (event) => {
    state.replacement = event.target.value;
  });

  document.querySelector("#custom-keywords").addEventListener("input", (event) => {
    state.customKeywords = event.target.value;
  });

  const thresholdInput = document.querySelector("#threshold");
  if (thresholdInput) {
    thresholdInput.addEventListener("input", (event) => {
      state.threshold = Number(event.target.value);
      state.outputText = state.inputText;
      state.redactionsApplied = false;
      render();
    });
  }

  const detokenizeInput = document.querySelector("#detokenize-input");
  if (detokenizeInput) {
    detokenizeInput.addEventListener("input", (event) => {
      state.detokenizeInput = event.target.value;
      state.detokenizeApplied = false;
    });
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleAction);
  });

  document.querySelectorAll("[data-label]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selectedLabels.add(event.target.dataset.label);
      } else {
        state.selectedLabels.delete(event.target.dataset.label);
      }
      state.outputText = state.inputText;
      state.redactionsApplied = false;
      render();
    });
  });
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;

  if (action === "analyze") {
    await analyze();
    return;
  }

  if (action === "apply") {
    if (state.mode === "tokenize") {
      const { text, tokenMap } = tokenizeText(state.inputText, filteredSpans());
      state.outputText = text;
      state.tokenMap = tokenMap;
      state.status = `Tokenized ${tokenMap.size} unique value${tokenMap.size === 1 ? "" : "s"}`;
      state.redactionsApplied = true;
      state.bottomTab = "detokenize";
      render();
      try {
        await navigator.clipboard.writeText(text);
        showToast("Tokenized text copied to clipboard");
      } catch (error) {
        console.warn("Clipboard write failed", error);
        showToast("Tokenized — copy manually from Output");
      }
    } else {
      state.outputText = applyRedactions(state.inputText, filteredSpans());
      state.status = "Redactions applied";
      state.redactionsApplied = true;
      render();
    }
    return;
  }

  if (action === "clear") {
    state.inputText = "";
    state.outputText = "";
    state.redactionsApplied = false;
    state.spans = [];
    state.selectedLabels.clear();
    state.status = "Ready";
    render();
    return;
  }

  if (action === "reset") {
    state.inputText = SAMPLE_TEXT;
    state.outputText = SAMPLE_TEXT;
    state.redactionsApplied = false;
    state.spans = [];
    state.selectedLabels.clear();
    state.status = "Ready";
    render();
    return;
  }

  if (action === "copy") {
    await navigator.clipboard.writeText(state.outputText);
    state.status = "Copied output";
    showToast("Output copied to clipboard");
    return;
  }

  if (action === "tab") {
    state.bottomTab = event.currentTarget.dataset.tab;
    render();
    return;
  }

  if (action === "detokenize") {
    if (state.tokenMap.size === 0) {
      state.status = "No mapping available. Apply Tokenize first.";
      render();
      return;
    }
    state.detokenizedOutput = detokenizeText(state.detokenizeInput, state.tokenMap);
    state.detokenizeApplied = true;
    state.status = "Detokenized";
    render();
    return;
  }

  if (action === "copy-mapping") {
    if (state.tokenMap.size === 0) return;
    const json = JSON.stringify(Object.fromEntries(state.tokenMap), null, 2);
    await navigator.clipboard.writeText(json);
    state.status = "Copied mapping JSON";
    showToast("Mapping JSON copied to clipboard");
    return;
  }

  if (action === "copy-detokenized") {
    if (!state.detokenizedOutput) return;
    await navigator.clipboard.writeText(state.detokenizedOutput);
    state.status = "Copied detokenized text";
    showToast("Restored text copied to clipboard");
    return;
  }

  if (action === "clear-mapping") {
    state.tokenMap = new Map();
    state.detokenizeInput = "";
    state.detokenizedOutput = "";
    state.detokenizeApplied = false;
    state.status = "Mapping cleared";
    render();
    return;
  }
}

async function analyze() {
  let stopProgress = () => {};

  if (!state.inputText.trim()) {
    state.status = "Paste text before detecting";
    render();
    return;
  }

  state.outputText = state.inputText;
  state.redactionsApplied = false;
  state.busy = true;
  state.status = state.classifier ? "Analyzing text" : "Loading model";
  render();

  try {
    if (!state.classifier) {
      state.classifier = await loadClassifier();
    }

    const estimate = estimateDetectionMs(state.inputText.length);
    state.progress = {
      active: Boolean(estimate),
      percent: 0,
      label: estimate ? `0% of ${formatDuration(estimate)}` : "",
    };
    state.status = estimate
      ? `Analyzing text, estimated ${formatDuration(estimate)}`
      : "Analyzing text";
    render();

    if (estimate) {
      stopProgress = startEstimatedProgress(estimate);
    }

    const startedAt = performance.now();
    const modelSpans = await detectSpans(state.inputText);
    const detectionMs = performance.now() - startedAt;
    stopProgress(true);
    stopProgress = () => {};

    const keywordSpans = findKeywordSpans(state.inputText, state.customKeywords).filter(
      (ks) => !modelSpans.some((ms) => ks.start < ms.end && ks.end > ms.start),
    );

    state.spans = [...modelSpans, ...keywordSpans].sort((a, b) => a.start - b.start);
    recordDetectionRun(state.inputText.length, detectionMs);
    state.selectedLabels = new Set(state.spans.map((span) => span.label));
    state.status = `Detected ${state.spans.length} span${state.spans.length === 1 ? "" : "s"} in ${formatDuration(
      detectionMs,
    )}`;
  } catch (error) {
    stopProgress(false);
    stopProgress = () => {};
    console.error(error);
    state.status = `Error: ${error.message}`;
  } finally {
    stopProgress(false);
    state.progress = {
      active: false,
      percent: 0,
      label: "",
    };
    state.busy = false;
    render();
  }
}

async function loadClassifier() {
  const loadOptions = {
    dtype: "q4",
    local_files_only: LOCAL_MODEL_ONLY,
    progress_callback: updateProgress,
  };

  try {
    return await pipeline("token-classification", MODEL_ID, {
      ...loadOptions,
      device: "webgpu",
    });
  } catch (error) {
    console.warn("WebGPU load failed, falling back to WASM", error);
    state.status = "WebGPU unavailable, loading CPU fallback";
    render();
    return pipeline("token-classification", MODEL_ID, {
      ...loadOptions,
    });
  }
}

function updateProgress(progress) {
  if (!progress || !progress.status) return;

  if (progress.status === "progress" && progress.file) {
    const percent = Number.isFinite(progress.progress)
      ? ` ${Math.round(progress.progress)}%`
      : "";
    state.status = `Downloading ${progress.file}${percent}`;
  } else if (progress.status === "ready") {
    state.status = "Model ready";
  } else {
    state.status = progress.status;
  }

  const statusNode = document.querySelector(".status");
  if (statusNode) statusNode.textContent = state.status;
}

function findKeywordSpans(text, rawKeywords) {
  const terms = [...new Set(rawKeywords.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  if (terms.length === 0) return [];

  const spans = [];
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startBoundary = /^\w/.test(term) ? "\\b" : "";
    const endBoundary = /\w$/.test(term) ? "\\b" : "";
    const regex = new RegExp(`${startBoundary}${escaped}${endBoundary}`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      spans.push({
        label: CUSTOM_LABEL,
        score: 1,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }
  }

  return spans
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce((acc, span) => {
      const previous = acc.at(-1);
      if (previous && span.start < previous.end) return acc;
      acc.push(span);
      return acc;
    }, []);
}

async function detectSpans(text) {
  const chunks = createTextChunks(text);
  const detected = [];

  for (const [index, chunk] of chunks.entries()) {
    if (chunks.length > 1) {
      setStatus(`Analyzing chunk ${index + 1}/${chunks.length}`);
    }

    const output = await state.classifier(chunk.text, {
      aggregation_strategy: "simple",
    });

    detected.push(
      ...normalizeSpans(output, chunk.text).map((span) => ({
        ...span,
        start: span.start + chunk.start,
        end: span.end + chunk.start,
        text: text.slice(span.start + chunk.start, span.end + chunk.start),
      })),
    );
  }

  return mergeOverlappingSpans(detected);
}

function createTextChunks(text) {
  if (text.length <= MAX_DETECTION_CHARS) {
    return [{ text, start: 0 }];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const maxEnd = Math.min(start + MAX_DETECTION_CHARS, text.length);
    const end = maxEnd === text.length ? maxEnd : findChunkBreak(text, start, maxEnd);

    chunks.push({
      text: text.slice(start, end),
      start,
    });

    if (end === text.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }

  return chunks;
}

function mergeOverlappingSpans(spans) {
  return [...spans]
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce((merged, span) => {
      const previous = merged.at(-1);

      if (previous && previous.label === span.label && span.start < previous.end) {
        previous.start = Math.min(previous.start, span.start);
        previous.end = Math.max(previous.end, span.end);
        previous.score = Math.max(previous.score, span.score);
        previous.text = state.inputText.slice(previous.start, previous.end);
        return merged;
      }

      merged.push({ ...span });
      return merged;
    }, []);
}

function findChunkBreak(text, start, maxEnd) {
  const minEnd = start + Math.floor(MAX_DETECTION_CHARS * 0.65);
  const breakCharacters = ["\n\n", "\n", ". ", "; ", ", ", " "];

  for (const breakCharacter of breakCharacters) {
    const candidate = text.lastIndexOf(breakCharacter, maxEnd);
    if (candidate >= minEnd) {
      return candidate + breakCharacter.length;
    }
  }

  return maxEnd;
}

function setStatus(status) {
  state.status = status;
  const statusNode = document.querySelector(".status");
  if (statusNode) statusNode.textContent = status;
}

function normalizeSpans(output, text) {
  const usedRanges = [];

  return output
    .map((item) => {
      const label = item.entity_group || item.entity || "pii";
      const exact = item.word || "";
      let start = Number.isInteger(item.start) ? item.start : -1;
      let end = Number.isInteger(item.end) ? item.end : -1;

      if (start < 0 || end <= start) {
        const located = locateSpan(text, exact, usedRanges);
        start = located.start;
        end = located.end;
      }

      if (start < 0 || end <= start) return null;

      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;

      if (end <= start) return null;

      usedRanges.push([start, end]);

      return {
        label,
        score: item.score || 0,
        text: text.slice(start, end),
        start,
        end,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function locateSpan(text, rawWord, usedRanges) {
  const candidates = uniqueCandidates(rawWord);
  for (const candidate of candidates) {
    let index = text.indexOf(candidate);
    while (index !== -1) {
      const end = index + candidate.length;
      const overlaps = usedRanges.some(([usedStart, usedEnd]) => index < usedEnd && end > usedStart);
      if (!overlaps) return { start: index, end };
      index = text.indexOf(candidate, index + 1);
    }
  }
  return { start: -1, end: -1 };
}

function uniqueCandidates(rawWord) {
  const normalized = rawWord.replaceAll("##", "");
  return [...new Set([rawWord, rawWord.trimStart(), rawWord.trim(), normalized, normalized.trim()])].filter(Boolean);
}

function filteredSpans() {
  if (state.selectedLabels.size === 0) return [];
  return thresholdedSpans().filter((span) => state.selectedLabels.has(span.label));
}

function thresholdedSpans() {
  return state.spans.filter((span) => span.score >= state.threshold);
}

function recordDetectionRun(textLength, detectionMs) {
  if (textLength <= 0 || detectionMs <= 0) return;

  state.detectionRuns = [
    ...state.detectionRuns,
    {
      textLength,
      detectionMs,
    },
  ].slice(-8);
}

function estimateDetectionMs(textLength) {
  if (state.detectionRuns.length < 2 || textLength <= 0) return null;

  const totals = state.detectionRuns.reduce(
    (acc, run) => {
      acc.characters += run.textLength;
      acc.milliseconds += run.detectionMs;
      return acc;
    },
    { characters: 0, milliseconds: 0 },
  );

  if (totals.characters <= 0) return null;
  return Math.max(50, (totals.milliseconds / totals.characters) * textLength);
}

function renderEstimate() {
  if (state.busy) return "";
  const estimate = estimateDetectionMs(state.inputText.length);
  if (!estimate) return "ETA after 2 detections";
  return `Estimated detection: ${formatDuration(estimate)}`;
}

function renderProgress() {
  if (!state.progress.active) return "";

  return `
    <div class="progress-panel" aria-live="polite">
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(
        state.progress.percent,
      )}">
        <div class="progress-fill" style="width: ${state.progress.percent}%"></div>
      </div>
      <span class="progress-label">${escapeHtml(state.progress.label)}</span>
    </div>
  `;
}

function startEstimatedProgress(estimateMs) {
  const startedAt = performance.now();
  let intervalId = window.setInterval(update, 100);

  update();

  return (finished) => {
    window.clearInterval(intervalId);
    intervalId = null;
    update(finished);
  };

  function update(finished = false) {
    const elapsedMs = performance.now() - startedAt;
    const percent = finished ? 100 : Math.min(95, (elapsedMs / estimateMs) * 100);
    const remainingMs = Math.max(0, estimateMs - elapsedMs);

    state.progress.percent = percent;
    state.progress.label = finished
      ? "100% complete"
      : `${Math.round(percent)}% complete, about ${formatDuration(remainingMs)} left`;

    const fill = document.querySelector(".progress-fill");
    const track = document.querySelector(".progress-track");
    const label = document.querySelector(".progress-label");

    if (fill) fill.style.width = `${percent}%`;
    if (track) track.setAttribute("aria-valuenow", String(Math.round(percent)));
    if (label) label.textContent = state.progress.label;
  }
}

function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} ms`;

  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} min ${remainingSeconds} s`;
}

function applyRedactions(text, spans) {
  return [...spans]
    .sort((a, b) => b.start - a.start)
    .reduce((nextText, span) => {
      const replacement = replacementFor(span);
      return `${nextText.slice(0, span.start)}${replacement}${nextText.slice(span.end)}`;
    }, text);
}

function tokenizeText(text, spans) {
  const tokenMap = new Map();
  const valueToToken = new Map();
  const counters = {};

  const ordered = [...spans].sort((a, b) => a.start - b.start);

  let result = "";
  let cursor = 0;

  for (const span of ordered) {
    if (span.start < cursor) continue;
    const original = text.slice(span.start, span.end);
    const labelKey = tokenLabelFor(span.label);
    const valueKey = `${labelKey}::${original.toLowerCase()}`;
    let token = valueToToken.get(valueKey);
    if (!token) {
      counters[labelKey] = (counters[labelKey] || 0) + 1;
      token = `[${labelKey}_${counters[labelKey]}]`;
      valueToToken.set(valueKey, token);
      tokenMap.set(token, original);
    }
    result += text.slice(cursor, span.start) + token;
    cursor = span.end;
  }
  result += text.slice(cursor);

  return { text: result, tokenMap };
}

function detokenizeText(text, tokenMap) {
  if (!text || tokenMap.size === 0) return text;
  const tokens = [...tokenMap.keys()].sort((a, b) => b.length - a.length);
  let result = text;
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), () => tokenMap.get(token));
  }
  return result;
}

function tokenLabelFor(label) {
  return String(label).replace(/^private_/, "").toUpperCase();
}

function replacementFor(span) {
  if (state.mode === "remove") return "";
  if (state.mode === "custom") return state.replacement;
  if (state.mode === "mask") return "*".repeat(Math.max(3, span.end - span.start));
  return `[${span.label}]`;
}

function renderHighlightedText() {
  const spans = filteredSpans();
  if (!state.outputText) return '<span class="placeholder">Redacted output appears here.</span>';
  if (state.redactionsApplied || spans.length === 0) return escapeHtml(state.outputText);

  let cursor = 0;
  let html = "";

  for (const span of spans) {
    html += escapeHtml(state.inputText.slice(cursor, span.start));
    html += `<mark title="${escapeHtml(span.label)}">${escapeHtml(state.inputText.slice(span.start, span.end))}</mark>`;
    cursor = span.end;
  }

  html += escapeHtml(state.inputText.slice(cursor));
  return html;
}

function renderFindings() {
  if (state.spans.length === 0) {
    return '<p class="empty">No detections yet.</p>';
  }

  const spans = thresholdedSpans();
  if (spans.length === 0) {
    return '<p class="empty">No detections meet the current threshold.</p>';
  }

  return spans
    .map(
      (span) => `
        <article class="finding">
          <div>
            <strong>${escapeHtml(span.label)}</strong>
            <span>${Math.round(span.score * 1000) / 10}%</span>
          </div>
          <code>${escapeHtml(span.text)}</code>
        </article>
      `,
    )
    .join("");
}

function renderBottomPanel() {
  const findingsCount = state.spans.length;
  const visibleCount = thresholdedSpans().length;
  const tokenCount = state.tokenMap.size;
  const tab = state.bottomTab;

  let meta = "";
  if (tab === "findings") {
    meta = findingsCount > 0 ? `${visibleCount} shown / ${findingsCount} detected` : "";
  } else {
    meta = tokenCount > 0
      ? `${tokenCount} token${tokenCount === 1 ? "" : "s"} in mapping`
      : "no mapping yet";
  }

  return `
    <section class="panel findings-panel">
      <div class="tab-bar">
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected="${tab === "findings"}" class="tab ${
            tab === "findings" ? "active" : ""
          }" data-action="tab" data-tab="findings">
            Findings${findingsCount > 0 ? ` <span class="badge">${findingsCount}</span>` : ""}
          </button>
          <button role="tab" aria-selected="${tab === "detokenize"}" class="tab ${
            tab === "detokenize" ? "active" : ""
          }" data-action="tab" data-tab="detokenize">
            Detokenize${tokenCount > 0 ? ` <span class="badge">${tokenCount}</span>` : ""}
          </button>
        </div>
        <span class="tab-meta">${escapeHtml(meta)}</span>
      </div>
      ${tab === "findings" ? renderFindingsTab() : renderDetokenizeTab()}
    </section>
  `;
}

function renderFindingsTab() {
  return `
    <div class="threshold-control">
      <label for="threshold">
        Confidence threshold
        <strong>${Math.round(state.threshold * 100)}%</strong>
      </label>
      <input id="threshold" type="range" min="0" max="1" step="0.01" value="${state.threshold}" />
    </div>
    <div class="label-filters">
      ${labels
        .map(
          (label) => `
            <label class="chip">
              <input type="checkbox" data-label="${label}" ${
                state.selectedLabels.has(label) ? "checked" : ""
              } />
              ${label.replace("private_", "")}
            </label>
          `,
        )
        .join("")}
    </div>
    <div class="findings">
      ${renderFindings()}
    </div>
  `;
}

function renderDetokenizeTab() {
  const tokenCount = state.tokenMap.size;
  const hasMapping = tokenCount > 0;

  return `
    <div class="detokenize-body">
      <div class="token-mapping">
        ${
          hasMapping
            ? `<table>
                <thead><tr><th>Token</th><th>Original</th></tr></thead>
                <tbody>
                  ${[...state.tokenMap.entries()]
                    .map(
                      ([token, original]) => `
                        <tr>
                          <td><code class="token">${escapeHtml(token)}</code></td>
                          <td><code>${escapeHtml(original)}</code></td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>`
            : '<p class="empty">No mapping yet. Choose <strong>Tokenize (reversible)</strong> in the Action dropdown and click Apply, then paste responses below to restore originals.</p>'
        }
      </div>
      <label class="detokenize-input-label" for="detokenize-input">
        Paste tokenized text
        <span class="hint">Replaces every known token with its original value.</span>
      </label>
      <textarea id="detokenize-input" spellcheck="false" placeholder="Paste text containing tokens like [PERSON_1] here...">${escapeHtml(
        state.detokenizeInput,
      )}</textarea>
      <div class="actions">
        <button class="primary" data-action="detokenize" ${
          !hasMapping ? "disabled" : ""
        }>Detokenize</button>
        <button class="ghost" data-action="copy-mapping" ${!hasMapping ? "disabled" : ""}>Copy mapping (JSON)</button>
        <button class="ghost" data-action="clear-mapping" ${!hasMapping ? "disabled" : ""}>Clear mapping</button>
      </div>
      ${
        state.detokenizeApplied
          ? `
            <div class="panel-header detokenize-output-header">
              <h2>Restored text</h2>
              <button class="ghost" data-action="copy-detokenized" ${
                !state.detokenizedOutput ? "disabled" : ""
              }>Copy</button>
            </div>
            <div class="output">${escapeHtml(state.detokenizedOutput)}</div>
          `
          : ""
      }
    </div>
  `;
}

function renderHeader() {
  const githubLink = `
    <a
      class="github-link"
      href="https://github.com/swissprismia/local-pii-filter"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View source on GitHub"
      title="View source on GitHub"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.111.82-.261.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>
    </a>
  `;
  const statusPill = `<div class="status ${state.busy ? "loading" : ""}">${escapeHtml(state.status)}</div>`;

  if (EMBED_MODE) {
    return `
      <header class="brand-header brand-header-compact">
        <div class="brand-inner">
          <p class="brand-tagline">Detect and redact sensitive text locally with ${MODEL_ID}.</p>
          ${githubLink}
          ${statusPill}
        </div>
      </header>
    `;
  }

  return `
    <header class="brand-header">
      <div class="brand-inner">
        <img class="brand-logo" src="/assets/logo_wordmark_white.png" alt="PrismIA" />
        <div>
          <h1>Local PII Filter</h1>
          <p>Detect and redact sensitive text locally with ${MODEL_ID}.</p>
        </div>
        ${githubLink}
        ${statusPill}
      </div>
    </header>
  `;
}

function renderToast() {
  if (!state.toast) return "";
  return `<div class="toast" role="status" aria-live="polite">${escapeHtml(state.toast.message)}</div>`;
}

function showToast(message) {
  if (toastTimerId) {
    clearTimeout(toastTimerId);
    toastTimerId = null;
  }
  state.toast = { message };
  render();
  toastTimerId = setTimeout(() => {
    state.toast = null;
    toastTimerId = null;
    render();
  }, 2400);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
