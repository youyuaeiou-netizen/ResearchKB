import { createRoot, type Root } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterLiteratureItems, type LiteratureItemsResponse, type LiteratureOrganizationPreview, type LiteratureRuntimeStatus, type LiteratureUnifiedItem } from "../src/literature";
import { LiteraturePageV2, resetLiteraturePageSessionCache } from "../src/tab-modal-v2/LiteraturePageV2";
import { adjustPdfScale, clampPdfScale, filterPdfTextContentItems, isLikelyPdfWatermarkTextItem, normalizePdfSelectionText, normalizePdfWordSelectionText, pdfSelectionMode, releaseLiteratureReaderModels } from "../src/tab-modal-v2/LiteratureReader";
import { DEFAULT_WORKBENCH_SETTINGS } from "../src/workbench-settings";

const mounts: { host: HTMLDivElement; root: Root }[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("PDF 选区文本", () => {
  it("joins line-break hyphenation and removes spacing before punctuation", () => {
    expect(normalizePdfSelectionText("laser powder bed fu-\n sion (LPBF) , which")).toBe("laser powder bed fusion (LPBF), which");
  });

  it("removes only boundary punctuation when a single PDF word is selected", () => {
    expect(normalizePdfWordSelectionText("However,")).toBe("However");
    expect(normalizePdfWordSelectionText("‘pre-proof’")).toBe("pre-proof");
    expect(normalizePdfWordSelectionText("C++")).toBe("C++");
    expect(normalizePdfWordSelectionText("However, intrinsically")).toBe("However, intrinsically");
    expect(pdfSelectionMode("However,")).toBe("word");
    expect(pdfSelectionMode("However, intrinsically")).toBe("passage");
  });

  it("keeps diagonal watermark text out of every selectable PDF layer", () => {
    const bodyText = { str: "work,", dir: "ltr", transform: [12, 0, 0, 12, 90, 350], width: 34, height: 12, fontName: "body", hasEOL: false };
    const watermark = { str: "Journal Pre-proof", dir: "ltr", transform: [42.4, 42.4, -42.4, 42.4, 133.8, 257.1], width: 463.5, height: 60, fontName: "watermark", hasEOL: false };
    const unknownDiagonalStamp = { str: "INTERNAL REVIEW", dir: "ltr", transform: [28, 16, -16, 28, 120, 300], width: 180, height: 30, fontName: "stamp", hasEOL: false };
    const markedContent = { type: "beginMarkedContent", id: "artifact" };

    expect(isLikelyPdfWatermarkTextItem(bodyText)).toBe(false);
    expect(isLikelyPdfWatermarkTextItem(watermark)).toBe(true);
    expect(isLikelyPdfWatermarkTextItem(unknownDiagonalStamp)).toBe(true);
    expect(filterPdfTextContentItems([bodyText, watermark, unknownDiagonalStamp, markedContent])).toEqual([bodyText, markedContent]);
  });

  it("removes oversized known watermark stamps while preserving regular headings", () => {
    const heading = { str: "Abstract", dir: "ltr", transform: [14, 0, 0, 14, 90, 430], width: 48, height: 14, fontName: "heading", hasEOL: true };
    const stamp = { str: "CONFIDENTIAL", dir: "ltr", transform: [44, 0, 0, 44, 90, 430], width: 260, height: 44, fontName: "stamp", hasEOL: false };
    const publisherLabel = { str: "Journal Pre-proof", dir: "ltr", transform: [19, 0, 0, 19, 90, 780], width: 116, height: 19, fontName: "stamp", hasEOL: false };
    const proseWord = { str: "draft", dir: "ltr", transform: [12, 0, 0, 12, 90, 430], width: 30, height: 12, fontName: "body", hasEOL: false };

    expect(isLikelyPdfWatermarkTextItem(heading)).toBe(false);
    expect(isLikelyPdfWatermarkTextItem(stamp)).toBe(true);
    expect(isLikelyPdfWatermarkTextItem(publisherLabel)).toBe(true);
    expect(isLikelyPdfWatermarkTextItem(proseWord)).toBe(false);
  });

  it("keeps document zoom inside the supported range", () => {
    expect(clampPdfScale(Number.NaN)).toBe(1.15);
    expect(clampPdfScale(0.1)).toBe(0.5);
    expect(clampPdfScale(4)).toBe(3.5);
    expect(adjustPdfScale(0.5, -0.1)).toBe(0.5);
    expect(adjustPdfScale(1.15, 0.1)).toBe(1.25);
  });

  it("releases each local model used by a closing reader session", async () => {
    const request = vi.fn(async () => jsonResponse({ ok: true }));
    await releaseLiteratureReaderModels(["qwen3.5:9b-64k", "qwen3.5:9b-64k", "qwen3.5:9b-128k"], request as typeof fetch);

    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("/api/local-models/control", expect.objectContaining({
      method: "POST",
      keepalive: true,
      body: JSON.stringify({ action: "stop-model", model: "qwen3.5:9b-64k", protectExternalConsumers: true }),
    }));
  });
});

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounts.push({ host, root });
  await act(async () => {
    root.render(node);
    await Promise.resolve();
    await Promise.resolve();
  });
  return host;
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function changeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

function createItem(overrides: Partial<LiteratureUnifiedItem> = {}): LiteratureUnifiedItem {
  return {
    id: "local-1",
    source: "local",
    status: "ready",
    title: "A physics-guided deep generative model for predicting melt pool behavior",
    translatedTitleZh: "面向熔池行为预测的物理引导深度生成模型",
    authors: ["Kim"],
    year: 2024,
    journal: null,
    abstract: "The paper studies melt pool behavior with a physics-guided generative model.",
    summaryZh: "本文研究使用物理引导的生成模型预测熔池行为。",
    suggestedTags: ["LPBF", "physics-informed"],
    confidence: 0.91,
    review: { required: false, reasons: [] },
    analysisSource: "text",
    evidence: ["Abstract"],
    relativePath: "LPBF/A physics-guided model.pdf",
    folderName: "LPBF",
    fileName: "A physics-guided model.pdf",
    size: 1024,
    mtimeMs: Date.now(),
    sourceAvailability: "present",
    doi: "10.1000/example",
    url: null,
    attachmentCount: 0,
    zoteroItemKey: null,
    zoteroAttachmentKey: null,
    duplicateCandidates: [],
    importOperation: null,
    error: null,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createRuntime(items: readonly LiteratureUnifiedItem[]): LiteratureRuntimeStatus {
  const local = items.filter((item) => item.source !== "zotero");
  const counts = {
    detected: local.filter((item) => item.status === "detected").length,
    analyzing: local.filter((item) => item.status === "analyzing").length,
    ready: local.filter((item) => item.status === "ready").length,
    matched: local.filter((item) => item.status === "matched").length,
    conflict: local.filter((item) => item.status === "conflict").length,
    importing: local.filter((item) => item.status === "importing").length,
    imported: local.filter((item) => item.status === "imported").length,
    failed: local.filter((item) => item.status === "failed").length,
    "partial-failed": local.filter((item) => item.status === "partial-failed").length,
    ignored: local.filter((item) => item.status === "ignored").length,
    missing: local.filter((item) => item.status === "missing").length,
    total: items.length,
    zotero: items.filter((item) => item.source === "zotero").length,
  };
  return {
    settings: { version: 2, inboxConfigured: true, inboxDisplayName: "ResearchPapers", modelFamily: "qwen3.5:9b", modelProfile: "64k", runtimeTag: "qwen3.5:9b-64k", deepAnalysisProvider: "ollama", deepAnalysisModel: "", deepAnalysisReasoningEffort: "medium" },
    watcher: { active: true, lastScanAt: Date.now(), error: null },
    model: { provider: "ollama", status: "ready", configured: true, selected: { family: "qwen3.5:9b", profile: "64k", runtimeTag: "qwen3.5:9b-64k" }, families: [{ name: "qwen3.5:4b", profiles: [{ profile: "default", runtimeTag: "qwen3.5:4b", contextLength: null, size: 3_000_000_000, modifiedAt: Date.now() }] }, { name: "qwen3.5:9b", profiles: [{ profile: "64k", runtimeTag: "qwen3.5:9b-64k", contextLength: 65_536, size: 6_600_000_000, modifiedAt: Date.now() }, { profile: "128k", runtimeTag: "qwen3.5:9b-128k", contextLength: 131_072, size: 6_600_000_000, modifiedAt: Date.now() }] }], error: null },
    zotero: { connected: true, authorized: false, serverId: "server-1", version: "3", error: null },
    counts,
    checkedAt: Date.now(),
  };
}

let fixtureItems: LiteratureUnifiedItem[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetLiteraturePageSessionCache();
  fixtureItems = [
    createItem(),
    createItem({ id: "zotero-2", source: "zotero", status: "imported", title: "A conceptual multi-laser integration technology", translatedTitleZh: null, authors: ["Peng"], year: 2021, journal: "Science", abstract: "A Zotero abstract.", summaryZh: null, suggestedTags: [], analysisSource: null, relativePath: null, folderName: null, fileName: null, size: null, mtimeMs: null, doi: "10.1126/science.abg1487", attachmentCount: 1, zoteroItemKey: "ABCD1234" }),
  ];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url, "http://localhost").pathname;
    if (path === "/api/literature/status") return jsonResponse(createRuntime(fixtureItems));
    if (path === "/api/literature/items") {
      const parsed = new URL(url, "http://localhost");
      const collection = parsed.searchParams.get("collection") ?? "library";
      const query = parsed.searchParams.get("q") ?? "";
      const response: LiteratureItemsResponse = { items: collection === "all" ? fixtureItems : filterLiteratureItems(fixtureItems, collection, query), total: fixtureItems.length, checkedAt: Date.now() };
      return jsonResponse(response);
    }
    if (path === "/api/literature/select-folder" && init?.method === "POST") {
      const runtime = createRuntime(fixtureItems);
      runtime.settings = { version: 2, inboxConfigured: true, inboxDisplayName: "Journal", modelFamily: "qwen3.5:9b", modelProfile: "64k", runtimeTag: "qwen3.5:9b-64k", deepAnalysisProvider: "ollama", deepAnalysisModel: "", deepAnalysisReasoningEffort: "medium" };
      return jsonResponse({ ...runtime, folderSelection: "selected" });
    }
    if (path === "/api/literature/settings" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body ?? "{}")) as { inboxPath?: string | null; modelFamily?: string; modelProfile?: string; runtimeTag?: string; deepAnalysisProvider?: "ollama" | "codex"; deepAnalysisModel?: string; deepAnalysisReasoningEffort?: string };
      const runtime = createRuntime(fixtureItems);
      runtime.settings = { version: 2, inboxConfigured: body.inboxPath !== null, inboxDisplayName: body.inboxPath ? "Journal" : "ResearchPapers", modelFamily: body.modelFamily ?? "qwen3.5:9b", modelProfile: body.modelProfile ?? "64k", runtimeTag: body.runtimeTag ?? "qwen3.5:9b-64k", deepAnalysisProvider: body.deepAnalysisProvider ?? "ollama", deepAnalysisModel: body.deepAnalysisModel ?? "", deepAnalysisReasoningEffort: body.deepAnalysisReasoningEffort ?? "medium" };
      return jsonResponse(runtime);
    }
    if (path === "/api/literature/rescan") return jsonResponse(createRuntime(fixtureItems));
    if (path === "/api/literature/tasks/analyze" && init?.method === "POST") return jsonResponse({ id: "task-1", status: "queued" }, 202);
    if (path === "/api/literature/tasks") return jsonResponse({ tasks: [] });
    if (path === "/api/hdd/providers") return jsonResponse({ providers: [{ id: "codex", available: true, models: [{ id: "gpt-6-astra", label: "GPT-6 Astra", reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"], isDefault: true }, { id: "gpt-6-luna", label: "GPT-6 Luna", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] }] }] });
    if (/^\/api\/literature\/items\/[^/]+\/deep-report$/.test(path) && init?.method === "POST") return jsonResponse({ message: "已打开深读报告。" });
    const pdfMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/pdf$/);
    if (pdfMatch && (!init?.method || init.method === "GET")) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({ message: "测试文献未提供 PDF。" }) } as Response;
    if (path === "/api/literature/organize/preview") {
      const preview: LiteratureOrganizationPreview = {
        rootDisplayName: "ObsUI-Literature\\Journal",
        items: [{ id: "local-1", sourceRelativePath: "raw.pdf", targetRelativePath: "Journal\\Additive Manufacturing\\A physics-guided deep generative model.pdf", title: "A physics-guided deep generative model for predicting melt pool behavior", journal: "Additive Manufacturing", status: "move", reason: "根据已分析的标题和期刊生成目标路径。" }],
        summary: { move: 1, unchanged: 0, review: 0, conflict: 0, total: 1 },
        generatedAt: Date.now(),
      };
      return jsonResponse(preview);
    }
    if (path === "/api/literature/organize/commit" && init?.method === "POST") return jsonResponse({ moved: 1, message: "已整理 1 个文件。" });
    const ignoreMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/ignore$/);
    if (ignoreMatch && init?.method === "POST") {
      const id = decodeURIComponent(ignoreMatch[1]);
      fixtureItems = fixtureItems.map((item) => item.id === id ? { ...item, status: "ignored" as const } : item);
      return jsonResponse(fixtureItems.find((item) => item.id === id));
    }
    const restoreMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/restore$/);
    if (restoreMatch && init?.method === "POST") {
      const id = decodeURIComponent(restoreMatch[1]);
      fixtureItems = fixtureItems.map((item) => item.id === id ? { ...item, status: "ready" as const } : item);
      return jsonResponse(fixtureItems.find((item) => item.id === id));
    }
    const removeMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/remove$/);
    if (removeMatch && init?.method === "POST") {
      const id = decodeURIComponent(removeMatch[1]);
      fixtureItems = fixtureItems.filter((item) => item.id !== id);
      return jsonResponse({ id, removed: true });
    }
    const deleteZoteroMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/delete-zotero$/);
    if (deleteZoteroMatch && init?.method === "POST") {
      const id = decodeURIComponent(deleteZoteroMatch[1]);
      fixtureItems = fixtureItems.filter((item) => item.id !== id);
      return jsonResponse({ id, deleted: true, movedToTrash: true, message: "已移入 Zotero 回收站。" });
    }
    const openMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/open$/);
    if (openMatch && init?.method === "POST") return jsonResponse({ message: "已打开文献所在文件夹。" });
    const openDocumentMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/open-document$/);
    if (openDocumentMatch && init?.method === "POST") {
      const id = decodeURIComponent(openDocumentMatch[1]);
      return jsonResponse(id === "local-1" ? { kind: "file", message: "已打开文献附件。" } : { kind: "doi", message: "未找到本地附件，已打开 DOI。" });
    }
    const analyzeMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/analyze$/);
    if (analyzeMatch) {
      const id = decodeURIComponent(analyzeMatch[1]);
      fixtureItems = fixtureItems.map((item) => item.id === id ? { ...item, status: "ready" as const } : item);
      return jsonResponse(fixtureItems.find((item) => item.id === id));
    }
    const importMatch = path.match(/^\/api\/literature\/items\/([^/]+)\/import$/);
    if (importMatch) {
      const id = decodeURIComponent(importMatch[1]);
      fixtureItems = fixtureItems.map((item) => item.id === id ? { ...item, source: "merged" as const, status: "imported" as const, zoteroItemKey: "NEWKEY01", attachmentCount: 1 } : item);
      return jsonResponse(fixtureItems.find((item) => item.id === id));
    }
    return jsonResponse({ message: `Unexpected test request: ${url}` }, 500);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const { host, root } of mounts.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.unstubAllGlobals();
});

describe("文献 V2 页面", () => {
  it("queues only the highlighted Zotero paper for deep analysis", async () => {
    const host = await mount(<LiteraturePageV2 startupRuntime={createRuntime(fixtureItems)} startupItems={fixtureItems} />);
    const selected = [...host.querySelectorAll<HTMLButtonElement>(".literature-item-row")].find((button) => button.textContent?.includes("A conceptual multi-laser"));
    expect(selected).toBeTruthy();
    await act(async () => selected!.click());
    const analyze = host.querySelector<HTMLButtonElement>(".literature-toolbar-button--analysis");
    expect(analyze?.title).toBe("深读当前高亮文献");
    await act(async () => analyze!.click());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/literature/tasks/analyze", expect.objectContaining({ body: JSON.stringify({ itemIds: ["zotero-2"] }) })));
    expect(host.textContent).toContain("打开深读报告");
  });

  it("lists the installed secondary local model and live ChatGPT model choices", async () => {
    const host = await mount(<LiteraturePageV2 startupRuntime={createRuntime(fixtureItems)} startupItems={fixtureItems} />);
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="文献数据库设置"]')?.click();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/hdd/providers", expect.anything()));
    });
    const dialog = document.body.querySelector('.literature-settings-dialog[role="dialog"]')!;
    const backdrop = document.body.querySelector(".literature-settings-backdrop");
    expect(backdrop?.parentElement).toBe(document.body);
    const localModels = dialog.querySelectorAll<HTMLSelectElement>("select")[0]!;
    expect([...localModels.options].map((option) => option.value)).toContain("qwen3.5:4b");
    const provider = dialog.querySelectorAll<HTMLSelectElement>("select")[2]!;
    changeSelect(provider, "codex");
    const codexModel = dialog.querySelectorAll<HTMLSelectElement>("select")[3]!;
    await act(async () => {
      await vi.waitFor(() => expect([...codexModel.options].map((option) => option.value)).toContain("gpt-6-astra"));
    });
    changeSelect(codexModel, "gpt-6-luna");
    const effortOptions = dialog.querySelectorAll<HTMLSelectElement>("select")[4]!;
    expect([...effortOptions.options].map((option) => option.value)).not.toContain("ultra");
    expect(dialog.textContent).toContain("扫描页图像仅在本机 OCR，不上传");
  });

  it("requires a per-run confirmation before queuing a cloud deep analysis", async () => {
    const cloudRuntime = createRuntime(fixtureItems);
    cloudRuntime.settings.deepAnalysisProvider = "codex";
    cloudRuntime.settings.deepAnalysisModel = "gpt-6-astra";
    cloudRuntime.settings.deepAnalysisReasoningEffort = "medium";
    const confirmation = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmation);
    const host = await mount(<LiteraturePageV2 startupRuntime={cloudRuntime} startupItems={fixtureItems} />);
    await act(async () => host.querySelector<HTMLButtonElement>(".literature-toolbar-button--analysis")?.click());
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("论文每页提取出的全文文字"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/literature/tasks/analyze", expect.objectContaining({ body: JSON.stringify({ itemIds: ["local-1"], cloudConsent: true }) })));
  });

  it("shows the prefetched Zotero connection and entries before a background refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    const startupRuntime = createRuntime(fixtureItems);
    startupRuntime.zotero.authorized = true;
    const host = await mount(<LiteraturePageV2 startupRuntime={startupRuntime} startupItems={fixtureItems} />);

    expect(host.textContent).toContain("已连接，可写入");
    expect(host.textContent).not.toContain("Zotero 未连接");
    expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2);
    expect(host.textContent).toContain("A conceptual multi-laser integration technology");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders the live Zotero-like workspace and honest detail fields", async () => {
    const host = await mount(<LiteraturePageV2 />);

    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));
    expect(host.querySelector(".literature-sidebar")).not.toBeNull();
    expect(host.querySelector(".literature-list-panel")).not.toBeNull();
    expect(host.querySelector(".literature-detail-panel")).not.toBeNull();
    expect(host.textContent).toContain("我的文库");
    expect(host.textContent).toContain("待归档");
    expect(host.textContent).toContain("A conceptual multi-laser integration technology");
    expect(host.textContent).toContain("摘要");
    expect(host.textContent).toContain("主数据源：Zotero");
    expect(host.textContent).toContain("ResearchPapers");
    expect(host.textContent).toContain("Zotero 已有");
    expect(host.textContent).not.toContain("不直接写入 zotero.sqlite");
    expect(host.querySelectorAll('button[aria-label="文献数据库设置"]')).toHaveLength(1);
    expect(host.querySelectorAll('button[aria-label="文献设置"]')).toHaveLength(0);
  });

  it("opens the selected document's containing folder", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));

    const openButton = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("打开位置"));
    expect(openButton).not.toBeUndefined();
    await act(async () => {
      openButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(host.textContent).toContain("已打开文献所在文件夹"));
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/local-1/open", expect.objectContaining({ method: "POST" }));
  });

  it("opens the local PDF in the built-in reader when the literature title is double-clicked", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));

    const titleBlock = host.querySelector<HTMLElement>(".literature-item-row .literature-item-title");
    expect(titleBlock).not.toBeNull();
    act(() => titleBlock?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/local-1/pdf", expect.objectContaining({ cache: "no-store" })));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.querySelector('[role="dialog"][aria-labelledby="literature-reader-title"]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/literature/items/local-1/open-document", expect.anything());
  });

  it("opens a Zotero-only title through the same built-in PDF reader route", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));

    const row = [...host.querySelectorAll<HTMLButtonElement>(".literature-item-row")].find((candidate) => candidate.textContent?.includes("A conceptual multi-laser integration technology"));
    const titleBlock = row?.querySelector<HTMLElement>(".literature-item-title");
    expect(titleBlock).not.toBeNull();
    act(() => titleBlock?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/zotero-2/pdf", expect.objectContaining({ cache: "no-store" })));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.body.querySelector('[role="dialog"][aria-labelledby="literature-reader-title"]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/literature/items/zotero-2/open-document", expect.anything());
  });

  it("does not load translation providers when selection translation is disabled", async () => {
    const settings = structuredClone(DEFAULT_WORKBENCH_SETTINGS);
    settings.translation.enabled = false;
    const host = await mount(<LiteraturePageV2 settings={settings} />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));

    const titleBlock = host.querySelector<HTMLElement>(".literature-item-row .literature-item-title");
    act(() => titleBlock?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/local-1/pdf", expect.objectContaining({ cache: "no-store" })));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(document.body.textContent).toContain("选区翻译已停用");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/hdd/providers", expect.anything());
  });

  it("previews and commits local-model organization only after confirmation", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));

    const organizeButton = [...host.querySelectorAll<HTMLButtonElement>(".literature-toolbar-button")].find((button) => button.textContent?.includes("自动整理"));
    expect(organizeButton).not.toBeUndefined();
    await act(async () => {
      organizeButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(host.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("自动整理文献");
    expect(dialog?.textContent).toContain("ObsUI-Literature\\Journal");
    expect(dialog?.textContent).toContain("Additive Manufacturing");
    expect(dialog?.textContent).toContain("可整理 1");

    await act(async () => {
      dialog?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("已整理 1 个文件。"));
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/organize/commit", expect.objectContaining({ method: "POST", body: JSON.stringify({ ids: ["local-1"] }) }));
  });

  it("filters live records by search and keeps the selected detail in sync", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));
    const searchInput = host.querySelector<HTMLInputElement>('input[aria-label="搜索文献"]');
    expect(searchInput).not.toBeNull();

    changeInput(searchInput!, "physics-guided");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="执行搜索"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));
    expect(host.textContent).toContain("A physics-guided deep generative model");
    expect(host.textContent).toContain("1 / 2 个条目");
    const row = host.querySelector<HTMLButtonElement>(".literature-item-row");
    act(() => row?.click());
    expect(host.querySelector(".literature-detail-panel")?.textContent).toContain("A physics-guided deep generative model");
  });

  it("restores the last literature view immediately while refreshing in the background", async () => {
    const firstHost = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(firstHost.querySelectorAll(".literature-item-row")).toHaveLength(2));
    expect(firstHost.textContent).toContain("已连接，待授权");

    const firstMount = mounts.shift();
    expect(firstMount).toBeDefined();
    act(() => firstMount?.root.unmount());
    firstMount?.host.remove();

    const pendingFetch = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", pendingFetch);
    const secondHost = await mount(<LiteraturePageV2 />);

    expect(secondHost.querySelectorAll(".literature-item-row")).toHaveLength(2);
    expect(secondHost.textContent).toContain("已连接，待授权");
    expect(secondHost.textContent).not.toContain("还没有连接文献目录");
    expect(pendingFetch).toHaveBeenCalled();
  });

  it("keeps every journal folder available after selecting one", async () => {
    fixtureItems.push(createItem({ id: "local-heat", title: "A heat-treatment paper", folderName: "Heat Treatment", relativePath: "Heat Treatment/paper.pdf", fileName: "paper.pdf" }));
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(3));
    expect(host.textContent).toContain("LPBF");
    expect(host.textContent).toContain("Heat Treatment");
    expect(host.querySelector(".literature-folder-section")).not.toBeNull();
    expect(host.querySelector(".literature-tag-entry")).toBeNull();

    const folderFilter = host.querySelector<HTMLInputElement>('input[aria-label="筛选期刊文件夹"]');
    expect(folderFilter).not.toBeNull();
    changeInput(folderFilter!, "heat");
    expect(host.querySelectorAll(".literature-folder-list .literature-collection")).toHaveLength(1);

    const folder = host.querySelector<HTMLButtonElement>(".literature-folder-list .literature-collection");
    expect(folder).not.toBeNull();
    expect(folder?.title).toBe("Heat Treatment");
    await act(async () => {
      folder?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));
    expect(host.textContent).toContain("A heat-treatment paper");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="清除期刊筛选"]')?.click());
    expect([...host.querySelectorAll(".literature-folder-list .literature-collection")].some((button) => button.textContent?.includes("LPBF"))).toBe(true);
    expect([...host.querySelectorAll(".literature-folder-list .literature-collection")].some((button) => button.textContent?.includes("Heat Treatment"))).toBe(true);
  });

  it("shows source-file loss without hiding the imported Zotero record", async () => {
    fixtureItems[0] = createItem({ status: "imported", sourceAvailability: "missing", zoteroItemKey: "Z1", attachmentCount: 1 });
    const host = await mount(<LiteraturePageV2 />);

    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));
    expect(host.textContent).toContain("已入库 · 源文件缺失");
    const missingCollection = [...host.querySelectorAll<HTMLButtonElement>(".literature-collection")].find((button) => button.textContent?.includes("文件缺失"));
    expect(missingCollection).not.toBeUndefined();
    expect(missingCollection?.textContent).toContain("1");
    await act(async () => {
      missingCollection?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));
    expect(host.textContent).toContain("已入库 · 源文件缺失");
  });

  it("removes a missing local entry through the three-dot menu so a later scan can rediscover it", async () => {
    fixtureItems[0] = createItem({ status: "missing" });
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="条目操作"]')?.click());
    expect(host.querySelector('[role="menu"]')?.textContent).toContain("从文库移除");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));
    expect(host.textContent).toContain("已从当前文库移除");
    expect(fixtureItems.find((item) => item.id === "local-1")).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/local-1/remove", expect.objectContaining({ method: "POST" }));
  });

  it("confirms Zotero deletion separately and keeps the Zotero action visible for Zotero-only items", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));
    const zoteroRow = [...host.querySelectorAll<HTMLButtonElement>(".literature-item-row")].find((row) => row.textContent?.includes("A conceptual multi-laser integration technology"));
    expect(zoteroRow).not.toBeUndefined();
    act(() => zoteroRow?.click());
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="条目操作"]')?.click());
    expect(host.querySelector('[role="menu"]')?.textContent).toContain("移入 Zotero 回收站");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("移入 Zotero 回收站？");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("ABCD1234");
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("没有对应的 ObsUI 本地 PDF");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));
    expect(host.textContent).toContain("已移入 Zotero 回收站");
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/zotero-2/delete-zotero", expect.objectContaining({ method: "POST" }));
  });

  it("restores a deferred entry from the dedicated collection", async () => {
    fixtureItems[0] = createItem({ status: "ignored" });
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));

    const ignoredCollection = [...host.querySelectorAll<HTMLButtonElement>(".literature-collection")].find((button) => button.textContent?.includes("暂不处理"));
    expect(ignoredCollection).not.toBeUndefined();
    await act(async () => {
      ignoredCollection?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(1));
    expect(host.textContent).toContain("恢复到文库");

    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>(".literature-primary-action")].find((button) => button.textContent?.includes("恢复到文库"))?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(fixtureItems.find((item) => item.id === "local-1")?.status).toBe("ready"));
    expect(host.textContent).toContain("已恢复到文库");
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/local-1/restore", expect.objectContaining({ method: "POST" }));
  });

  it("saves the local folder setting and submits an explicit import confirmation", async () => {
    const host = await mount(<LiteraturePageV2 />);
    await vi.waitFor(() => expect(host.querySelectorAll(".literature-item-row")).toHaveLength(2));
    const openSettings = async () => {
      await act(async () => {
        host.querySelector<HTMLButtonElement>('button[aria-label="文献数据库设置"]')?.click();
        await Promise.resolve();
        const requestIndex = fetchMock.mock.calls.map(([url]) => String(url)).lastIndexOf("/api/hdd/providers");
        await (fetchMock.mock.results[requestIndex]?.value as Promise<Response>);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(document.body.querySelector<HTMLButtonElement>(".literature-settings-dialog button[type='submit']")?.disabled).toBe(false);
    };
    await openSettings();
    const settingsDialog = document.body.querySelector('.literature-settings-dialog[role="dialog"]');
    expect(settingsDialog?.textContent).toContain("文献数据库设置");
    expect(settingsDialog?.textContent).toContain("上下文档位");
    await act(async () => {
      settingsDialog?.querySelector<HTMLButtonElement>('button[aria-label="从系统选择文件夹"]')?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("文献目录已连接"));
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/select-folder", expect.objectContaining({ method: "POST" }));

    await openSettings();
    const reopenedSettingsDialog = document.body.querySelector('.literature-settings-dialog[role="dialog"]');
    const settingsInput = reopenedSettingsDialog?.querySelector<HTMLInputElement>("input");
    changeInput(settingsInput!, "F:\\ResearchPapers\\Journal");
    await act(async () => {
      reopenedSettingsDialog?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("文献数据库设置已保存"));
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/settings", expect.objectContaining({ method: "PUT" }));

    const localRow = host.querySelector<HTMLButtonElement>('.literature-item-row[aria-selected="true"]');
    act(() => localRow?.click());
    act(() => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("确认入库"))?.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain("确认写入 Zotero");
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(host.textContent).toContain("已与 Zotero 同步"));
    expect(fetchMock).toHaveBeenCalledWith("/api/literature/items/local-1/import", expect.objectContaining({ method: "POST" }));
  });
});
