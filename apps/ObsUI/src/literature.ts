export const LITERATURE_DATABASE_ROOT = "C:\\ObsUILiteratureDB";
export const LOCAL_MODEL_ROOT = "C:\\AIModels";
export const DEFAULT_LOCAL_MODEL_FAMILY = "qwen3.5:9b";
export const DEFAULT_LOCAL_MODEL_PROFILE = "64k";
export const DEFAULT_LOCAL_MODEL = `${DEFAULT_LOCAL_MODEL_FAMILY}-${DEFAULT_LOCAL_MODEL_PROFILE}`;

export type LiteratureStatus =
  | "detected"
  | "analyzing"
  | "ready"
  | "matched"
  | "conflict"
  | "importing"
  | "imported"
  | "failed"
  | "partial-failed"
  | "ignored"
  | "missing";

export type LiteratureAnalysisSource = "text" | "vision" | "manual" | null;

export type LiteratureSourceAvailability = "present" | "missing";

export type LiteratureZoteroRef = {
  serverId: string;
  itemKey: string;
  attachmentKey: string | null;
};

export type LiteratureDuplicateCandidate = {
  itemKey: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  score: number;
  reason: "doi" | "title-author" | "hash";
};

export type LiteratureReview = {
  required: boolean;
  reasons: string[];
};

export type LiteratureImportOperation = {
  idempotencyKey: string;
  phase: "create-item" | "create-attachment" | "upload-file" | "verify";
  parentKey: string | null;
  attachmentKey: string | null;
  targetItemKey: string | null;
  disposition: "new" | "matched";
  updatedAt: number;
};

export type LiteratureRecord = {
  id: string;
  sourcePath: string;
  relativePath: string;
  folderName: string;
  fileName: string;
  size: number;
  mtimeMs: number;
  sha256: string;
  status: LiteratureStatus;
  sourceAvailability: LiteratureSourceAvailability;
  /** Distinguishes a deliberate deferral from legacy remove tombstones. */
  ignoredReason: "manual" | "legacy-remove" | null;
  title: string | null;
  authors: string[];
  journal: string | null;
  year: number | null;
  doi: string | null;
  abstract: string | null;
  translatedTitleZh: string | null;
  summaryZh: string | null;
  suggestedTags: string[];
  confidence: number | null;
  review: LiteratureReview;
  analysisSource: LiteratureAnalysisSource;
  evidence: string[];
  zotero: LiteratureZoteroRef | null;
  duplicateCandidates: LiteratureDuplicateCandidate[];
  importOperation: LiteratureImportOperation | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type LiteratureSettings = {
  version: 2;
  inboxPath: string | null;
  modelFamily: string;
  modelProfile: string;
  runtimeTag: string;
  deepAnalysisProvider: "ollama" | "codex";
  deepAnalysisModel: string;
  deepAnalysisReasoningEffort: string;
  /** Optional Obsidian Vault root used only for generated Markdown reports. */
  obsidianVaultPath?: string | null;
};

export type LiteraturePublicSettings = {
  version: 2;
  inboxConfigured: boolean;
  inboxDisplayName: string | null;
  modelFamily: string;
  modelProfile: string;
  runtimeTag: string;
  deepAnalysisProvider: "ollama" | "codex";
  deepAnalysisModel: string;
  deepAnalysisReasoningEffort: string;
  obsidianVaultConfigured?: boolean;
  obsidianVaultDisplayName?: string | null;
  obsidianReportFolder?: string;
};

export type LiteratureModelProfile = {
  profile: string;
  runtimeTag: string;
  contextLength: number | null;
  size: number | null;
  modifiedAt: number | null;
};

export type LiteratureModelFamily = {
  name: string;
  profiles: LiteratureModelProfile[];
};

export type LiteratureUnifiedItem = {
  id: string;
  source: "local" | "zotero" | "merged";
  status: LiteratureStatus;
  title: string;
  translatedTitleZh: string | null;
  authors: string[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  summaryZh: string | null;
  suggestedTags: string[];
  confidence: number | null;
  review: LiteratureReview;
  analysisSource: LiteratureAnalysisSource;
  evidence: string[];
  relativePath: string | null;
  folderName: string | null;
  fileName: string | null;
  size: number | null;
  mtimeMs: number | null;
  sourceAvailability: LiteratureSourceAvailability | null;
  doi: string | null;
  url: string | null;
  attachmentCount: number;
  zoteroItemKey: string | null;
  zoteroAttachmentKey: string | null;
  duplicateCandidates: LiteratureDuplicateCandidate[];
  importOperation: Pick<LiteratureImportOperation, "phase" | "disposition" | "updatedAt"> | null;
  error: string | null;
  updatedAt: number;
};

export type LiteratureRuntimeStatus = {
  settings: LiteraturePublicSettings;
  watcher: { active: boolean; lastScanAt: number | null; error: string | null };
  model: {
    provider: "ollama";
    status: "ready" | "unavailable";
    configured: boolean;
    selected: { family: string; profile: string; runtimeTag: string };
    families: LiteratureModelFamily[];
    error: string | null;
  };
  zotero: {
    connected: boolean;
    authorized: boolean;
    serverId: string | null;
    version: string | null;
    error: string | null;
  };
  counts: Record<LiteratureStatus, number> & { total: number; zotero: number };
  checkedAt: number;
};

export type LiteratureFolderSelectionResponse = LiteratureRuntimeStatus & {
  folderSelection: "selected" | "cancelled";
};

export type LiteratureItemsResponse = {
  items: LiteratureUnifiedItem[];
  total: number;
  checkedAt: number;
};

export type LiteratureSelectionTranslationModel = {
  providerId: string;
  modelId: string;
  profileId?: string;
  reasoningEffort?: string;
  cliPath?: string;
  cliArgs?: string;
  cliPreset?: "opencode" | "generic";
};

export type LiteratureSelectionTranslationRequest = {
  itemId: string;
  page: number;
  text: string;
  mode: "word" | "passage";
  sourceLanguage: "auto" | string;
  targetLanguage: string;
  model: LiteratureSelectionTranslationModel;
};

export type LiteratureSelectionTranslationResponse = {
  mode: "word" | "passage";
  sourceLanguage: string;
  targetLanguage: string;
  translation: string;
  pronunciation?: string;
  partOfSpeech?: string;
  senses?: string[];
  example?: string;
};

export type LiteratureOrganizationPlanStatus = "move" | "unchanged" | "review" | "conflict";

export type LiteratureOrganizationPlanItem = {
  id: string;
  sourceRelativePath: string;
  targetRelativePath: string | null;
  title: string | null;
  journal: string | null;
  status: LiteratureOrganizationPlanStatus;
  reason: string;
};

export type LiteratureOrganizationPreview = {
  rootDisplayName: string;
  items: LiteratureOrganizationPlanItem[];
  summary: {
    move: number;
    unchanged: number;
    review: number;
    conflict: number;
    total: number;
  };
  generatedAt: number;
};

export type LiteratureModelJob = {
  id: string;
  modelName: string;
  status: "running" | "completed" | "failed";
  output: string;
  startedAt: number;
  finishedAt: number | null;
};

export type LiteratureTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type LiteratureTask = {
  id: string;
  kind: "analysis-batch" | "deep-analysis";
  title: string;
  executor: "ollama" | "codex";
  model?: string;
  localOcrModel?: string;
  reasoningEffort?: string;
  status: LiteratureTaskStatus;
  itemIds: string[];
  total: number;
  completed: number;
  failed: number;
  currentItemId: string | null;
  totalPages?: number;
  completedPages?: number;
  phase?: "queued" | "reading" | "synthesizing" | "writing" | "done";
  reportPath?: string | null;
  reportCount: number;
  reportSkipped: number;
  error: string | null;
  output: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type LiteratureDiscussionCitation = {
  page: number;
  excerpt: string;
};

export type LiteratureDiscussionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: LiteratureDiscussionCitation[];
  createdAt: number;
};

export type LiteratureDiscussionModel = LiteratureSelectionTranslationModel;

export type LiteratureDiscussionResponse = {
  message: LiteratureDiscussionMessage;
  messages: LiteratureDiscussionMessage[];
  report: { status: "written" | "unconfigured" | "skipped"; path: string | null; message: string };
};

export const DEFAULT_OBSIDIAN_REPORT_FOLDER = "03-Resources/ObsUI Literature Reports";

export function normalizeLiteratureText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

export function normalizeDoi(value: string | null | undefined) {
  const normalized = normalizeLiteratureText(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[).,;]+$/g, "")
    .trim();
  return normalized ? normalized.toLowerCase() : null;
}

export function normalizeTitle(value: string | null | undefined) {
  return normalizeLiteratureText(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function titleFromFileName(fileName: string) {
  return normalizeLiteratureText(fileName.replace(/\.pdf$/i, "").replace(/[._-]+/g, " ")) || "未识别标题";
}

export function statusLabel(status: LiteratureStatus) {
  const labels: Record<LiteratureStatus, string> = {
    detected: "待分析",
    analyzing: "分析中",
    ready: "可入库",
    matched: "匹配已有",
    conflict: "疑似重复",
    importing: "导入中",
    imported: "已入库",
    failed: "待处理",
    "partial-failed": "部分失败",
    ignored: "暂不处理",
    missing: "文件缺失",
  };
  return labels[status];
}

export function statusTone(status: LiteratureStatus) {
  if (status === "imported") return "success";
  if (status === "conflict" || status === "failed" || status === "partial-failed" || status === "missing") return "warning";
  if (status === "analyzing" || status === "importing") return "active";
  if (status === "ignored") return "muted";
  return "ready";
}

export function formatLiteratureAuthors(authors: readonly string[]) {
  if (!authors.length) return "作者待识别";
  if (authors.length <= 3) return authors.join("、");
  return `${authors.slice(0, 3).join("、")} 等`;
}

export function filterLiteratureItems(items: readonly LiteratureUnifiedItem[], collectionId: string, query: string) {
  const normalizedQuery = normalizeLiteratureText(query).toLocaleLowerCase();
  const folderCollection = collectionId.startsWith("folder:") ? collectionId.slice("folder:".length) : null;
  return items.filter((item) => {
    // A deliberately deferred local record stays out of visible collections.
    // Removing a missing/out-of-folder source is handled by deleting its local
    // record, so a later scan can create it again when the file returns.
    const inIgnoredCollection = collectionId === "ignored" && item.status === "ignored";
    const inMissingCollection = collectionId === "missing" && item.source !== "zotero" && item.sourceAvailability === "missing";
    if (item.status === "ignored" && !inIgnoredCollection) return false;
    const inCollection = inIgnoredCollection
      || inMissingCollection
      || collectionId === "library"
      || collectionId === "pending" && ["detected", "analyzing", "ready", "matched", "conflict", "failed", "partial-failed"].includes(item.status)
      || collectionId === "recent" && item.updatedAt > Date.now() - 30 * 24 * 60 * 60 * 1000
      || collectionId === "duplicates" && item.status === "conflict"
      || collectionId === "unfiled" && (!item.folderName || item.folderName === "未分类")
      || folderCollection !== null && item.folderName === folderCollection
      || folderCollection === null && item.folderName === collectionId;
    if (!inCollection) return false;
    if (!normalizedQuery) return true;
    return [item.title, item.translatedTitleZh, ...item.authors, item.journal, item.doi, item.folderName, ...item.suggestedTags]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}
