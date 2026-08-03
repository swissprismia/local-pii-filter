import { env, pipeline } from "@huggingface/transformers";
import "./styles.css";

const MODEL_ID = "openai/privacy-filter";
const LOCAL_MODEL_PATH = "/models/";
const LOCAL_MODEL_ONLY = import.meta.env.VITE_LOCAL_MODEL_ONLY === "true";
const MAX_DETECTION_CHARS = 3000;
const CHUNK_OVERLAP_CHARS = 200;

const LANG = (() => {
  const param = new URLSearchParams(window.location.search).get("lang");
  if (param === "fr" || param === "en") return param;
  return (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
})();

const STRINGS = {
  en: {
    title: "Local PII Filter",
    appTitle: "Local PII Filter",
    stepInput: "Your text",
    stepOutput: "Anonymized text",
    stepRestore: "Restore the AI answer",
    sample: "Sample",
    clear: "Clear",
    copy: "Copy",
    anonymize: "Anonymize",
    analyzing: "Analyzing...",
    placeholderInput: "Paste your text here...",
    placeholderOutput: "Your anonymized text will appear here.",
    idleOutputHint: "Paste a text on the left, then click Anonymize.",
    tagPlaceholder: "+ Add a word to hide (optional)",
    method: "Method",
    modeReplace: "Replace with a label",
    modeCustom: "Replace with my text",
    modeMask: "Mask with ***",
    modeRemove: "Remove",
    modeTokenize: "Anonymize (reversible)",
    customReplacement: "My text",
    detected: "Detected",
    nothingFound: "No sensitive data detected.",
    settings: "Settings",
    threshold: "Minimum confidence",
    restoreHint: "Available after a reversible anonymization.",
    placeholderDetok: "Paste the AI answer containing tags like [PERSON_1]...",
    restore: "Restore",
    mappingSummary: (n) => `View mapping (${n})`,
    copyMapping: "Copy (JSON)",
    clearMapping: "Clear",
    restored: "Restored text",
    privacyNote: "Runs entirely in your browser. Nothing is sent to any server.",
    sourceLabel: "Source code",
    footerRights: "All rights reserved.",
    thToken: "Tag",
    thOriginal: "Original",
    // statuses
    ready: "Ready",
    anonymizedN: (n) => `${n} value${n === 1 ? "" : "s"} anonymized`,
    copiedOutput: "Copied",
    detokenized: "Restored",
    copiedMapping: "Mapping copied",
    copiedRestored: "Restored text copied",
    mappingCleared: "Cleared",
    pasteFirst: "Paste some text first",
    loadingModel: "Preparing (first time only)...",
    analyzingText: "Analyzing...",
    analyzingEta: (d) => `Analyzing, about ${d}`,
    errorPrefix: "Error: ",
    webgpuFallback: "Loading compatibility mode...",
    downloading: (pct) => `Downloading${pct}`,
    modelReady: "Ready",
    chunk: (i, n) => `Analyzing part ${i}/${n}`,
    estimated: (d) => `≈ ${d}`,
    pctLeft: (p, d) => `${p}% · ${d} left`,
    pctDone: "100%",
    // toasts
    toastAnonymized: "Anonymized text copied",
    toastAnonymizedManual: "Anonymized. Copy it from the right panel.",
    toastOutputCopied: "Copied",
    toastMappingCopied: "Mapping copied",
    toastRestoredCopied: "Restored text copied",
    sampleText:
      "My name is Alice Smith. Email me at alice.smith@example.com or call +1 415 555 0199. My account number is 123456789.",
    labelNames: {
      account_number: "account no.",
      private_address: "address",
      private_email: "email",
      private_person: "name",
      private_phone: "phone",
      private_url: "link",
      private_date: "date",
      secret: "secret",
      custom: "custom",
    },
  },
  fr: {
    title: "Anonymiseur local",
    appTitle: "Anonymiseur local",
    stepInput: "Votre texte",
    stepOutput: "Texte anonymisé",
    stepRestore: "Restaurer la réponse de l'IA",
    sample: "Exemple",
    clear: "Effacer",
    copy: "Copier",
    anonymize: "Anonymiser",
    analyzing: "Analyse...",
    placeholderInput: "Collez votre texte ici...",
    placeholderOutput: "Votre texte anonymisé apparaîtra ici.",
    idleOutputHint: "Collez un texte à gauche, puis cliquez sur Anonymiser.",
    tagPlaceholder: "+ Ajouter un mot à masquer (optionnel)",
    method: "Méthode",
    modeReplace: "Remplacer par une étiquette",
    modeCustom: "Remplacer par mon texte",
    modeMask: "Masquer avec ***",
    modeRemove: "Supprimer",
    modeTokenize: "Anonymiser (réversible)",
    customReplacement: "Mon texte",
    detected: "Détecté",
    nothingFound: "Aucune donnée sensible détectée.",
    settings: "Réglages",
    threshold: "Confiance minimale",
    restoreHint: "Disponible après une anonymisation réversible.",
    placeholderDetok: "Collez la réponse de l'IA contenant des étiquettes comme [PERSON_1]...",
    restore: "Restaurer",
    mappingSummary: (n) => `Voir la correspondance (${n})`,
    copyMapping: "Copier (JSON)",
    clearMapping: "Vider",
    restored: "Texte restauré",
    privacyNote: "Fonctionne entièrement dans votre navigateur. Rien n'est envoyé à un serveur.",
    sourceLabel: "Code source",
    footerRights: "Tous droits réservés.",
    thToken: "Étiquette",
    thOriginal: "Original",
    ready: "Prêt",
    anonymizedN: (n) => `${n} valeur${n === 1 ? "" : "s"} anonymisée${n === 1 ? "" : "s"}`,
    copiedOutput: "Copié",
    detokenized: "Restauré",
    copiedMapping: "Correspondance copiée",
    copiedRestored: "Texte restauré copié",
    mappingCleared: "Vidé",
    pasteFirst: "Collez d'abord un texte",
    loadingModel: "Préparation (première fois uniquement)...",
    analyzingText: "Analyse...",
    analyzingEta: (d) => `Analyse, environ ${d}`,
    errorPrefix: "Erreur : ",
    webgpuFallback: "Chargement du mode de compatibilité...",
    downloading: (pct) => `Téléchargement${pct}`,
    modelReady: "Prêt",
    chunk: (i, n) => `Analyse de la partie ${i}/${n}`,
    estimated: (d) => `≈ ${d}`,
    pctLeft: (p, d) => `${p} % · reste ${d}`,
    pctDone: "100 %",
    toastAnonymized: "Texte anonymisé copié",
    toastAnonymizedManual: "Anonymisé. Copiez-le depuis le panneau de droite.",
    toastOutputCopied: "Copié",
    toastMappingCopied: "Correspondance copiée",
    toastRestoredCopied: "Texte restauré copié",
    sampleText:
      "Je m'appelle Alice Martin. Écrivez-moi à alice.martin@exemple.ch ou appelez le +41 22 555 01 99. Mon numéro de compte est 123456789.",
    labelNames: {
      account_number: "n° de compte",
      private_address: "adresse",
      private_email: "e-mail",
      private_person: "nom",
      private_phone: "téléphone",
      private_url: "lien",
      private_date: "date",
      secret: "secret",
      custom: "personnalisé",
    },
  },
};

const T = STRINGS[LANG];
document.documentElement.lang = LANG;
document.title = T.title;

const SAMPLE_TEXT = T.sampleText;

const state = {
  classifier: null,
  modelSpans: [],
  keywordSpans: [],
  inputText: SAMPLE_TEXT,
  outputText: "",
  outputSegments: null,
  analyzed: false,
  busy: false,
  status: T.ready,
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
  customTerms: [],
  tokenMap: new Map(),
  detokenizeInput: "",
  detokenizedOutput: "",
  detokenizeApplied: false,
  toast: null,
};

let toastTimerId = null;

const CUSTOM_LABEL = "custom";

function labelName(label) {
  return T.labelNames[label] || String(label).replace("private_", "");
}

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

function allSpans() {
  return [...state.modelSpans, ...state.keywordSpans].sort((a, b) => a.start - b.start);
}

function thresholdedSpans() {
  return allSpans().filter((span) => span.score >= state.threshold);
}

function filteredSpans() {
  if (state.selectedLabels.size === 0) return [];
  return thresholdedSpans().filter((span) => state.selectedLabels.has(span.label));
}

const hasResult = () => state.analyzed;
const hasMapping = () => state.tokenMap.size > 0;

function render() {
  app.innerHTML = `
    <div class="app-frame ${EMBED_MODE ? "embed" : ""}">
      ${renderHeader()}

      <main class="shell">
        <section class="workspace">

        <div class="statusbar"><span class="status ${state.busy ? "loading" : ""}">${escapeHtml(state.status)}</span></div>

        <div class="editor-grid">
          <section class="panel input-panel">
            <div class="panel-header">
              <h2><span class="step-num">1</span>${T.stepInput}</h2>
              <span class="header-actions">
                <button class="ghost small" data-action="reset">${T.sample}</button>
                <button class="ghost small" data-action="clear">${T.clear}</button>
              </span>
            </div>
            <textarea id="input" spellcheck="false" placeholder="${escapeHtml(T.placeholderInput)}">${escapeHtml(
              state.inputText,
            )}</textarea>
            ${renderTagInput()}
            <div class="actions">
              <button class="primary big" data-action="anonymize" ${state.busy ? "disabled" : ""}>
                ${state.busy ? T.analyzing : T.anonymize}
              </button>
              <span class="estimate">${renderEstimate()}</span>
            </div>
            ${renderProgress()}
          </section>

          <section class="panel output-panel ${hasResult() ? "" : "is-idle"}" aria-disabled="${!hasResult()}">
            <div class="panel-header">
              <h2><span class="step-num">2</span>${T.stepOutput}</h2>
              <button class="ghost small" data-action="copy" ${!hasResult() || !state.outputText ? "disabled" : ""}>${T.copy}</button>
            </div>
            <div class="output" id="output">${renderOutput()}</div>
            ${hasResult() ? renderResultTools() : ""}
          </section>
        </div>

        <section class="panel restore-panel ${hasMapping() ? "" : "is-idle"}" aria-disabled="${!hasMapping()}">
          <div class="panel-header">
            <h2><span class="step-num">3</span>${T.stepRestore}</h2>
            ${
              hasMapping()
                ? `<button class="ghost small" data-action="copy-detokenized" ${
                    !state.detokenizedOutput ? "disabled" : ""
                  }>${T.copy}</button>`
                : `<span class="idle-hint">${T.restoreHint}</span>`
            }
          </div>
          ${hasMapping() ? renderRestoreBody() : ""}
        </section>

        <p class="privacy-note">${T.privacyNote}<span class="note-sep">·</span>${renderSourceLink()}</p>
      </main>

      ${
        EMBED_MODE
          ? ""
          : `
        <footer class="footer">
          <div class="footer-inner">
            <div class="footer-brand">
              <img src="/assets/logo_icon_blue.svg" alt="PrismIA" />
              <span>© ${new Date().getFullYear()} PrismIA. ${T.footerRights}</span>
            </div>
            <span>${T.privacyNote}<span class="note-sep">·</span>${renderSourceLink()}</span>
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

function renderTagInput() {
  return `
    <div class="tag-input" data-role="tag-input">
      ${state.customTerms
        .map(
          (term, i) => `
            <span class="tag">${escapeHtml(term)}<button type="button" class="tag-x" data-remove-tag="${i}" aria-label="✕">✕</button></span>
          `,
        )
        .join("")}
      <input id="tag-field" type="text" placeholder="${escapeHtml(state.customTerms.length ? "+" : T.tagPlaceholder)}" autocomplete="off" />
    </div>
  `;
}

function renderResultTools() {
  return `
    <div class="result-tools">
      <div class="kpi-row">
        <span class="kpi-title">${T.detected}</span>
        ${renderKpiChips()}
      </div>
      <div class="method-row">
        <label>
          ${T.method}
          <select id="mode">
            <option value="tokenize" ${state.mode === "tokenize" ? "selected" : ""}>${T.modeTokenize}</option>
            <option value="replace" ${state.mode === "replace" ? "selected" : ""}>${T.modeReplace}</option>
            <option value="custom" ${state.mode === "custom" ? "selected" : ""}>${T.modeCustom}</option>
            <option value="mask" ${state.mode === "mask" ? "selected" : ""}>${T.modeMask}</option>
            <option value="remove" ${state.mode === "remove" ? "selected" : ""}>${T.modeRemove}</option>
          </select>
        </label>
        ${
          state.mode === "custom"
            ? `<label>${T.customReplacement}<input id="replacement" type="text" value="${escapeHtml(state.replacement)}" /></label>`
            : ""
        }
        <details class="settings">
          <summary>${T.settings}</summary>
          <div class="threshold-control">
            <label for="threshold">
              ${T.threshold}
              <strong>${Math.round(state.threshold * 100)}%</strong>
            </label>
            <input id="threshold" type="range" min="0" max="1" step="0.01" value="${state.threshold}" />
          </div>
        </details>
      </div>
    </div>
  `;
}

function renderKpiChips() {
  const spans = thresholdedSpans();
  if (spans.length === 0) return `<span class="kpi-none">${T.nothingFound}</span>`;

  const counts = new Map();
  for (const span of spans) {
    counts.set(span.label, (counts.get(span.label) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => {
      const on = state.selectedLabels.has(label);
      return `
        <button type="button" class="kpi-chip ${on ? "on" : ""}" data-toggle-label="${label}" aria-pressed="${on}">
          ${labelName(label)} <span class="kpi-count">${count}</span>
        </button>
      `;
    })
    .join("");
}

function renderRestoreBody() {
  return `
    <div class="restore-body">
      <textarea id="detokenize-input" spellcheck="false" placeholder="${escapeHtml(
        T.placeholderDetok,
      )}">${escapeHtml(state.detokenizeInput)}</textarea>
      <div class="actions">
        <button class="primary" data-action="detokenize">${T.restore}</button>
        <details class="mapping-details">
          <summary>${T.mappingSummary(state.tokenMap.size)}</summary>
          <div class="token-mapping">
            <table>
              <thead><tr><th>${T.thToken}</th><th>${T.thOriginal}</th></tr></thead>
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
            </table>
          </div>
          <div class="mapping-actions">
            <button class="ghost small" data-action="copy-mapping">${T.copyMapping}</button>
            <button class="ghost small" data-action="clear-mapping">${T.clearMapping}</button>
          </div>
        </details>
      </div>
      ${
        state.detokenizeApplied
          ? `<div class="output restored-output">${escapeHtml(state.detokenizedOutput)}</div>`
          : ""
      }
    </div>
  `;
}

function bindEvents() {
  document.querySelector("#input").addEventListener("input", (event) => {
    state.inputText = event.target.value;
    invalidateResult();
  });

  const modeSelect = document.querySelector("#mode");
  if (modeSelect) {
    modeSelect.addEventListener("change", (event) => {
      state.mode = event.target.value;
      reapply();
      render();
    });
  }

  const replacementInput = document.querySelector("#replacement");
  if (replacementInput) {
    replacementInput.addEventListener("input", (event) => {
      state.replacement = event.target.value;
      reapply();
      const outputNode = document.querySelector("#output");
      if (outputNode) outputNode.innerHTML = renderOutput();
    });
  }

  const tagField = document.querySelector("#tag-field");
  if (tagField) {
    tagField.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag(tagField.value);
      } else if (event.key === "Backspace" && tagField.value === "" && state.customTerms.length) {
        state.customTerms.pop();
        onTagsChanged();
      }
    });
    tagField.addEventListener("blur", () => {
      if (tagField.value.trim()) addTag(tagField.value);
    });
  }

  document.querySelectorAll("[data-remove-tag]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const index = Number(event.currentTarget.dataset.removeTag);
      state.customTerms.splice(index, 1);
      onTagsChanged();
    });
  });

  document.querySelectorAll("[data-toggle-label]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      const label = event.currentTarget.dataset.toggleLabel;
      if (state.selectedLabels.has(label)) {
        state.selectedLabels.delete(label);
      } else {
        state.selectedLabels.add(label);
      }
      reapply();
      render();
    });
  });

  const thresholdInput = document.querySelector("#threshold");
  if (thresholdInput) {
    thresholdInput.addEventListener("input", (event) => {
      state.threshold = Number(event.target.value);
      state.selectedLabels = new Set(thresholdedSpans().map((span) => span.label));
      const wasOpen = document.querySelector("details.settings")?.open;
      reapply();
      render();
      if (wasOpen) {
        const details = document.querySelector("details.settings");
        if (details) details.open = true;
        const slider = document.querySelector("#threshold");
        if (slider) slider.focus();
      }
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
}

function addTag(rawValue) {
  const values = rawValue
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  let added = false;
  for (const value of values) {
    if (!state.customTerms.some((t) => t.toLowerCase() === value.toLowerCase())) {
      state.customTerms.push(value);
      added = true;
    }
  }
  if (added || values.length) onTagsChanged();
}

function onTagsChanged() {
  if (state.analyzed) {
    state.keywordSpans = computeKeywordSpans();
    state.selectedLabels = new Set(thresholdedSpans().map((span) => span.label));
    reapply();
  }
  render();
  const tagField = document.querySelector("#tag-field");
  if (tagField) tagField.focus();
}

function computeKeywordSpans() {
  return findKeywordSpans(state.inputText, state.customTerms.join(",")).filter(
    (ks) => !state.modelSpans.some((ms) => ks.start < ms.end && ks.end > ms.start),
  );
}

function invalidateResult() {
  state.analyzed = false;
  state.modelSpans = [];
  state.keywordSpans = [];
  state.outputText = "";
  state.outputSegments = null;
  state.selectedLabels.clear();
}

function reapply() {
  if (!state.analyzed) return;
  const spans = filteredSpans();

  if (state.mode === "tokenize") {
    const { segments, tokenMap } = tokenizeSegments(state.inputText, spans);
    state.outputSegments = segments;
    state.outputText = segments.map((s) => s.text).join("");
    state.tokenMap = tokenMap;
  } else {
    const segments = redactSegments(state.inputText, spans);
    state.outputSegments = segments;
    state.outputText = segments.map((s) => s.text).join("");
  }
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;

  if (action === "anonymize") {
    await anonymize();
    return;
  }

  if (action === "clear") {
    state.inputText = "";
    invalidateResult();
    state.status = T.ready;
    render();
    return;
  }

  if (action === "reset") {
    state.inputText = SAMPLE_TEXT;
    invalidateResult();
    state.status = T.ready;
    render();
    return;
  }

  if (action === "copy") {
    await navigator.clipboard.writeText(state.outputText);
    state.status = T.copiedOutput;
    showToast(T.toastOutputCopied);
    return;
  }

  if (action === "detokenize") {
    if (state.tokenMap.size === 0) return;
    state.detokenizedOutput = detokenizeText(state.detokenizeInput, state.tokenMap);
    state.detokenizeApplied = true;
    state.status = T.detokenized;
    render();
    return;
  }

  if (action === "copy-mapping") {
    if (state.tokenMap.size === 0) return;
    const json = JSON.stringify(Object.fromEntries(state.tokenMap), null, 2);
    await navigator.clipboard.writeText(json);
    state.status = T.copiedMapping;
    showToast(T.toastMappingCopied);
    return;
  }

  if (action === "copy-detokenized") {
    if (!state.detokenizedOutput) return;
    await navigator.clipboard.writeText(state.detokenizedOutput);
    state.status = T.copiedRestored;
    showToast(T.toastRestoredCopied);
    return;
  }

  if (action === "clear-mapping") {
    state.tokenMap = new Map();
    state.detokenizeInput = "";
    state.detokenizedOutput = "";
    state.detokenizeApplied = false;
    state.status = T.mappingCleared;
    render();
    return;
  }
}

async function anonymize() {
  let stopProgress = () => {};

  if (!state.inputText.trim()) {
    state.status = T.pasteFirst;
    render();
    return;
  }

  const pendingTag = document.querySelector("#tag-field");
  if (pendingTag && pendingTag.value.trim()) addTag(pendingTag.value);

  state.busy = true;
  state.status = state.classifier ? T.analyzingText : T.loadingModel;
  render();

  try {
    if (!state.classifier) {
      state.classifier = await loadClassifier();
    }

    const estimate = estimateDetectionMs(state.inputText.length);
    state.progress = {
      active: Boolean(estimate),
      percent: 0,
      label: estimate ? T.pctLeft(0, formatDuration(estimate)) : "",
    };
    state.status = estimate ? T.analyzingEta(formatDuration(estimate)) : T.analyzingText;
    render();

    if (estimate) {
      stopProgress = startEstimatedProgress(estimate);
    }

    const startedAt = performance.now();
    const modelSpans = await detectSpans(state.inputText);
    const detectionMs = performance.now() - startedAt;
    stopProgress(true);
    stopProgress = () => {};

    state.modelSpans = modelSpans;
    state.keywordSpans = computeKeywordSpans();
    recordDetectionRun(state.inputText.length, detectionMs);
    state.analyzed = true;
    state.selectedLabels = new Set(thresholdedSpans().map((span) => span.label));

    reapply();

    const count = filteredSpans().length;
    state.status = T.anonymizedN(count);

    if (state.mode === "tokenize" && state.outputText) {
      try {
        await navigator.clipboard.writeText(state.outputText);
        showToast(T.toastAnonymized);
      } catch (error) {
        console.warn("Clipboard write failed", error);
        showToast(T.toastAnonymizedManual);
      }
    }
  } catch (error) {
    stopProgress(false);
    stopProgress = () => {};
    console.error(error);
    state.status = `${T.errorPrefix}${error.message}`;
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
    state.status = T.webgpuFallback;
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
    state.status = T.downloading(percent);
  } else if (progress.status === "ready") {
    state.status = T.modelReady;
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
      setStatus(T.chunk(index + 1, chunks.length));
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

  return mergeOverlappingSpans(detected, text);
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

function mergeOverlappingSpans(spans, sourceText) {
  return [...spans]
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce((merged, span) => {
      const previous = merged.at(-1);

      if (previous && previous.label === span.label && span.start < previous.end) {
        previous.start = Math.min(previous.start, span.start);
        previous.end = Math.max(previous.end, span.end);
        previous.score = Math.max(previous.score, span.score);
        previous.text = sourceText.slice(previous.start, previous.end);
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
  if (!estimate) return "";
  return T.estimated(formatDuration(estimate));
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
    state.progress.label = finished ? T.pctDone : T.pctLeft(Math.round(percent), formatDuration(remainingMs));

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

function redactSegments(text, spans) {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;

  for (const span of ordered) {
    if (span.start < cursor) continue;
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), inserted: false });
    const replacement = replacementFor(span);
    if (replacement) segments.push({ text: replacement, inserted: true });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), inserted: false });

  return segments;
}

function tokenizeSegments(text, spans) {
  const tokenMap = new Map();
  const valueToToken = new Map();
  const counters = {};

  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const segments = [];
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
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), inserted: false });
    segments.push({ text: token, inserted: true });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), inserted: false });

  return { segments, tokenMap };
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

function renderOutput() {
  if (!hasResult()) {
    return `<span class="placeholder">${escapeHtml(T.idleOutputHint)}</span>`;
  }
  if (!state.outputSegments || state.outputSegments.length === 0) {
    return escapeHtml(state.outputText || "");
  }
  return state.outputSegments
    .map((segment) =>
      segment.inserted ? `<mark>${escapeHtml(segment.text)}</mark>` : escapeHtml(segment.text),
    )
    .join("");
}

function renderSourceLink() {
  return `
    <a class="source-link" href="https://github.com/swissprismia/local-pii-filter" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.111.82-.261.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>${T.sourceLabel}
    </a>
  `;
}

function renderHeader() {
  if (EMBED_MODE) return "";

  return `
    <header class="app-header">
      <div class="app-header-inner">
        <img class="app-logo" src="/assets/logo_icon_blue.svg" alt="PrismIA" />
        <span class="app-title">${T.appTitle}</span>
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
