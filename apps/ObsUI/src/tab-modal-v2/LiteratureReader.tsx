import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  IoChevronBackOutline,
  IoChevronForwardOutline,
  IoCloseOutline,
  IoExpandOutline,
  IoResizeOutline,
  IoLanguageOutline,
  IoLocateOutline,
  IoRemoveOutline,
  IoSearchOutline,
  IoSparklesOutline,
  IoAddOutline,
  IoChatbubbleEllipsesOutline,
  IoTrashOutline,
} from "react-icons/io5";
import type { LiteratureDiscussionMessage, LiteratureDiscussionResponse, LiteratureDiscussionModel, LiteratureRuntimeStatus, LiteratureSelectionTranslationResponse, LiteratureUnifiedItem } from "../literature";
import type { WorkbenchSettings } from "../workbench-settings";

type PdfJsApi = typeof import("pdfjs-dist");

type ProviderModel = {
  id: string;
  label: string;
};

type ProviderStatus = {
  id: string;
  label: string;
  available: boolean;
  version: string | null;
  models: ProviderModel[];
  cliCandidates?: Array<{ label: string; path: string; preset: "opencode" | "generic"; model: string; argsTemplate: string }>;
};

type ProviderPayload = { providers: ProviderStatus[] };

type TranslationModelOption = {
  key: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  available: boolean;
  reasoningEffort: string;
  profileId?: string;
  cliPath?: string;
  cliArgs?: string;
  cliPreset?: "opencode" | "generic";
};

type Selection = {
  text: string;
  page: number;
  left: number;
  top: number;
};

type ReadingMode = "page" | "scroll";

export const PDF_SCALE_MIN = 0.5;
export const PDF_SCALE_MAX = 3.5;
export const PDF_SCALE_STEP = 0.1;
export const PDF_SCALE_DEFAULT = 1.15;

const leadingSelectionPunctuation = /^[\s"'“”‘’«»‹›《》〈〉「」『』([{]+/u;
const trailingSelectionPunctuation = /[\s"'“”‘’«»‹›《》〈〉「」『』)\]}>,.;:!?，。；：！？]+$/u;

const literatureReadingModeStorageKey = "obsui-literature-reading-mode";
const literatureDiscussionModelStorageKey = "obsui-literature-discussion-model";

function readReadingMode(): ReadingMode {
  if (typeof window === "undefined") return "page";
  try {
    return window.localStorage.getItem(literatureReadingModeStorageKey) === "scroll" ? "scroll" : "page";
  } catch {
    return "page";
  }
}

function readDiscussionModelKey() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(literatureDiscussionModelStorageKey) ?? "";
  } catch {
    return "";
  }
}

type PageViewProps = {
  pdfjs: PdfJsApi;
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onSelection: (selection: Selection | null) => void;
  onPageText: (pageNumber: number, text: string) => void;
};

type PdfTextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;
type PdfTextContentItem = PdfTextContent["items"][number];

const pdfWatermarkPattern = /(?:journal\s+pre[\s-]?proof|pre[\s-]?proof|accepted\s+manuscript|author(?:['’]s)?\s+manuscript|uncorrected\s+proof|unpublished|confidential|do\s+not\s+(?:copy|distribute)|watermark|sample(?:\s+copy)?|draft)/iu;
const standalonePdfWatermarkPattern = /^(?:journal\s+pre[\s-]?proof|pre[\s-]?proof|accepted\s+manuscript|author(?:['’]s)?\s+manuscript|uncorrected\s+proof|do\s+not\s+(?:copy|distribute)|sample\s+copy)$/iu;

function normalizedPdfItemAngle(item: PdfTextContentItem) {
  if (!item || typeof item !== "object" || !("transform" in item) || !Array.isArray(item.transform) || item.transform.length < 2) return null;
  const a = Number(item.transform[0]);
  const b = Number(item.transform[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
  const raw = Math.abs(Math.atan2(b, a) * 180 / Math.PI) % 180;
  return raw > 90 ? 180 - raw : raw;
}

/**
 * Watermarks are commonly emitted as large diagonal text items in a PDF's
 * text stream. They must not enter the selectable text layer: their absolute
 * positioned span can sit over the body and make a drag select the rest of
 * the page. Keep the rule geometry based so it also handles new watermark
 * wording and different publishers.
 */
export function isLikelyPdfWatermarkTextItem(item: unknown) {
  if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") return false;
  const candidate = item as PdfTextContentItem & { str: string };
  const angle = normalizedPdfItemAngle(candidate);
  if (angle === null) return false;

  // Diagonal text is the strongest signal: normal article prose, headings,
  // and captions are horizontal while page watermarks are usually 20–70°.
  if (angle >= 8 && angle <= 82) return true;

  const transform = "transform" in candidate && Array.isArray(candidate.transform) ? candidate.transform : [];
  const fontSize = Math.hypot(Number(transform[0]), Number(transform[1]));
  const width = "width" in candidate ? Number(candidate.width) : 0;
  const height = "height" in candidate ? Number(candidate.height) : 0;
  const text = candidate.str.trim();
  const keywordMatch = pdfWatermarkPattern.test(text);
  const standaloneKeywordMatch = standalonePdfWatermarkPattern.test(text);
  const oversized = (Number.isFinite(fontSize) && fontSize >= 32) || (Number.isFinite(height) && height >= 40) || (Number.isFinite(width) && width >= 520);

  // Vertical labels are useful article content unless they also look like a
  // watermark. Large, known watermark phrases are also removed when a file
  // uses a horizontal stamp instead of a diagonal one.
  return standaloneKeywordMatch || (angle > 82 && (keywordMatch || oversized)) || (keywordMatch && oversized);
}

export function filterPdfTextContentItems(items: readonly PdfTextContentItem[]) {
  return items.filter((item) => !isLikelyPdfWatermarkTextItem(item));
}

function textContentString(items: readonly unknown[]) {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") return [];
    return [item.str];
  }).join(" ");
}

export function normalizePdfSelectionText(value: string) {
  return value
    .replaceAll("\u00ad", "")
    .replace(/([\p{L}\p{N}])-\s+(?=[\p{Ll}\p{N}])/gu, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?，。；：！？])/g, "$1")
    .trim();
}

function isWordSelection(text: string) {
  return /^(?:\p{L}|\p{N})[\p{L}\p{M}\p{N}'’\u2010-]{0,63}$/u.test(text.trim());
}

/**
 * PDF text layers often include the comma, period, or quote immediately next
 * to a selected word. Remove only those boundary marks when the remaining
 * text is one word; punctuation inside a passage remains untouched.
 */
export function normalizePdfWordSelectionText(value: string) {
  const normalized = normalizePdfSelectionText(value);
  const candidate = normalized
    .replace(leadingSelectionPunctuation, "")
    .replace(trailingSelectionPunctuation, "")
    .trim();
  return isWordSelection(candidate) ? candidate : normalized;
}

export function pdfSelectionMode(value: string): "word" | "passage" {
  return isWordSelection(normalizePdfWordSelectionText(value)) ? "word" : "passage";
}

export function clampPdfScale(value: number) {
  if (!Number.isFinite(value)) return PDF_SCALE_DEFAULT;
  return Number(Math.min(PDF_SCALE_MAX, Math.max(PDF_SCALE_MIN, value)).toFixed(2));
}

export function adjustPdfScale(value: number, delta: number) {
  return clampPdfScale(value + delta);
}

function PageView({ pdfjs, pdf, pageNumber, scale, onSelection, onPageText }: PageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: ReturnType<PDFPageProxy["render"]> | null = null;
    let textLayer: { render: () => Promise<unknown>; cancel: () => void } | null = null;
    const render = async () => {
      page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setPageSize((previous) => previous.width === viewport.width && previous.height === viewport.height ? previous : { width: viewport.width, height: viewport.height });
      const canvas = canvasRef.current;
      const textContainer = textLayerRef.current;
      if (!canvas || !textContainer) return;
      const deviceScale = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(viewport.width * deviceScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * deviceScale));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      textContainer.replaceChildren();
      renderTask = page.render({
        canvasContext: canvas.getContext("2d", { alpha: false })!,
        canvas,
        viewport,
        transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0],
      });
      const textContent = await page.getTextContent();
      if (cancelled) return;
      const selectableTextContent = { ...textContent, items: filterPdfTextContentItems(textContent.items) };
      onPageText(pageNumber, textContentString(selectableTextContent.items));
      textLayer = new pdfjs.TextLayer({ textContentSource: selectableTextContent, container: textContainer, viewport });
      await textLayer.render();
    };
    void render().catch(() => {
      if (!cancelled) setPageSize({ width: 0, height: 0 });
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [onPageText, pageNumber, pdf, pdfjs, scale]);

  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    const layer = textLayerRef.current;
    // A PageView only owns selections whose anchor is inside its own text
    // layer. Other pages may have their own selectionchange listener; they
    // must leave that selection alone instead of clearing it out of order.
    if (!selection || !layer || !selection.anchorNode || !layer.contains(selection.anchorNode)) return;
    if (selection.isCollapsed || !selection.focusNode || !layer.contains(selection.focusNode) || selection.rangeCount === 0) {
      onSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!layer.contains(range.commonAncestorContainer)) {
      onSelection(null);
      return;
    }
    const text = normalizePdfWordSelectionText(selection.toString());
    if (!text) {
      onSelection(null);
      return;
    }
    const rect = [...range.getClientRects()].find((candidate) => candidate.width > 0 && candidate.height > 0) ?? range.getBoundingClientRect();
    onSelection({ text: text.slice(0, 8_000), page: pageNumber, left: rect.left, top: Math.max(12, rect.top - 10) });
  }, [onSelection, pageNumber]);

  useEffect(() => {
    let frame: number | null = null;
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const layer = textLayerRef.current;
      if (!selection?.anchorNode || !layer?.contains(selection.anchorNode)) return;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        readSelection();
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [readSelection]);

  const frameStyle = pageSize.width ? {
    width: `${pageSize.width}px`,
    height: `${pageSize.height}px`,
    "--total-scale-factor": String(scale),
    "--scale-round-x": "1px",
    "--scale-round-y": "1px",
  } as CSSProperties : undefined;
  return <div className="literature-pdf-page" data-pdf-page={pageNumber} style={frameStyle} onMouseDown={() => onSelection(null)} onMouseUp={() => window.requestAnimationFrame(readSelection)}>
    <canvas ref={canvasRef} aria-hidden="true" />
    <div ref={textLayerRef} className="literature-pdf-text-layer textLayer" />
  </div>;
}

function modelKey(option: Pick<TranslationModelOption, "providerId" | "modelId" | "profileId">) {
  return `${option.providerId}:${option.modelId}:${option.profileId ?? ""}`;
}

function discussionModelPayload(option: TranslationModelOption | null): LiteratureDiscussionModel | undefined {
  if (!option) return undefined;
  return {
    providerId: option.providerId,
    modelId: option.modelId,
    profileId: option.profileId,
    reasoningEffort: option.reasoningEffort,
    cliPath: option.cliPath,
    cliArgs: option.cliArgs,
    cliPreset: option.cliPreset,
  };
}

function selectionSignature(selection: Selection, targetLanguage: string, option: TranslationModelOption | null) {
  return `${selection.page}:${selection.text}:${targetLanguage}:${option ? modelKey(option) : ""}`;
}

function displayError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function releaseLiteratureReaderModels(modelIds: Iterable<string>, request: typeof fetch = fetch) {
  const models = [...new Set(modelIds)].filter((modelId) => Boolean(modelId.trim()));
  await Promise.all(models.map(async (model) => {
    try {
      await request("/api/local-models/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop-model", model, protectExternalConsumers: true }),
        keepalive: true,
      });
    } catch {
      // Reader teardown must not be blocked when the local service is already gone.
    }
  }));
}

export function LiteratureReader({
  item,
  settings,
  runtime,
  onClose,
  onOpenLocation,
}: {
  item: LiteratureUnifiedItem;
  settings?: WorkbenchSettings;
  runtime?: LiteratureRuntimeStatus | null;
  onClose: () => void;
  onOpenLocation: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfjs, setPdfjs] = useState<PdfJsApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState("1");
  const [scale, setScale] = useState(PDF_SCALE_DEFAULT);
  const [readingMode, setReadingMode] = useState<ReadingMode>(readReadingMode);
  const [search, setSearch] = useState("");
  const [searchState, setSearchState] = useState("");
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [pageTextLoaded, setPageTextLoaded] = useState<Record<number, boolean>>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [translation, setTranslation] = useState<LiteratureSelectionTranslationResponse | null>(null);
  const [translationSignature, setTranslationSignature] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationStage, setTranslationStage] = useState<"idle" | "starting" | "translating">("idle");
  const [translationError, setTranslationError] = useState("");
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState<LiteratureDiscussionMessage[]>([]);
  const [discussionQuestion, setDiscussionQuestion] = useState("");
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionClearing, setDiscussionClearing] = useState(false);
  const [discussionError, setDiscussionError] = useState("");
  const [discussionReport, setDiscussionReport] = useState("");
  const [discussionModelKey, setDiscussionModelKey] = useState(readDiscussionModelKey);
  const [targetLanguage, setTargetLanguage] = useState("简体中文");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const readerRef = useRef<HTMLElement>(null);
  const usedLocalModelsRef = useRef(new Set<string>());
  const localTranslationRequestsRef = useRef(0);
  const readerClosedRef = useRef(false);
  const releaseStartedRef = useRef(false);
  const translationEnabled = settings?.translation.enabled !== false;

  const releaseReaderModels = useCallback(() => {
    if (releaseStartedRef.current || localTranslationRequestsRef.current > 0) return;
    releaseStartedRef.current = true;
    void releaseLiteratureReaderModels(usedLocalModelsRef.current);
  }, []);

  useEffect(() => {
    // Reset these refs for React StrictMode's development-only effect replay.
    readerClosedRef.current = false;
    releaseStartedRef.current = false;
    return () => {
      readerClosedRef.current = true;
      releaseReaderModels();
    };
  }, [releaseReaderModels]);

  const refreshProviders = useCallback(async () => {
    const response = await fetch("/api/hdd/providers", { cache: "no-store" });
    if (!response.ok) throw new Error(`模型列表暂不可用（HTTP ${response.status}）。`);
    const payload = await response.json() as ProviderPayload;
    return Array.isArray(payload.providers) ? payload.providers : [];
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(literatureReadingModeStorageKey, readingMode); } catch { /* private browsing/storage restrictions are non-fatal */ }
  }, [readingMode]);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPdf(null);
    setPdfjs(null);
    setPage(1);
    setPageDraft("1");
    setScale(PDF_SCALE_DEFAULT);
    setPageTexts({});
    setPageTextLoaded({});
    setSelection(null);
    setTranslation(null);
    setTranslationSignature("");
    setTranslationError("");
    fetch(`/api/literature/items/${encodeURIComponent(item.id)}/pdf`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message || `PDF 暂不可用（HTTP ${response.status}）。`);
        }
        return response.arrayBuffer();
      })
      .then((data) => import("pdfjs-dist").then((api) => {
        if (disposed) return null;
        api.GlobalWorkerOptions.workerSrc = workerUrl;
        setPdfjs(api);
        return api.getDocument({ data }).promise;
      }))
      .then((loadedDocument) => {
        if (!loadedDocument) return;
        if (disposed) {
          void loadedDocument.destroy();
          return;
        }
        setPdf(loadedDocument);
      })
      .catch((reason) => { if (!disposed) setError(displayError(reason, "PDF 无法打开。")); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; controller.abort(); };
  }, [item.id]);

  useEffect(() => {
    let disposed = false;
    setDiscussionOpen(false);
    setDiscussionMessages([]);
    setDiscussionQuestion("");
    setDiscussionClearing(false);
    setDiscussionError("");
    setDiscussionReport("");
    fetch(`/api/literature/items/${encodeURIComponent(item.id)}/discussion`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { messages?: LiteratureDiscussionMessage[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "讨论记录暂不可用。");
        return payload;
      })
      .then((payload) => { if (!disposed) setDiscussionMessages(Array.isArray(payload.messages) ? payload.messages : []); })
      .catch(() => { if (!disposed) setDiscussionMessages([]); });
    return () => { disposed = true; };
  }, [item.id]);

  useEffect(() => () => { void pdf?.destroy(); }, [pdf]);

  useEffect(() => {
    // Discussion has its own model control. Keep the existing no-provider
    // behavior when translation is disabled until the user actually opens it.
    if (!translationEnabled && !discussionOpen) {
      setProviders([]);
      setSelection(null);
      setTranslation(null);
      setTranslationSignature("");
      setTranslationError("");
      return;
    }
    let disposed = false;
    refreshProviders()
      .then((next) => { if (!disposed) setProviders(next); })
      .catch(() => { if (!disposed) setProviders([]); });
    return () => { disposed = true; };
  }, [discussionOpen, refreshProviders, translationEnabled]);

  const modelOptions = useMemo<TranslationModelOption[]>(() => {
    const options: TranslationModelOption[] = [];
    const selectedHdd = settings?.hdd;
    const runtimeModel = runtime?.model;
    const addLocalModel = (modelId: string, modelLabel: string, profileId?: string) => {
      if (!modelId || options.some((option) => option.providerId === "ollama" && option.modelId === modelId)) return;
      options.push({
        key: `ollama:${modelId}`,
        providerId: "ollama",
        providerLabel: "本地模型",
        modelId,
        modelLabel,
        available: runtimeModel?.status === "ready",
        reasoningEffort: "off",
        profileId,
      });
    };
    for (const provider of providers) {
      if (provider.id === "cli") {
        const profiles = selectedHdd?.cliProfiles ?? [];
        for (const profile of profiles) {
          options.push({
            key: `cli:${profile.id}`,
            providerId: "cli",
            providerLabel: provider.label,
            modelId: profile.model,
            modelLabel: `${profile.label}${profile.model ? ` · ${profile.model}` : ""}`,
            available: provider.available,
            reasoningEffort: selectedHdd?.reasoningEffort ?? "",
            profileId: profile.id,
            cliPath: profile.executablePath,
            cliArgs: profile.argsTemplate,
            cliPreset: profile.preset,
          });
        }
        continue;
      }
      for (const model of provider.models) {
        options.push({
          key: `${provider.id}:${model.id}`,
          providerId: provider.id,
          providerLabel: provider.label,
          modelId: model.id,
          modelLabel: model.label,
          available: provider.available,
          reasoningEffort: provider.id === selectedHdd?.provider && selectedHdd.model === model.id ? selectedHdd.reasoningEffort : provider.id === "codex" ? "medium" : "off",
        });
      }
    }
    if (!options.length) {
      const providerId = settings?.hdd.provider ?? runtime?.model.provider ?? "ollama";
      const modelId = settings?.hdd.model ?? runtime?.model.selected.runtimeTag ?? "";
      if (modelId || providerId === "codex") options.push({ key: `${providerId}:${modelId}`, providerId, providerLabel: providerId, modelId, modelLabel: modelId || "默认模型", available: false, reasoningEffort: settings?.hdd.reasoningEffort ?? "medium" });
    }
    for (const family of runtimeModel?.families ?? []) {
      for (const profile of family.profiles) {
        addLocalModel(profile.runtimeTag, `${family.name} · ${profile.profile.toUpperCase()}`, profile.profile);
      }
    }
    if (runtimeModel?.selected.runtimeTag) {
      addLocalModel(runtimeModel.selected.runtimeTag, `${runtimeModel.selected.family} · ${runtimeModel.selected.profile.toUpperCase()}`, runtimeModel.selected.profile);
    }
    if (selectedHdd?.provider === "ollama" && selectedHdd.model) {
      addLocalModel(selectedHdd.model, selectedHdd.model);
    }
    return options;
  }, [providers, runtime, settings]);

  const selectedModel = modelOptions.find((option) => option.key === selectedModelKey)
    ?? modelOptions.find((option) => option.providerId === "ollama" && option.modelId === runtime?.model.selected.runtimeTag)
    ?? modelOptions.find((option) => option.providerId === "ollama" && option.available)
    ?? modelOptions.find((option) => option.providerId === settings?.hdd.provider && option.modelId === settings.hdd.model && option.available)
    ?? modelOptions.find((option) => option.available)
    ?? modelOptions[0]
    ?? null;

  const discussionModel = modelOptions.find((option) => option.key === discussionModelKey)
    ?? selectedModel;

  useEffect(() => {
    if (!discussionModelKey) return;
    try { window.localStorage.setItem(literatureDiscussionModelStorageKey, discussionModelKey); } catch { /* private browsing/storage restrictions are non-fatal */ }
  }, [discussionModelKey]);

  const handlePageText = useCallback((pageNumber: number, text: string) => {
    setPageTexts((previous) => previous[pageNumber] === text ? previous : ({ ...previous, [pageNumber]: text }));
    setPageTextLoaded((previous) => previous[pageNumber] ? previous : ({ ...previous, [pageNumber]: true }));
  }, []);

  const scrollToPage = useCallback((target: number, force = false) => {
    if (readingMode !== "scroll" && !force) return;
    window.requestAnimationFrame(() => {
      const host = readerRef.current?.querySelector<HTMLElement>(".literature-pdf-scroll");
      host?.querySelector<HTMLElement>(`[data-pdf-page="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [readingMode]);

  const updatePage = (next: number) => {
    if (!pdf) return;
    const bounded = Math.min(pdf.numPages, Math.max(1, Math.round(next)));
    setPage(bounded);
    setPageDraft(String(bounded));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    scrollToPage(bounded);
  };

  const changeReadingMode = (next: ReadingMode) => {
    if (next === readingMode) return;
    setReadingMode(next);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    if (next === "scroll") scrollToPage(page, true);
  };

  const fitWidth = useCallback(async () => {
    if (!pdf) return;
    const currentPage = await pdf.getPage(page);
    const base = currentPage.getViewport({ scale: 1 });
    const host = readerRef.current?.querySelector<HTMLElement>(".literature-pdf-scroll");
    const available = Math.max(240, (host?.clientWidth ?? base.width) - 48);
    setScale(clampPdfScale(Math.min(3, available / base.width)));
  }, [page, pdf]);

  useEffect(() => {
    if (readingMode !== "scroll" || !pdf || !pdfjs) return;
    const host = readerRef.current?.querySelector<HTMLElement>(".literature-pdf-scroll");
    if (!host) return;
    const syncCurrentPage = () => {
      const hostRect = host.getBoundingClientRect();
      const visible = Array.from(host.querySelectorAll<HTMLElement>("[data-pdf-page]"))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.height > 0 && rect.bottom > hostRect.top + 8 && rect.top < hostRect.bottom);
      const candidate = visible.sort((left, right) => Math.abs(left.rect.top - hostRect.top) - Math.abs(right.rect.top - hostRect.top))[0];
      const next = Number(candidate?.element.dataset.pdfPage);
      if (Number.isInteger(next) && next > 0 && next <= pdf.numPages) {
        setPage(next);
        setPageDraft(String(next));
      }
    };
    host.addEventListener("scroll", syncCurrentPage, { passive: true });
    syncCurrentPage();
    return () => host.removeEventListener("scroll", syncCurrentPage);
  }, [pdf, pdfjs, readingMode, scale]);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim().toLocaleLowerCase();
    setSearchState("");
    if (!pdf || !query) return;
    setSearchState("搜索中…");
    try {
      for (let current = 1; current <= pdf.numPages; current += 1) {
        const text = pageTexts[current] ?? textContentString(filterPdfTextContentItems((await (await pdf.getPage(current)).getTextContent()).items));
        if (text.toLocaleLowerCase().includes(query)) {
          setPageTexts((previous) => ({ ...previous, [current]: text }));
          updatePage(current);
          setSearchState(`第 ${current} 页找到匹配`);
          return;
        }
      }
      setSearchState("未找到匹配文本");
    } catch (reason) {
      setSearchState(displayError(reason, "搜索失败。"));
    }
  };

  const translateSelection = async () => {
    if (!translationEnabled || !selection || !selectedModel) return;
    const localTranslation = selectedModel.providerId === "ollama";
    if (localTranslation) {
      usedLocalModelsRef.current.add(selectedModel.modelId);
      localTranslationRequestsRef.current += 1;
    }
    setTranslationLoading(true);
    setTranslationStage(localTranslation ? "starting" : "translating");
      setTranslationError("");
    try {
      setTranslationStage("translating");
      const response = await fetch("/api/literature/translate-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          page: selection.page,
          text: selection.text,
          mode: pdfSelectionMode(selection.text),
          sourceLanguage: "auto",
          targetLanguage,
          model: {
            providerId: selectedModel.providerId,
            modelId: selectedModel.modelId,
            profileId: selectedModel.profileId,
            reasoningEffort: selectedModel.reasoningEffort,
            cliPath: selectedModel.cliPath,
            cliArgs: selectedModel.cliArgs,
            cliPreset: selectedModel.cliPreset,
          },
        }),
      });
      const payload = await response.json().catch(() => ({})) as LiteratureSelectionTranslationResponse & { message?: string };
      if (!response.ok) throw new Error(payload.message || `翻译暂不可用（HTTP ${response.status}）。`);
      setTranslation(payload);
      setTranslationSignature(selectionSignature(selection, targetLanguage, selectedModel));
    } catch (reason) {
      setTranslationError(displayError(reason, "翻译失败，请检查模型后重试。"));
    } finally {
      if (localTranslation) {
        localTranslationRequestsRef.current = Math.max(0, localTranslationRequestsRef.current - 1);
        if (readerClosedRef.current) releaseReaderModels();
      }
      setTranslationLoading(false);
      setTranslationStage("idle");
    }
  };

  const askDiscussion = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = discussionQuestion.trim();
    if (!question || discussionLoading) return;
    const selectedDiscussionModel = discussionModel;
    const localModel = selectedDiscussionModel?.providerId === "ollama" ? selectedDiscussionModel.modelId : "";
    if (localModel) {
      usedLocalModelsRef.current.add(localModel);
      localTranslationRequestsRef.current += 1;
    }
    setDiscussionLoading(true);
    setDiscussionError("");
    try {
      const response = await fetch(`/api/literature/items/${encodeURIComponent(item.id)}/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          question,
          page,
          selectedText: selection?.text ?? null,
          model: discussionModelPayload(selectedDiscussionModel),
        }),
      });
      const payload = await response.json().catch(() => ({})) as LiteratureDiscussionResponse & { message?: string };
      if (!response.ok) throw new Error(payload.message || `讨论暂不可用（HTTP ${response.status}）。`);
      setDiscussionMessages(payload.messages ?? []);
      setDiscussionQuestion("");
      setDiscussionOpen(true);
      setDiscussionReport(payload.report?.message ?? "");
    } catch (reason) {
      setDiscussionError(displayError(reason, "讨论失败，请检查本地模型后重试。"));
    } finally {
      if (localModel) {
        localTranslationRequestsRef.current = Math.max(0, localTranslationRequestsRef.current - 1);
        if (readerClosedRef.current) releaseReaderModels();
      }
      setDiscussionLoading(false);
    }
  };

  const clearDiscussion = async () => {
    if (discussionClearing || discussionLoading || !discussionMessages.length) return;
    if (!window.confirm("确定清空当前文章的 AI 讨论记录吗？\n\n这只会删除 ObsUI 中的对话记录，不会删除 PDF、Zotero 数据或已写入 Obsidian 的报告。")) return;
    setDiscussionClearing(true);
    setDiscussionError("");
    try {
      const response = await fetch(`/api/literature/items/${encodeURIComponent(item.id)}/discussion`, { method: "DELETE", cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { messages?: LiteratureDiscussionMessage[]; message?: string };
      if (!response.ok) throw new Error(payload.message || `清空讨论失败（HTTP ${response.status}）。`);
      setDiscussionMessages([]);
      setDiscussionQuestion("");
      setDiscussionReport(payload.message ?? "已清空当前文章的讨论记录；已写入 Obsidian 的报告未改动。");
    } catch (reason) {
      setDiscussionError(displayError(reason, "清空讨论失败，请重试。"));
    } finally {
      setDiscussionClearing(false);
    }
  };

  const currentTranslationSignature = selection && selectedModel ? selectionSignature(selection, targetLanguage, selectedModel) : "";
  const translationIsCurrent = Boolean(translation && translationSignature === currentTranslationSignature);
  const selectionPopoverStyle: CSSProperties | undefined = selection ? { left: Math.min(Math.max(12, window.innerWidth - 132), Math.max(12, selection.left)), top: Math.max(12, selection.top - 42) } : undefined;

  return <section ref={readerRef} className="literature-reader" role="dialog" aria-modal="true" aria-labelledby="literature-reader-title">
    <header className="literature-reader-header">
      <div className="literature-reader-title"><span className="literature-kicker">PDF READER</span><h2 id="literature-reader-title">{item.title}</h2><small>{item.fileName ?? item.relativePath ?? "Zotero PDF 附件"}</small></div>
      <div className="literature-reader-header-actions"><button type="button" className={`literature-reader-secondary${discussionOpen ? " is-active" : ""}`} onClick={() => setDiscussionOpen((value) => !value)}><IoChatbubbleEllipsesOutline aria-hidden="true" />讨论文章</button><button type="button" className="literature-reader-secondary" onClick={onOpenLocation}><IoLocateOutline aria-hidden="true" />打开位置</button><button type="button" className="literature-icon-button" aria-label="关闭 PDF 阅读器" onClick={onClose}><IoCloseOutline aria-hidden="true" /></button></div>
    </header>
    <div className="literature-reader-toolbar">
      <div className="literature-reader-page-controls"><button type="button" className="literature-icon-button" disabled={!pdf || page <= 1} aria-label="上一页" onClick={() => updatePage(page - 1)}><IoChevronBackOutline /></button><form onSubmit={(event) => { event.preventDefault(); updatePage(Number(pageDraft)); }}><input aria-label="跳转页码" inputMode="numeric" value={pageDraft} onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ""))} /><span>/ {pdf?.numPages ?? "—"}</span></form><button type="button" className="literature-icon-button" disabled={!pdf || page >= (pdf?.numPages ?? 1)} aria-label="下一页" onClick={() => updatePage(page + 1)}><IoChevronForwardOutline /></button></div>
      <div className="literature-reader-mode-switch" role="group" aria-label="阅读方式"><span>阅读方式</span><button type="button" className={readingMode === "page" ? "is-active" : ""} aria-pressed={readingMode === "page"} onClick={() => changeReadingMode("page")}>翻页</button><button type="button" className={readingMode === "scroll" ? "is-active" : ""} aria-pressed={readingMode === "scroll"} onClick={() => changeReadingMode("scroll")}>连续</button></div>
      <div className="literature-reader-zoom" aria-label="文档缩放"><button type="button" className="literature-icon-button" disabled={!pdf || scale <= PDF_SCALE_MIN} aria-label="缩小" title="缩小文档" onClick={() => setScale((value) => adjustPdfScale(value, -PDF_SCALE_STEP))}><IoRemoveOutline /></button><span className="literature-reader-zoom-value" aria-live="polite">{Math.round(scale * 100)}%</span><input type="range" min={PDF_SCALE_MIN} max={PDF_SCALE_MAX} step={PDF_SCALE_STEP} value={scale} aria-label="文档缩放比例" disabled={!pdf} onChange={(event) => setScale(clampPdfScale(Number(event.target.value)))} /><button type="button" className="literature-icon-button" disabled={!pdf || scale >= PDF_SCALE_MAX} aria-label="放大" title="放大文档" onClick={() => setScale((value) => adjustPdfScale(value, PDF_SCALE_STEP))}><IoAddOutline /></button><button type="button" className="literature-reader-secondary" onClick={() => void fitWidth()}><IoResizeOutline aria-hidden="true" />适合宽度</button><button type="button" className="literature-reader-secondary" onClick={() => setScale(1)}><IoExpandOutline aria-hidden="true" />100%</button></div>
      <form className="literature-reader-search" onSubmit={runSearch}><IoSearchOutline aria-hidden="true" /><input aria-label="搜索 PDF 文本" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文档文本" /><button type="submit" aria-label="搜索"><IoSearchOutline /></button></form>
    </div>
    {searchState && <div className="literature-reader-search-state" role="status">{searchState}</div>}
    <div className={`literature-reader-body${discussionOpen ? " is-discussion-open" : ""}`}>
      <div className={`literature-pdf-scroll${readingMode === "scroll" ? " literature-pdf-scroll--continuous" : ""}`}>
        {loading && <div className="literature-reader-empty"><IoBookOutlineFallback /><b>正在加载 PDF…</b></div>}
        {!loading && error && <div className="literature-reader-empty literature-reader-empty--error"><IoWarningFallback /><b>{error}</b><span>请确认文献仍存在且是有效的 PDF 文件。</span></div>}
        {!loading && !error && pdf && pdfjs && (readingMode === "scroll" ? Array.from({ length: pdf.numPages }, (_, index) => <PageView key={index + 1} pdfjs={pdfjs} pdf={pdf} pageNumber={index + 1} scale={scale} onSelection={setSelection} onPageText={handlePageText} />) : <PageView pdfjs={pdfjs} pdf={pdf} pageNumber={page} scale={scale} onSelection={setSelection} onPageText={handlePageText} />)}
        {!loading && !error && pdf && readingMode === "page" && pageTextLoaded[page] && !pageTexts[page] && <p className="literature-reader-no-text">当前文献暂无可选文本；这可能是扫描型 PDF，OCR 不在首版范围内。</p>}
      </div>
      {translationEnabled && selection && <button type="button" className="literature-translate-popover" style={selectionPopoverStyle} onMouseDown={(event) => event.preventDefault()} onClick={() => void translateSelection()} disabled={translationLoading || !selectedModel}><IoLanguageOutline aria-hidden="true" />{translationStage === "starting" ? "启动本地模型…" : translationLoading ? "翻译中…" : "翻译"}</button>}
      {translationEnabled && translation && <aside className={`literature-translation-card${translationIsCurrent ? "" : " is-stale"}`} aria-label="选区翻译结果"><header><div><span className="literature-kicker">{translation.mode === "word" ? "WORD SENSE" : "SELECTION TRANSLATION"}</span><b>{translation.sourceLanguage} → {translation.targetLanguage}</b>{selectedModel && <small className="literature-translation-model">{selectedModel.providerLabel} · {selectedModel.modelLabel}</small>}</div><IoSparklesOutline aria-hidden="true" /></header>{!translationIsCurrent && <p className="literature-translation-stale">翻译目标或模型已变化，当前结果可能已过期。</p>}{translation.mode === "word" && translation.partOfSpeech && <span className="literature-translation-pos">{translation.partOfSpeech}</span>}<strong>{translation.translation}</strong>{translation.pronunciation && <span className="literature-translation-pronunciation">{translation.pronunciation}</span>}{translation.senses?.length ? <ul>{translation.senses.map((sense) => <li key={sense}>{sense}</li>)}</ul> : null}{translation.example && <p className="literature-translation-example">例：{translation.example}</p>}{!translationIsCurrent && <button type="button" className="literature-reader-secondary" onClick={() => void translateSelection()} disabled={translationLoading || !selectedModel}><IoLanguageOutline aria-hidden="true" />重新翻译</button>}</aside>}
      {discussionOpen && <aside className="literature-discussion-panel" aria-label="论文讨论">
        <header>
          <div className="literature-discussion-heading"><span className="literature-kicker">PAPER DISCUSSION</span><b>和 AI 讨论这篇文章</b><small>回答会优先引用当前 PDF 的相关页；选中文本后提问会更精确。</small></div>
          <div className="literature-discussion-header-tools">
            <label className="literature-discussion-model-control"><span>讨论模型</span><select aria-label="讨论模型" value={discussionModel?.key ?? ""} onChange={(event) => setDiscussionModelKey(event.target.value)} disabled={!modelOptions.length}>{modelOptions.length ? modelOptions.map((option) => <option value={option.key} key={option.key}>{option.providerLabel} · {option.modelLabel}{option.available ? "" : " · 启动时检查"}</option>) : <option value="">正在读取可用模型…</option>}</select><small>{discussionModel ? `${discussionModel.providerLabel} · ${discussionModel.modelLabel} · 用于下一次提问` : "打开讨论后读取可用模型"}</small></label>
            <button type="button" className="literature-icon-button literature-discussion-clear" aria-label="清空当前文章讨论" title="清空当前文章讨论" onClick={() => void clearDiscussion()} disabled={discussionClearing || discussionLoading || !discussionMessages.length}><IoTrashOutline aria-hidden="true" /></button>
            <button type="button" className="literature-icon-button" aria-label="关闭论文讨论" onClick={() => setDiscussionOpen(false)}><IoCloseOutline /></button>
          </div>
        </header>
        <div className="literature-discussion-context"><IoLocateOutline aria-hidden="true" /><span>当前上下文：第 {page} 页{selection ? " · 已附加选中文本" : " · 自动检索相关页"}</span></div>
        <div className="literature-discussion-messages">
          {!discussionMessages.length && <div className="literature-discussion-empty"><IoChatbubbleEllipsesOutline /><b>从一个具体问题开始</b><span>例如：这篇文章的方法假设是什么？实验如何验证？</span></div>}
          {discussionMessages.map((message) => <article className={`literature-discussion-message is-${message.role}`} key={message.id}><span>{message.role === "user" ? "你 · 问题" : "AI · 基于原文"}</span>{message.role === "assistant" ? <DiscussionMessageContent content={message.content} citations={message.citations} /> : <p>{message.content}</p>}</article>)}
          {discussionLoading && <div className="literature-discussion-loading" role="status"><span className="literature-discussion-loading-dot" />正在阅读相关页面并组织回答…</div>}
        </div>
        {discussionReport && <p className="literature-discussion-report" role="status">{discussionReport}</p>}
        {discussionError && <p className="literature-reader-error" role="alert">{discussionError}</p>}
        <div className="literature-discussion-presets"><button type="button" onClick={() => setDiscussionQuestion("这篇文章的研究问题、核心方法和主要结论分别是什么？")}>概括文章</button><button type="button" onClick={() => setDiscussionQuestion("作者的方法有哪些关键假设？这些假设可能带来什么局限？")}>找出假设</button><button type="button" onClick={() => setDiscussionQuestion("实验或数据是如何支持结论的？有哪些地方需要回到原文核对？")}>检查证据</button></div>
        <form className="literature-discussion-form" onSubmit={(event) => void askDiscussion(event)}><textarea aria-label="讨论问题" rows={3} value={discussionQuestion} onChange={(event) => setDiscussionQuestion(event.target.value)} placeholder="询问文章内容；可先选中一段文字再提问" /><button type="submit" disabled={discussionLoading || !discussionQuestion.trim()}>{discussionLoading ? "思考中…" : "发送"}</button></form>
      </aside>}
    </div>
    <footer className="literature-reader-footer"><span>{translationEnabled ? "选中文本后点击“翻译”才会发送内容；结果只保留在本次阅读会话。" : "选区翻译已停用；可在设置 → 插件中重新启用。"}</span>{translationEnabled && <><label><IoLanguageOutline aria-hidden="true" /><span>目标语言</span><select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}><option>简体中文</option><option>繁體中文</option><option>English</option><option>日本語</option><option>한국어</option></select></label><label><IoSparklesOutline aria-hidden="true" /><span>翻译模型</span><select value={selectedModel?.key ?? ""} onChange={(event) => setSelectedModelKey(event.target.value)} disabled={!modelOptions.length}>{modelOptions.map((option) => <option value={option.key} key={option.key}>{option.providerLabel} · {option.modelLabel}{option.available ? "" : " · 启动时检查"}</option>)}</select></label>{selectedModel?.providerId === "ollama" && <span className="literature-translation-fast-note">本地快速模式 · 启动时检查服务 · 退出阅读器释放模型</span>}{translationError && <span className="literature-reader-error" role="alert">{translationError}</span>}</>}</footer>
  </section>;
}

function formatDiscussionPageRanges(pages: number[]) {
  const sortedPages = [...new Set(pages.filter((page) => Number.isFinite(page)))].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start = sortedPages[0];
  let end = sortedPages[0];

  for (const page of sortedPages.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    ranges.push(start === end ? `${start}` : end === start + 1 ? `${start}、${end}` : `${start}–${end}`);
    start = page;
    end = page;
  }
  if (sortedPages.length > 0) ranges.push(start === end ? `${start}` : end === start + 1 ? `${start}、${end}` : `${start}–${end}`);
  return ranges.join("、");
}

function DiscussionMessageContent({ content, citations }: { content: string; citations: LiteratureDiscussionMessage["citations"] }) {
  const blocks = content.trim().split(/\n{2,}/g).map((block) => block.trim()).filter(Boolean);
  const pages = [...new Set(citations.map((citation) => citation.page).filter((page) => Number.isFinite(page)))].sort((left, right) => left - right);
  const scope = pages.length > 0 ? `本次参考 ${pages.length} 页：第 ${formatDiscussionPageRanges(pages)} 页` : "";
  return <div className="literature-discussion-content">{scope && <div className="literature-discussion-scope" role="note"><span className="literature-discussion-scope-label">阅读范围</span><span>{scope}</span></div>}{blocks.map((block, index) => {
    const lines = block.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    const headingMatch = lines[0]?.match(/^#{1,3}\s*(.+)$/)?.[1] ?? lines[0]?.match(/^(结论|原文依据|解释|不确定性|无法确认|建议继续追问|可以继续问)[：:]?$/)?.[1];
    if (!headingMatch) return <p key={`${index}-${block.slice(0, 12)}`}>{block}</p>;
    const heading = headingMatch.replace(/[：:]$/, "");
    const body = lines.slice(1);
    const bullets = body.filter((line) => /^[-*•]/.test(line)).map((line) => line.replace(/^[-*•]\s*/, ""));
    const prose = body.filter((line) => !/^[-*•]/.test(line));
    return <section key={`${index}-${heading}`}><b>{heading}</b>{prose.length > 0 && <p>{prose.join("\n")}</p>}{bullets.length > 0 && <ul>{bullets.map((bullet, bulletIndex) => <li key={`${bulletIndex}-${bullet.slice(0, 12)}`}>{bullet}</li>)}</ul>}</section>;
  })}</div>;
}

function IoBookOutlineFallback() {
  return <span className="literature-reader-loading-icon" aria-hidden="true">PDF</span>;
}

function IoWarningFallback() {
  return <span className="literature-reader-loading-icon literature-reader-loading-icon--error" aria-hidden="true">!</span>;
}
