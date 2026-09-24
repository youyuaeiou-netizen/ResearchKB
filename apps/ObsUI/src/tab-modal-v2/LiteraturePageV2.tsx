import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IoAlbumsOutline,
  IoAttachOutline,
  IoBookOutline,
  IoCheckmarkCircleOutline,
  IoChevronForwardOutline,
  IoCloseOutline,
  IoDocumentsOutline,
  IoEllipsisHorizontalOutline,
  IoEyeOffOutline,
  IoFilterOutline,
  IoFolderOpenOutline,
  IoInformationCircleOutline,
  IoLibraryOutline,
  IoLinkOutline,
  IoRefreshOutline,
  IoSearchOutline,
  IoSettingsOutline,
  IoSparklesOutline,
  IoTimerOutline,
  IoWarningOutline,
} from "react-icons/io5";
import "./literature.css";
import { LiteratureReader } from "./LiteratureReader";
import {
  DEFAULT_LOCAL_MODEL,
  filterLiteratureItems,
  formatLiteratureAuthors,
  statusLabel,
  statusTone,
  type LiteratureFolderSelectionResponse,
  type LiteratureItemsResponse,
  type LiteratureOrganizationPlanItem,
  type LiteratureOrganizationPreview,
  type LiteratureRuntimeStatus,
  type LiteratureUnifiedItem,
} from "../literature";
import type { WorkbenchSettings } from "../workbench-settings";
import { enqueueLiteratureAnalysis } from "../literature-task-store";
import { hddReasoningEfforts, normalizeHddReasoningEffort, type HddModelOption, type HddReasoningEffort } from "../hdd-models";

type LiteratureDialog = "settings" | "import" | "organize" | "delete-zotero" | null;
type LiteratureProviderCatalog = { providers: Array<{ id: string; available: boolean; message?: string; models: HddModelOption[] }> };
type ImportDraft = {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  abstract: string;
  translatedTitleZh: string;
  summaryZh: string;
  suggestedTags: string;
};

const emptyImportDraft: ImportDraft = {
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  abstract: "",
  translatedTitleZh: "",
  summaryZh: "",
  suggestedTags: "",
};

function defaultRuntime(): LiteratureRuntimeStatus {
  return {
    settings: { version: 2, inboxConfigured: false, inboxDisplayName: null, modelFamily: "qwen3.5:9b", modelProfile: "64k", runtimeTag: DEFAULT_LOCAL_MODEL, deepAnalysisProvider: "ollama", deepAnalysisModel: "", deepAnalysisReasoningEffort: "medium" },
    watcher: { active: false, lastScanAt: null, error: null },
    model: { provider: "ollama", status: "unavailable", configured: false, selected: { family: "qwen3.5:9b", profile: "64k", runtimeTag: DEFAULT_LOCAL_MODEL }, families: [], error: "正在读取本地模型状态。" },
    zotero: { connected: false, authorized: false, serverId: null, version: null, error: "正在读取 Zotero 状态。" },
    counts: { detected: 0, analyzing: 0, ready: 0, matched: 0, conflict: 0, importing: 0, imported: 0, failed: 0, "partial-failed": 0, ignored: 0, missing: 0, total: 0, zotero: 0 },
    checkedAt: Date.now(),
  };
}

type LiteraturePageSessionCache = {
  runtime: LiteratureRuntimeStatus;
  items: LiteratureUnifiedItem[];
  activeCollectionId: string;
  selectedItemId: string;
  query: string;
  appliedQuery: string;
};

let literaturePageSessionCache: LiteraturePageSessionCache | null = null;

export function resetLiteraturePageSessionCache() {
  literaturePageSessionCache = null;
}

async function readApi<T>(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("无法连接 ObsUI 本地服务，请重新启动 scripts/start-obsui.ps1。");
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : `本地接口暂不可用（HTTP ${response.status}）。`;
    throw new Error(message);
  }
  return payload as T;
}

function splitAuthors(value: string) {
  return value.split(/[,;，；\n]+/g).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

function folderCollectionId(folder: string) {
  return `folder:${folder}`;
}

export function LiteraturePageV2({ startupRuntime = null, startupItems = null, settings }: { startupRuntime?: LiteratureRuntimeStatus | null; startupItems?: LiteratureUnifiedItem[] | null; settings?: WorkbenchSettings }) {
  const cachedView = literaturePageSessionCache;
  const hasStartupSnapshot = Boolean(startupRuntime && startupItems);
  const [runtime, setRuntime] = useState<LiteratureRuntimeStatus>(() => startupRuntime ?? cachedView?.runtime ?? defaultRuntime());
  const [items, setItems] = useState<LiteratureUnifiedItem[]>(() => startupItems ?? cachedView?.items ?? []);
  const [activeCollectionId, setActiveCollectionId] = useState(() => cachedView?.activeCollectionId ?? "library");
  const [selectedItemId, setSelectedItemId] = useState(() => cachedView?.selectedItemId ?? "");
  const [query, setQuery] = useState(() => cachedView?.query ?? "");
  const [appliedQuery, setAppliedQuery] = useState(() => cachedView?.appliedQuery ?? "");
  const [dialog, setDialog] = useState<LiteratureDialog>(null);
  const [settingsPath, setSettingsPath] = useState("");
  const [obsidianPath, setObsidianPath] = useState("");
  const [settingsModelFamily, setSettingsModelFamily] = useState(() => cachedView?.runtime.settings.modelFamily ?? "qwen3.5:9b");
  const [settingsModelProfile, setSettingsModelProfile] = useState(() => cachedView?.runtime.settings.modelProfile ?? "64k");
  const [deepAnalysisProvider, setDeepAnalysisProvider] = useState<"ollama" | "codex">(() => startupRuntime?.settings.deepAnalysisProvider ?? cachedView?.runtime.settings.deepAnalysisProvider ?? "ollama");
  const [deepAnalysisModel, setDeepAnalysisModel] = useState(() => startupRuntime?.settings.deepAnalysisModel ?? cachedView?.runtime.settings.deepAnalysisModel ?? "");
  const [deepAnalysisReasoningEffort, setDeepAnalysisReasoningEffort] = useState<HddReasoningEffort>(() => (startupRuntime?.settings.deepAnalysisReasoningEffort as HddReasoningEffort) ?? (cachedView?.runtime.settings.deepAnalysisReasoningEffort as HddReasoningEffort) ?? "medium");
  const [codexModels, setCodexModels] = useState<HddModelOption[]>([]);
  const [codexAvailable, setCodexAvailable] = useState(false);
  const [providerCatalogLoading, setProviderCatalogLoading] = useState(false);
  const [providerCatalogError, setProviderCatalogError] = useState("");
  const [importDraft, setImportDraft] = useState<ImportDraft>(emptyImportDraft);
  const [targetItemKey, setTargetItemKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [itemMenuOpen, setItemMenuOpen] = useState(false);
  const [zoteroDeleteTarget, setZoteroDeleteTarget] = useState<LiteratureUnifiedItem | null>(null);
  const [organizationPreview, setOrganizationPreview] = useState<LiteratureOrganizationPreview | null>(null);
  const [folderQuery, setFolderQuery] = useState("");
  const [readerItem, setReaderItem] = useState<LiteratureUnifiedItem | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextRuntime, nextItems] = await Promise.all([
        readApi<LiteratureRuntimeStatus>("/api/literature/status"),
        readApi<LiteratureItemsResponse>("/api/literature/items?collection=all"),
      ]);
      setRuntime(nextRuntime);
      setItems(nextItems.items);
      setSettingsModelFamily(nextRuntime.settings.modelFamily);
      setSettingsModelProfile(nextRuntime.settings.modelProfile);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文献接口暂不可用。");
    }
  }, []);

  const refreshItems = useCallback(async () => {
    try {
      const nextItems = await readApi<LiteratureItemsResponse>("/api/literature/items?collection=all");
      setItems(nextItems.items);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文献列表暂不可用。");
    }
  }, []);

  useEffect(() => {
    if (!hasStartupSnapshot) void refresh();
    const timer = window.setInterval(() => void refresh(), runtime.zotero.connected ? 15_000 : 1_000);
    return () => window.clearInterval(timer);
  }, [hasStartupSnapshot, refresh, runtime.zotero.connected]);

  useEffect(() => {
    if (!startupRuntime || !startupItems) return;
    setRuntime(startupRuntime);
    setItems(startupItems);
    setSettingsModelFamily(startupRuntime.settings.modelFamily);
    setSettingsModelProfile(startupRuntime.settings.modelProfile);
    setDeepAnalysisProvider(startupRuntime.settings.deepAnalysisProvider ?? "ollama");
    setDeepAnalysisModel(startupRuntime.settings.deepAnalysisModel ?? "");
    setDeepAnalysisReasoningEffort((startupRuntime.settings.deepAnalysisReasoningEffort as HddReasoningEffort) ?? "medium");
  }, [startupItems, startupRuntime]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    literaturePageSessionCache = { runtime, items, activeCollectionId, selectedItemId, query, appliedQuery };
  }, [activeCollectionId, appliedQuery, items, query, runtime, selectedItemId]);

  useEffect(() => {
    setItemMenuOpen(false);
  }, [selectedItemId]);

  const customFolders = useMemo(() => [...new Set(items
    .map((item) => item.folderName?.trim())
    .filter((folder): folder is string => typeof folder === "string" && folder.length > 0 && folder !== "未分类" && folder.toLocaleLowerCase() !== "journal"))]
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" })), [items]);
  const visibleFolders = useMemo(() => {
    const normalized = folderQuery.trim().toLocaleLowerCase();
    return normalized ? customFolders.filter((folder) => folder.toLocaleLowerCase().includes(normalized)) : customFolders;
  }, [customFolders, folderQuery]);
  const selectedModelFamily = runtime.model.families.find((family) => family.name === settingsModelFamily) ?? runtime.model.families[0] ?? null;
  const selectedModelProfiles = selectedModelFamily?.profiles ?? [];
  const codexReasoningOptions = hddReasoningEfforts("codex", deepAnalysisModel, codexModels);
  const baseCollections = useMemo(() => [
    { id: "library", label: "我的文库", icon: <IoLibraryOutline aria-hidden="true" /> },
    { id: "pending", label: "待归档", icon: <IoTimerOutline aria-hidden="true" /> },
    { id: "ignored", label: "暂不处理", icon: <IoEyeOffOutline aria-hidden="true" /> },
    { id: "missing", label: "文件缺失", icon: <IoWarningOutline aria-hidden="true" /> },
    { id: "recent", label: "最近阅读", icon: <IoTimerOutline aria-hidden="true" /> },
    { id: "duplicates", label: "疑似重复", icon: <IoDocumentsOutline aria-hidden="true" /> },
    { id: "unfiled", label: "未分类条目", icon: <IoAlbumsOutline aria-hidden="true" /> },
  ], []);

  const visibleItems = useMemo(() => filterLiteratureItems(items, activeCollectionId, appliedQuery), [activeCollectionId, appliedQuery, items]);
  const activeCollectionCount = useMemo(() => filterLiteratureItems(items, activeCollectionId, "").length, [activeCollectionId, items]);
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? null;

  useEffect(() => {
    if (selectedItem && selectedItem.id !== selectedItemId) setSelectedItemId(selectedItem.id);
  }, [selectedItem, selectedItemId]);

  const performAction = async (id: string, action: () => Promise<void>, successMessage?: string) => {
    setBusyId(id);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      setBusyId("");
    }
  };

  const openSettings = () => {
    setSettingsPath("");
    setObsidianPath("");
    setSettingsModelFamily(runtime.settings.modelFamily);
    setSettingsModelProfile(runtime.settings.modelProfile);
    setDeepAnalysisProvider(runtime.settings.deepAnalysisProvider ?? "ollama");
    setDeepAnalysisModel(runtime.settings.deepAnalysisModel ?? "");
    setDeepAnalysisReasoningEffort((runtime.settings.deepAnalysisReasoningEffort as HddReasoningEffort) ?? "medium");
    setProviderCatalogLoading(true);
    setProviderCatalogError("");
    setDialog("settings");
    void readApi<LiteratureProviderCatalog>("/api/hdd/providers").then((catalog) => {
      const codex = catalog.providers.find((provider) => provider.id === "codex");
      const models = codex?.models ?? [];
      setCodexAvailable(Boolean(codex?.available));
      setCodexModels(models);
      setProviderCatalogError(codex?.available ? "" : codex?.message ?? "本机 Codex CLI 未就绪或模型目录暂不可用。");
      if (runtime.settings.deepAnalysisProvider === "codex" && models.length) {
        const selected = models.find((model) => model.id === runtime.settings.deepAnalysisModel) ?? models.find((model) => model.isDefault) ?? models[0]!;
        setDeepAnalysisModel(selected.id);
        setDeepAnalysisReasoningEffort(normalizeHddReasoningEffort("codex", selected.id, runtime.settings.deepAnalysisReasoningEffort as HddReasoningEffort, models));
      }
      setProviderCatalogLoading(false);
    }).catch((reason) => {
      setProviderCatalogError(reason instanceof Error ? reason.message : "无法读取 ChatGPT / Codex 模型目录。");
      setProviderCatalogLoading(false);
    });
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setBusyId("settings");
    try {
      const next = await readApi<LiteratureRuntimeStatus>("/api/literature/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(settingsPath.trim() ? { inboxPath: settingsPath.trim() } : {}),
          ...(obsidianPath.trim() ? { obsidianVaultPath: obsidianPath.trim() } : {}),
          modelFamily: settingsModelFamily,
          modelProfile: settingsModelProfile,
          runtimeTag: settingsModelProfile === "default" ? settingsModelFamily : `${settingsModelFamily}-${settingsModelProfile}`,
          deepAnalysisProvider,
          deepAnalysisModel,
          deepAnalysisReasoningEffort,
        }),
      });
      setRuntime(next);
      setDialog(null);
      setNotice("文献数据库设置已保存，正在扫描新 PDF。");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文献设置保存失败。");
    } finally {
      setBusyId("");
    }
  };

  const rescan = () => performAction("scan", async () => {
    await readApi("/api/literature/rescan", { method: "POST" });
  }, "已完成文献目录扫描。");

  const openOrganizationPreview = () => performAction("organize-preview", async () => {
    const preview = await readApi<LiteratureOrganizationPreview>("/api/literature/organize/preview");
    setOrganizationPreview(preview);
    setDialog("organize");
  }, "整理预览已生成。");

  const selectFolder = () => performAction("folder-picker", async () => {
    const next = await readApi<LiteratureFolderSelectionResponse>("/api/literature/select-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setRuntime(next);
    setSettingsPath("");
    if (next.folderSelection === "selected") {
      setDialog(null);
      setNotice("文献目录已连接，正在扫描新 PDF。");
    } else {
      setNotice("已取消选择，原文献目录设置保持不变。");
    }
  });

  const selectObsidianFolder = () => performAction("obsidian-picker", async () => {
    const next = await readApi<LiteratureFolderSelectionResponse>("/api/literature/select-obsidian-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setRuntime(next);
    setObsidianPath("");
    setNotice(next.folderSelection === "selected" ? "Obsidian Vault 已连接；后台深读报告将写入 03-Resources/Curated。" : "已取消选择，原 Obsidian Vault 设置保持不变。");
  });

  const authorize = () => performAction("zotero", async () => {
    await readApi("/api/literature/zotero/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  }, "Zotero 写入授权已保存。");

  const queueAnalysis = async (requestedItems: readonly LiteratureUnifiedItem[]) => {
    if (requestedItems.length !== 1) {
      setNotice("请先选中一篇文献。");
      return;
    }
    const cloudConsent = deepAnalysisProvider === "codex";
    if (cloudConsent && !window.confirm("你选择了 ChatGPT / Codex 深读。论文每页提取出的全文文字（包括扫描页由本地 OCR 识别出的文字）将发送给 Codex 使用的云端模型；原始 PDF 和页面图像不会上传。是否继续？")) {
      setNotice("已取消后台深读；论文内容没有发送到云端。");
      return;
    }
    setBusyId("analysis-queue");
    try {
      await enqueueLiteratureAnalysis([requestedItems[0].id], cloudConsent);
      setNotice("已加入后台深读分析；可在顶部查看进度，完成后打开 Obsidian 报告。");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "后台分析任务创建失败。");
    } finally {
      setBusyId("");
    }
  };

  const startAnalysis = (item: LiteratureUnifiedItem) => queueAnalysis([item]);

  const openDeepReport = (item: LiteratureUnifiedItem) => performAction(item.id, async () => {
    const result = await readApi<{ message?: string }>(`/api/literature/items/${encodeURIComponent(item.id)}/deep-report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (result.message) setNotice(result.message);
  });

  const ignoreItem = (item: LiteratureUnifiedItem) => performAction(item.id, async () => {
    await readApi(`/api/literature/items/${encodeURIComponent(item.id)}/ignore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  }, "已暂不处理；可在“暂不处理”分类中恢复。");

  const restoreItem = (item: LiteratureUnifiedItem) => performAction(item.id, async () => {
    await readApi(`/api/literature/items/${encodeURIComponent(item.id)}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  }, "已恢复到文库。");

  const openFolder = (item: LiteratureUnifiedItem) => performAction(item.id, async () => {
    const result = await readApi<{ message?: string }>(`/api/literature/items/${encodeURIComponent(item.id)}/open`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (result.message) setNotice(result.message);
  });

  const openDocument = (item: LiteratureUnifiedItem) => {
    if (item.source !== "zotero" && item.sourceAvailability === "missing") {
      setError("当前文献 PDF 不存在，无法在 ObsUI 内打开。");
      return;
    }
    setReaderItem(item);
  };

  const showImportDialog = (item: LiteratureUnifiedItem, preferredTarget = "") => {
    setImportDraft({
      title: item.title,
      authors: item.authors.join(", "),
      year: item.year ? String(item.year) : "",
      journal: item.journal ?? "",
      doi: item.doi ?? "",
      abstract: item.abstract ?? "",
      translatedTitleZh: item.translatedTitleZh ?? "",
      summaryZh: item.summaryZh ?? "",
      suggestedTags: item.suggestedTags.join(", "),
    });
    setTargetItemKey(preferredTarget || (item.duplicateCandidates.length ? "" : item.zoteroItemKey ?? ""));
    setDialog("import");
  };

  const submitImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedItem) return;
    setBusyId(selectedItem.id);
    try {
      await readApi(`/api/literature/items/${encodeURIComponent(selectedItem.id)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetItemKey: targetItemKey && targetItemKey !== "new" ? targetItemKey : null,
          forceNew: targetItemKey === "new",
          draft: {
            ...importDraft,
            authors: splitAuthors(importDraft.authors),
            suggestedTags: splitAuthors(importDraft.suggestedTags),
            year: importDraft.year,
          },
        }),
      });
      setDialog(null);
      setNotice("已写入 Zotero，并完成附件回读验证。");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文献导入失败。");
    } finally {
      setBusyId("");
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setAppliedQuery(query.trim());
  };

  const selectCollection = async (collectionId: string) => {
    setActiveCollectionId(collectionId);
    setAppliedQuery("");
    setQuery("");
    await refreshItems();
  };

  const removeFromLibrary = (item: LiteratureUnifiedItem) => {
    setItemMenuOpen(false);
    return performAction(item.id, async () => {
      await readApi(`/api/literature/items/${encodeURIComponent(item.id)}/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    }, "已从当前文库移除；原始 PDF 和 Zotero 条目保留。");
  };

  const openZoteroDeleteDialog = (item: LiteratureUnifiedItem) => {
    setItemMenuOpen(false);
    setZoteroDeleteTarget(item);
    setDialog("delete-zotero");
  };

  const submitZoteroDelete = async (event: FormEvent) => {
    event.preventDefault();
    const item = zoteroDeleteTarget;
    if (!item?.zoteroItemKey) return;
    setBusyId(item.id);
    try {
      const result = await readApi<{ message?: string }>(`/api/literature/items/${encodeURIComponent(item.id)}/delete-zotero`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setDialog(null);
      setZoteroDeleteTarget(null);
      setNotice(result.message ?? "已移入 Zotero 回收站。");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Zotero 条目删除失败。");
    } finally {
      setBusyId("");
    }
  };

  const submitOrganization = async (event: FormEvent) => {
    event.preventDefault();
    if (!organizationPreview) return;
    const ids = organizationPreview.items.filter((item) => item.status === "move").map((item) => item.id);
    if (!ids.length) {
      setNotice("当前没有可直接整理的文件；请先处理待复核或冲突项目。");
      return;
    }
    setBusyId("organize-commit");
    try {
      const result = await readApi<{ message?: string }>("/api/literature/organize/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setDialog(null);
      setOrganizationPreview(null);
      setNotice(result.message ?? `已整理 ${ids.length} 个文件。`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "文献整理失败。");
    } finally {
      setBusyId("");
    }
  };

  const renderCollection = (collection: { id: string; label: string; icon: ReactNode; custom?: boolean }) => {
    const count = filterLiteratureItems(items, collection.id, "").length;
    const selected = collection.id === activeCollectionId;
    return <button
      type="button"
      key={collection.id}
      className={`literature-collection${collection.custom ? " is-custom" : ""}${selected ? " is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
      title={collection.label}
      onClick={() => void selectCollection(collection.id)}
    >
      <span className="literature-collection-icon">{collection.icon}</span>
      <span>{collection.label}</span>
      <small>{count || ""}</small>
    </button>;
  };

  return <section className="literature-workspace" aria-label="文献工作区">
    <header className="literature-workspace-header">
      <div className="literature-workspace-title"><span className="literature-kicker">LITERATURE DATABASE</span><h1>文献</h1><span>本地文件夹、ObsUI 与 Zotero 的统一文库</span></div>
      <div className="literature-source-status" role="status">
        <i className={runtime.zotero.connected ? "is-ready" : "is-warning"} />
        <b>Zotero</b>
        <span>{runtime.zotero.connected ? runtime.zotero.authorized ? "已连接，可写入" : "已连接，待授权" : "未连接"}</span>
        <button type="button" className="literature-header-action" aria-label="文献数据库设置" title="文献数据库设置" onClick={openSettings}><IoSettingsOutline aria-hidden="true" />设置</button>
      </div>
    </header>
    {(error || runtime.watcher.error) && <div className="literature-notice literature-notice--error" role="alert"><IoWarningOutline aria-hidden="true" /><span>{error || runtime.watcher.error}</span></div>}
    <div className="literature-workspace-grid">
      <aside className="literature-sidebar" aria-label="文献分类">
        <div className="literature-panel-heading"><div><span className="literature-kicker">COLLECTIONS</span><b>分类</b></div></div>
        <nav className="literature-collection-list" aria-label="文献集合">{baseCollections.map(renderCollection)}</nav>
        <section className="literature-folder-section" aria-labelledby="literature-folder-section-title">
          <div className="literature-folder-heading"><span id="literature-folder-section-title">期刊文件夹</span><small>{customFolders.length}</small></div>
          <label className="literature-folder-filter"><IoSearchOutline aria-hidden="true" /><input aria-label="筛选期刊文件夹" value={folderQuery} onChange={(event) => setFolderQuery(event.target.value)} placeholder="筛选期刊文件夹" />{folderQuery && <button type="button" aria-label="清除期刊筛选" title="清除期刊筛选" onClick={() => setFolderQuery("")}><IoCloseOutline aria-hidden="true" /></button>}</label>
          <nav className="literature-folder-list" aria-label="期刊文件夹">{visibleFolders.map((folder) => renderCollection({ id: folderCollectionId(folder), label: folder, icon: <IoFolderOpenOutline aria-hidden="true" />, custom: true }))}{!visibleFolders.length && <span className="literature-folder-empty">{folderQuery ? "没有匹配的期刊" : "暂无期刊文件夹"}</span>}</nav>
        </section>
        <div className="literature-sidebar-footer"><span>目录</span><small>{runtime.settings.inboxDisplayName ?? "未连接"}</small><span>模型</span><small className={runtime.model.status === "ready" ? "is-ready-text" : ""}>{runtime.model.selected.family} · {runtime.model.selected.profile.toUpperCase()} · {runtime.model.status === "ready" ? "在线" : "离线"}</small></div>
      </aside>

      <section className="literature-list-panel" aria-label="文献列表">
        <header className="literature-list-toolbar">
          <div className="literature-toolbar-actions"><button type="button" className="literature-toolbar-button" onClick={() => void rescan()} disabled={Boolean(busyId)}><IoRefreshOutline aria-hidden="true" /><span>{busyId === "scan" ? "扫描中" : "扫描"}</span></button><button type="button" className="literature-toolbar-button" onClick={() => void openOrganizationPreview()} disabled={Boolean(busyId)}><IoFolderOpenOutline aria-hidden="true" /><span>{busyId === "organize-preview" ? "生成中" : "自动整理"}</span></button><button type="button" className="literature-toolbar-button literature-toolbar-button--analysis" onClick={() => selectedItem && void startAnalysis(selectedItem)} disabled={Boolean(busyId) || !selectedItem} title="深读当前高亮文献"><IoSparklesOutline aria-hidden="true" /><span>{busyId === "analysis-queue" ? "加入中" : "后台分析"}</span></button><span className="literature-result-count">{visibleItems.length} / {activeCollectionCount} 个条目</span></div>
          <form className="literature-search" role="search" onSubmit={submitSearch}><IoSearchOutline aria-hidden="true" /><input aria-label="搜索文献" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或 DOI" /><button type="submit" aria-label="执行搜索" title="执行搜索"><IoSearchOutline aria-hidden="true" /></button></form>
        </header>
        <div className="literature-list-columns" role="row" aria-hidden="true"><span>标题</span><span>创建者</span><span>年份</span><span><IoAttachOutline /></span></div>
        <div className="literature-item-list" role="listbox" aria-label="可选文献条目">
          {visibleItems.map((item) => <button type="button" role="option" aria-selected={selectedItem?.id === item.id} className={`literature-item-row${selectedItem?.id === item.id ? " is-selected" : ""}`} key={item.id} onClick={() => setSelectedItemId(item.id)}>
            <span className="literature-item-title" title={`${item.title}（双击在 ObsUI 内置阅读器打开 PDF）`} onDoubleClick={(event) => { event.stopPropagation(); if (!busyId) openDocument(item); }}><IoChevronForwardOutline aria-hidden="true" /><span><b>{item.title}</b>{item.translatedTitleZh && <small title={item.translatedTitleZh}>{item.translatedTitleZh}</small>}<em>{item.journal ?? item.folderName ?? "期刊待识别"} <StatusChip item={item} /></em></span></span>
            <span className="literature-item-author">{formatLiteratureAuthors(item.authors)}</span>
            <span className="literature-item-year">{item.year ?? "—"}</span>
            <span className="literature-item-attachment">{item.attachmentCount > 0 && <IoAttachOutline aria-label={`${item.attachmentCount} 个附件`} />}</span>
          </button>)}
          {!visibleItems.length && <div className="literature-empty-list"><IoFilterOutline aria-hidden="true" /><b>{runtime.settings.inboxConfigured ? "暂时没有匹配的文献" : "还没有连接文献目录"}</b><span>{runtime.settings.inboxConfigured ? "扫描后新增 PDF 会显示在这里。" : "请使用右上角的设置按钮连接期刊分类文件夹。"}</span></div>}
        </div>
      </section>

      <aside className="literature-detail-panel" aria-label="文献详情">
        <header className="literature-detail-header"><div><span className="literature-kicker">ITEM DETAILS</span><b>条目详情</b></div><div className="literature-detail-header-actions"><button type="button" className="literature-icon-button" aria-label="条目操作" title="条目操作" aria-haspopup="menu" aria-expanded={itemMenuOpen} disabled={!selectedItem} onClick={() => setItemMenuOpen((current) => !current)}><IoEllipsisHorizontalOutline aria-hidden="true" /></button>{itemMenuOpen && selectedItem && <div className="literature-item-menu" role="menu">{selectedItem.zoteroItemKey && <button type="button" role="menuitem" onClick={() => openZoteroDeleteDialog(selectedItem)}>移入 Zotero 回收站{selectedItem.source === "merged" ? "（保留本地 PDF）" : ""}</button>}{selectedItem.source !== "zotero" && selectedItem.status === "ignored" && <button type="button" role="menuitem" onClick={() => void restoreItem(selectedItem)}>恢复到文库</button>}{selectedItem.source !== "zotero" && selectedItem.status !== "ignored" && <button type="button" role="menuitem" onClick={() => void removeFromLibrary(selectedItem)}>从文库移除（仅移除当前目录外条目）</button>}</div>}</div></header>
        {selectedItem ? <div className="literature-detail-scroll">
          <div className="literature-detail-identity"><div className="literature-detail-type"><IoDocumentsOutline aria-hidden="true" /><span>{selectedItem.source === "zotero" ? "Zotero 条目" : selectedItem.status === "imported" ? "已归档文献" : "本地待归档 PDF"}</span><small>{itemStatusLabel(selectedItem)}</small></div>
          <h2>{selectedItem.title}</h2>
          {selectedItem.translatedTitleZh && <p className="literature-detail-translation">{selectedItem.translatedTitleZh}</p>}
          <p className="literature-detail-authors">{formatLiteratureAuthors(selectedItem.authors)}</p></div>
          <dl className="literature-metadata"><div><dt>年份</dt><dd>{selectedItem.year ?? "待识别"}</dd></div><div><dt>期刊</dt><dd>{selectedItem.journal ?? "待识别"}</dd></div><div><dt>来源</dt><dd>{selectedItem.folderName ?? "Zotero"}</dd></div><div><dt>附件</dt><dd>{selectedItem.attachmentCount ? `${selectedItem.attachmentCount} 个附件` : "待上传"}</dd></div></dl>
          {selectedItem.relativePath && <DetailSection title="本地文件"><div className="literature-source-path"><IoFolderOpenOutline aria-hidden="true" /><span>{selectedItem.folderName && `${selectedItem.folderName} / `}{selectedItem.relativePath}</span><button type="button" onClick={() => void openFolder(selectedItem)}>打开位置</button></div></DetailSection>}
          {selectedItem.error && <div className="literature-detail-error"><IoWarningOutline aria-hidden="true" /><span>{selectedItem.error}</span></div>}
          <DetailSection title="摘要"><p>{selectedItem.summaryZh ?? selectedItem.abstract ?? "尚未生成摘要；可点击分析，或在入库前手工填写。"}</p></DetailSection>
          <DetailSection title="ObsUI 扩展字段"><dl className="literature-extension-fields"><div><dt>中文译名</dt><dd>{selectedItem.translatedTitleZh ?? "待补充"}</dd></div><div><dt>分析来源</dt><dd>{selectedItem.analysisSource === "vision" ? "扫描页视觉识别" : selectedItem.analysisSource === "text" ? "正文提取" : selectedItem.analysisSource === "manual" ? "手工填写" : "待分析"}</dd></div><div><dt>置信度</dt><dd>{selectedItem.confidence === null ? "待评估" : `${Math.round(selectedItem.confidence * 100)}%`}</dd></div><div><dt>建议标签</dt><dd>{selectedItem.suggestedTags.length ? selectedItem.suggestedTags.join("、") : "待生成"}</dd></div></dl></DetailSection>
          {selectedItem.review.required && <div className="literature-detail-error"><IoWarningOutline aria-hidden="true" /><span>需要人工复核：{selectedItem.review.reasons.join("；")}</span></div>}
          <DetailSection title="可用链接"><div className="literature-links">{selectedItem.doi && <a href={`https://doi.org/${selectedItem.doi}`} target="_blank" rel="noreferrer"><IoLinkOutline aria-hidden="true" /> DOI</a>}{selectedItem.url && <a href={selectedItem.url} target="_blank" rel="noreferrer"><IoLinkOutline aria-hidden="true" /> 原文</a>}{selectedItem.zoteroItemKey && <span><IoLibraryOutline aria-hidden="true" /> Zotero {selectedItem.zoteroItemKey}</span>}{!selectedItem.doi && !selectedItem.url && !selectedItem.zoteroItemKey && <span>暂无可用链接</span>}</div></DetailSection>
          {selectedItem.duplicateCandidates.length > 0 && <DetailSection title="疑似重复"><div className="literature-duplicate-list">{selectedItem.duplicateCandidates.map((candidate) => <button type="button" key={candidate.itemKey} onClick={() => showImportDialog(selectedItem, candidate.itemKey)}><span>{candidate.title}</span><small>{candidate.reason === "doi" ? "DOI 相同" : candidate.reason === "hash" ? "文件哈希相同" : "标题、年份和第一作者相同"} · {candidate.itemKey}</small></button>)}</div></DetailSection>}
          <div className="literature-detail-actions">
            {(selectedItem.source === "zotero" || selectedItem.sourceAvailability === "present") && <button type="button" className="literature-primary-action" onClick={() => openDocument(selectedItem)}>阅读 PDF</button>}
            {selectedItem.source !== "zotero" && selectedItem.status === "ignored" && <button type="button" className="literature-primary-action" disabled={busyId === selectedItem.id} onClick={() => void restoreItem(selectedItem)}>恢复到文库</button>}
            <button type="button" className="literature-secondary-action" disabled={busyId === selectedItem.id} onClick={() => void openDeepReport(selectedItem)}>打开深读报告</button>
            {(selectedItem.source !== "zotero" && ["detected", "failed", "partial-failed", "ready", "matched", "conflict"].includes(selectedItem.status)) && <button type="button" className="literature-primary-action" disabled={busyId === selectedItem.id} onClick={() => showImportDialog(selectedItem)}>{selectedItem.status === "partial-failed" ? "重试入库" : ["detected", "failed"].includes(selectedItem.status) ? "手工填写并入库" : "确认入库"}</button>}
            {selectedItem.source !== "zotero" && selectedItem.status !== "ignored" && selectedItem.status !== "imported" && <button type="button" className="literature-secondary-action" disabled={busyId === selectedItem.id} onClick={() => void ignoreItem(selectedItem)}>暂不处理</button>}
            {selectedItem.status === "imported" && selectedItem.zoteroItemKey && <span className="literature-imported-mark"><IoCheckmarkCircleOutline aria-hidden="true" />已与 Zotero 同步{selectedItem.importOperation?.disposition === "matched" ? " · 匹配已有" : ""}{selectedItem.sourceAvailability === "missing" ? " · 源文件缺失" : ""}</span>}
          </div>
          <footer className="literature-detail-boundary"><IoLibraryOutline aria-hidden="true" /><span>主数据源：Zotero</span><small>移入 Zotero 回收站只影响 Zotero；本地 PDF 不会被移动或删除。</small></footer>
        </div> : <div className="literature-detail-empty"><IoDocumentsOutline aria-hidden="true" /><b>选择一篇文献</b><span>详情将在右侧显示。</span></div>}
      </aside>
    </div>
    {notice && <div className="literature-notice" role="status" aria-live="polite"><IoInformationCircleOutline aria-hidden="true" />{notice}</div>}
    {dialog === "organize" && organizationPreview && <div className="literature-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setDialog(null); setOrganizationPreview(null); } }}>
      <section className="literature-dialog literature-organize-dialog" role="dialog" aria-modal="true" aria-labelledby="literature-organize-dialog-title">
        <header><div><span className="literature-kicker">LOCAL ORGANIZER</span><h2 id="literature-organize-dialog-title">自动整理文献</h2></div><button type="button" className="literature-icon-button" aria-label="关闭文献整理预览" onClick={() => { setDialog(null); setOrganizationPreview(null); }}><IoCloseOutline aria-hidden="true" /></button></header>
        <form onSubmit={submitOrganization}>
          <p>当前整理目标：{organizationPreview.rootDisplayName}。仅整理已完成标题和期刊识别的本地 PDF，目标格式为“期刊文件夹／文献标题.pdf”。</p>
          <div className="literature-organize-summary"><span>可整理 <b>{organizationPreview.summary.move}</b></span><span>已就位 <b>{organizationPreview.summary.unchanged}</b></span><span>待复核 <b>{organizationPreview.summary.review}</b></span><span>冲突 <b>{organizationPreview.summary.conflict}</b></span></div>
          <div className="literature-organize-plan" role="list" aria-label="文献整理预览">{organizationPreview.items.map((item) => <OrganizationPlanRow key={item.id} item={item} />)}</div>
          <p>确认后只会在当前目录内创建期刊文件夹并移动/改名；不会覆盖现有文件、删除 PDF 或改变 Zotero 条目内容。整理期间若文件发生变化，操作会停止并要求重新生成预览。</p>
          <div className="literature-dialog-actions"><button type="button" onClick={() => { setDialog(null); setOrganizationPreview(null); }}>取消</button><button type="submit" disabled={busyId === "organize-commit" || organizationPreview.summary.move === 0}>{busyId === "organize-commit" ? "整理中…" : `确认整理 ${organizationPreview.summary.move} 个文件`}</button></div>
        </form>
      </section>
    </div>}
    {dialog === "delete-zotero" && zoteroDeleteTarget && <div className="literature-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setDialog(null); setZoteroDeleteTarget(null); } }}>
      <section className="literature-dialog literature-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="literature-delete-dialog-title">
        <header><div><span className="literature-kicker">ZOTERO TRASH</span><h2 id="literature-delete-dialog-title">移入 Zotero 回收站？</h2></div><button type="button" className="literature-icon-button" aria-label="取消删除 Zotero 条目" onClick={() => { setDialog(null); setZoteroDeleteTarget(null); }}><IoCloseOutline aria-hidden="true" /></button></header>
        <form onSubmit={submitZoteroDelete}>
          <div className="literature-delete-summary"><b>{zoteroDeleteTarget.title}</b><span>Zotero 条目：{zoteroDeleteTarget.zoteroItemKey}</span><span>{zoteroDeleteTarget.source === "merged" ? "本地 PDF、分析结果和文件夹记录会保留。" : "该条目没有对应的 ObsUI 本地 PDF 记录。"}</span></div>
          <p>ObsUI 将使用 Zotero 本地接口删除该条目，并回读确认它已经进入 Zotero 回收站。附件由 Zotero 一并管理；这里不会永久清除，也不会删除本地 PDF。</p>
          {!runtime.zotero.authorized && <div className="literature-dialog-warning" role="alert">当前尚未授权 ObsUI 写入 Zotero，请先在文献设置中完成授权。</div>}
          <div className="literature-dialog-actions"><button type="button" onClick={() => { setDialog(null); setZoteroDeleteTarget(null); }}>取消</button><button type="submit" className="literature-danger-action" disabled={busyId === zoteroDeleteTarget.id}>{busyId === zoteroDeleteTarget.id ? "处理中…" : "确认移入回收站"}</button></div>
        </form>
      </section>
    </div>}
    {dialog === "settings" && typeof document !== "undefined" && createPortal(<div className="literature-dialog-backdrop literature-settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
      <section className="literature-dialog literature-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="literature-settings-dialog-title">
        <header><div><span className="literature-kicker">LOCAL DATABASE</span><h2 id="literature-settings-dialog-title">文献数据库设置</h2></div><button type="button" className="literature-icon-button" aria-label="关闭文献设置" onClick={() => setDialog(null)}><IoCloseOutline aria-hidden="true" /></button></header>
        <form onSubmit={saveSettings}>
          <div className="literature-folder-picker"><button type="button" className="literature-folder-picker-button" aria-label="从系统选择文件夹" onClick={() => void selectFolder()} disabled={busyId === "folder-picker"}><IoFolderOpenOutline aria-hidden="true" />{busyId === "folder-picker" ? "正在打开系统选择器…" : "从系统选择文件夹"}</button><span className="literature-folder-picker-current">{runtime.settings.inboxDisplayName ? `当前已连接：${runtime.settings.inboxDisplayName}` : "尚未选择文献目录"}</span><small className="literature-folder-picker-note">会弹出 Windows 文件夹选择窗口；绝对路径只由服务端保存，页面仅显示目录名称。</small></div>
          <label><span>手工输入路径（备用）</span><input value={settingsPath} onChange={(event) => setSettingsPath(event.target.value)} placeholder={runtime.settings.inboxDisplayName ? "输入新绝对路径以更换" : "例如：C:\\Users\\h\\Documents\\ObsUI-Literature"} /><small>用于系统选择器不可用时；原文件不会移动或删除。</small></label>
          <div className="literature-folder-picker literature-folder-picker--obsidian"><button type="button" className="literature-folder-picker-button" aria-label="选择 Obsidian Vault" onClick={() => void selectObsidianFolder()} disabled={busyId === "obsidian-picker"}><IoBookOutline aria-hidden="true" />{busyId === "obsidian-picker" ? "正在打开系统选择器…" : "选择 Obsidian Vault"}</button><span className="literature-folder-picker-current">{runtime.settings.obsidianVaultDisplayName ? `当前已连接：${runtime.settings.obsidianVaultDisplayName}` : "尚未配置 Obsidian Vault"}</span><small className="literature-folder-picker-note">深读报告保存到 03-Resources/Curated；已有人工笔记或改过的报告不会被覆盖。</small></div>
          <label><span>Obsidian Vault 路径（备用）</span><input value={obsidianPath} onChange={(event) => setObsidianPath(event.target.value)} placeholder={runtime.settings.obsidianVaultDisplayName ? "输入新绝对路径以更换" : "例如：C:\\WorkSpace\\ResearchKB"} /><small>后台深读报告写入 03-Resources/Curated；论文讨论仍使用原报告目录。</small></label>
          <label><span>本地模型</span><select value={settingsModelFamily} onChange={(event) => { const next = event.target.value; setSettingsModelFamily(next); setSettingsModelProfile(runtime.model.families.find((family) => family.name === next)?.profiles[0]?.profile ?? "default"); }}>{runtime.model.families.length ? runtime.model.families.map((family) => <option key={family.name} value={family.name}>{family.name}</option>) : <option value={settingsModelFamily}>{settingsModelFamily}</option>}</select><small>本地模型用于元数据整理和扫描页 OCR；列表来自当前 Ollama 已安装模型。</small></label>
          <label><span>上下文档位</span><select value={settingsModelProfile} disabled={selectedModelProfiles.length <= 1} onChange={(event) => setSettingsModelProfile(event.target.value)}>{selectedModelProfiles.length ? selectedModelProfiles.map((profile) => <option key={profile.runtimeTag} value={profile.profile}>{profile.profile === "default" ? "默认" : `${profile.profile.toUpperCase()} · ${profile.contextLength ? `${Math.round(profile.contextLength / 1024)}K` : "默认"}`}</option>) : <option value={settingsModelProfile}>{settingsModelProfile.toUpperCase()}</option>}</select><small>仅同一模型有多个上下文配置时可切换；上下文档位不代表不同模型。</small></label>
          <label><span>深读模型提供方</span><select value={deepAnalysisProvider} disabled={providerCatalogLoading} onChange={(event) => { const next = event.target.value as "ollama" | "codex"; setDeepAnalysisProvider(next); if (next === "codex") { const model = codexModels.find((candidate) => candidate.id === deepAnalysisModel) ?? codexModels.find((candidate) => candidate.isDefault) ?? codexModels[0]; if (model) { setDeepAnalysisModel(model.id); setDeepAnalysisReasoningEffort(normalizeHddReasoningEffort("codex", model.id, deepAnalysisReasoningEffort, codexModels)); } } }}><option value="ollama">本地 Ollama</option><option value="codex" disabled={!codexAvailable && deepAnalysisProvider !== "codex"}>ChatGPT（Codex CLI）{codexAvailable ? "" : " · 未连接"}</option></select><small>{providerCatalogLoading ? "正在读取本机 Codex 模型目录…" : "元数据整理和扫描页 OCR 始终使用上方本地模型。"}</small></label>
          {deepAnalysisProvider === "codex" && <>
            <label><span>ChatGPT / Codex 模型</span><select value={deepAnalysisModel} disabled={!codexModels.length} onChange={(event) => { const next = event.target.value; setDeepAnalysisModel(next); setDeepAnalysisReasoningEffort(normalizeHddReasoningEffort("codex", next, deepAnalysisReasoningEffort, codexModels)); }}>{codexModels.length ? codexModels.map((model) => <option key={model.id} value={model.id}>{model.label}{model.isDefault ? "（默认）" : ""}</option>) : <option value="">{providerCatalogLoading ? "正在加载模型…" : "没有可用模型"}</option>}</select><small>从本机 Codex CLI 当前可用的 ChatGPT 模型目录读取。</small></label>
            <label><span>模型强度</span><select value={deepAnalysisReasoningEffort} disabled={!codexReasoningOptions.length} onChange={(event) => setDeepAnalysisReasoningEffort(event.target.value as HddReasoningEffort)}>{codexReasoningOptions.length ? codexReasoningOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>) : <option value="medium">无可用强度</option>}</select><small>选项按当前模型实际支持的强度生成。</small></label>
            <div className="literature-dialog-warning" role="note">使用 ChatGPT / Codex 时，每页提取的全文文字会发送到云端模型；扫描页图像仅在本机 OCR，不上传。每次启动分析前还会再次询问确认。</div>
          </>}
          {providerCatalogError && <div className="literature-dialog-warning" role="status">{providerCatalogError}</div>}
          <div className="literature-settings-status"><span className={runtime.model.status === "ready" ? "is-ready-text" : ""}>模型：{runtime.model.status === "ready" ? "在线" : runtime.model.error ?? "离线"}</span><span className={runtime.zotero.connected ? "is-ready-text" : ""}>Zotero：{runtime.zotero.connected ? runtime.zotero.authorized ? "已授权写入" : "已连接，需授权" : "未连接"}</span><span className={runtime.settings.obsidianVaultConfigured ? "is-ready-text" : ""}>Obsidian：{runtime.settings.obsidianVaultConfigured ? "已连接" : "未配置"}</span></div>
          <div className="literature-dialog-actions"><button type="button" onClick={() => void rescan()}>立即扫描</button>{runtime.zotero.connected && !runtime.zotero.authorized && <button type="button" onClick={() => void authorize()} disabled={busyId === "zotero"}>授权 Zotero</button>}<button type="submit" disabled={busyId === "settings" || providerCatalogLoading || (deepAnalysisProvider === "codex" && (!codexAvailable || !codexModels.length || !codexReasoningOptions.length))}>{busyId === "settings" ? "保存中…" : "保存设置"}</button></div>
        </form>
      </section>
    </div>, document.body)}
    {dialog === "import" && selectedItem && <div className="literature-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><section className="literature-dialog literature-item-dialog" role="dialog" aria-modal="true" aria-labelledby="literature-import-dialog-title"><header><div><span className="literature-kicker">CONFIRM IMPORT</span><h2 id="literature-import-dialog-title">确认写入 Zotero</h2></div><button type="button" className="literature-icon-button" aria-label="关闭导入确认" onClick={() => setDialog(null)}><IoCloseOutline aria-hidden="true" /></button></header><form onSubmit={submitImport}><label><span>标题</span><input autoFocus required value={importDraft.title} onChange={(event) => setImportDraft((current) => ({ ...current, title: event.target.value }))} /></label><div className="literature-form-grid"><label><span>作者</span><input value={importDraft.authors} onChange={(event) => setImportDraft((current) => ({ ...current, authors: event.target.value }))} /></label><label><span>年份</span><input inputMode="numeric" value={importDraft.year} onChange={(event) => setImportDraft((current) => ({ ...current, year: event.target.value.replace(/[^0-9]/g, "") }))} /></label></div><label><span>期刊</span><input value={importDraft.journal} onChange={(event) => setImportDraft((current) => ({ ...current, journal: event.target.value }))} /></label><label><span>DOI</span><input value={importDraft.doi} onChange={(event) => setImportDraft((current) => ({ ...current, doi: event.target.value }))} /></label><label><span>中文标题</span><input value={importDraft.translatedTitleZh} onChange={(event) => setImportDraft((current) => ({ ...current, translatedTitleZh: event.target.value }))} /></label><label><span>中文摘要</span><textarea rows={4} value={importDraft.summaryZh} onChange={(event) => setImportDraft((current) => ({ ...current, summaryZh: event.target.value }))} /></label><label><span>建议标签</span><input value={importDraft.suggestedTags} onChange={(event) => setImportDraft((current) => ({ ...current, suggestedTags: event.target.value }))} placeholder="用逗号分隔" /></label>{selectedItem.duplicateCandidates.length > 0 && <label><span>重复处理</span><select required value={targetItemKey} onChange={(event) => setTargetItemKey(event.target.value)}><option value="">请选择已有条目或新建</option>{selectedItem.duplicateCandidates.map((candidate) => <option key={candidate.itemKey} value={candidate.itemKey}>匹配：{candidate.title}</option>)}<option value="new">确认新建条目</option></select></label>}<p>确认后将创建或匹配 Zotero 条目、上传 PDF 受管副本，并回读验证附件；原始文件保持不变。</p><div className="literature-dialog-actions"><button type="button" onClick={() => setDialog(null)}>取消</button><button type="submit" disabled={busyId === selectedItem.id}>{busyId === selectedItem.id ? "导入中…" : "确认入库"}</button></div></form></section></div>}
    {readerItem && typeof document !== "undefined" ? createPortal(<div className="literature-reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReaderItem(null); }}><LiteratureReader item={readerItem} runtime={runtime} settings={settings} onClose={() => setReaderItem(null)} onOpenLocation={() => void openFolder(readerItem)} /></div>, document.body) : null}
  </section>;
}

function itemStatusLabel(item: LiteratureUnifiedItem) {
  if (item.source !== "zotero" && item.sourceAvailability === "missing") {
    return item.status === "imported" ? "已入库 · 源文件缺失" : "文件缺失";
  }
  return item.source === "zotero" ? "Zotero 已有" : statusLabel(item.status);
}

function StatusChip({ item }: { item: LiteratureUnifiedItem }) {
  const tone = item.source !== "zotero" && item.sourceAvailability === "missing" ? "warning" : item.source === "zotero" ? "muted" : statusTone(item.status);
  return <span className={`literature-status literature-status--${tone}`}>{itemStatusLabel(item)}</span>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="literature-detail-section"><h3>{title}</h3>{children}</section>;
}

function OrganizationPlanRow({ item }: { item: LiteratureOrganizationPlanItem }) {
  return <div className={`literature-organize-plan-row literature-organize-plan-row--${item.status}`} role="listitem"><div><b title={item.sourceRelativePath}>{item.sourceRelativePath}</b><span>→ {item.targetRelativePath ?? "待确认"}</span></div><small>{organizationPlanStatusLabel(item.status)} · {item.reason}</small></div>;
}

function organizationPlanStatusLabel(status: LiteratureOrganizationPlanItem["status"]) {
  return status === "move" ? "可整理" : status === "unchanged" ? "已就位" : status === "conflict" ? "冲突" : "待复核";
}
