import { describe, expect, it } from "vitest";
import { filterLiteratureItems, formatLiteratureAuthors, normalizeDoi, normalizeTitle, statusLabel, titleFromFileName, type LiteratureUnifiedItem } from "../src/literature";

const item = (overrides: Partial<LiteratureUnifiedItem> = {}): LiteratureUnifiedItem => ({
  id: "local-1",
  source: "local",
  status: "ready",
  title: "Physics-informed melt pool model",
  translatedTitleZh: "物理引导熔池模型",
  authors: ["Kim"],
  year: 2024,
  journal: "Additive Manufacturing",
  abstract: null,
  summaryZh: "摘要",
  suggestedTags: ["LPBF"],
  confidence: 0.9,
  review: { required: false, reasons: [] },
  analysisSource: "text",
  evidence: [],
  relativePath: "LPBF/paper.pdf",
  folderName: "LPBF",
  fileName: "paper.pdf",
  size: 1,
  mtimeMs: 1,
  sourceAvailability: "present",
  doi: "10.1000/example",
  url: null,
  attachmentCount: 1,
  zoteroItemKey: null,
  zoteroAttachmentKey: null,
  duplicateCandidates: [],
  importOperation: null,
  error: null,
  updatedAt: Date.now(),
  ...overrides,
});

describe("文献数据工具", () => {
  it("normalizes DOI, titles, and PDF names", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC.")).toBe("10.1000/abc");
    expect(normalizeTitle("Physics-informed / Melt Pool")).toBe("physics informed melt pool");
    expect(titleFromFileName("A_novel-method.pdf")).toBe("A novel method");
  });

  it("maps statuses and author display without inventing metadata", () => {
    expect(statusLabel("ready")).toBe("可入库");
    expect(formatLiteratureAuthors([])).toBe("作者待识别");
    expect(formatLiteratureAuthors(["A", "B", "C", "D"])).toBe("A、B、C 等");
  });

  it("filters pending, duplicate, folder, and searchable items", () => {
    const items = [
      item(),
      item({ id: "local-2", status: "conflict", title: "Duplicate paper", folderName: "Heat Treatment", duplicateCandidates: [{ itemKey: "Z1", title: "Existing", authors: [], year: 2024, doi: null, score: 0.8, reason: "title-author" }] }),
      item({ id: "zotero-3", source: "zotero", status: "imported", title: "Archived Zotero item", folderName: null, relativePath: null, fileName: null, size: null, mtimeMs: null, zoteroItemKey: "Z3" }),
    ];
    expect(filterLiteratureItems(items, "pending", "")).toHaveLength(2);
    expect(filterLiteratureItems(items, "duplicates", "")).toHaveLength(1);
    expect(filterLiteratureItems(items, "Heat Treatment", "")).toHaveLength(1);
    expect(filterLiteratureItems(items, "folder:Heat Treatment", "")).toHaveLength(1);
    expect(filterLiteratureItems(items, "library", "physics")).toHaveLength(1);
    expect(filterLiteratureItems(items, "unfiled", "")).toHaveLength(1);
    expect(filterLiteratureItems([...items, item({ id: "unfiled-local", folderName: "未分类" })], "unfiled", "")).toHaveLength(2);
    expect(filterLiteratureItems([...items, item({ id: "ignored", status: "ignored" })], "library", "")).toHaveLength(3);
    expect(filterLiteratureItems([...items, item({ id: "ignored", status: "ignored" })], "ignored", "")).toHaveLength(1);
    expect(filterLiteratureItems([...items, item({ id: "missing", status: "imported", sourceAvailability: "missing" })], "missing", "")).toHaveLength(1);
  });
});
