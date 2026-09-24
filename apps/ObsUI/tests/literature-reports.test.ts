import { buildLiteratureReport, literatureReportFileName, literatureReportRelativePath, sanitizeLiteratureReportStem } from "../src/literature-reports";
import type { LiteratureUnifiedItem } from "../src/literature";

const item: LiteratureUnifiedItem = {
  id: "local-1",
  source: "local",
  status: "ready",
  title: "A/B: Safe paper?",
  translatedTitleZh: null,
  authors: ["Ada Lovelace"],
  year: 2024,
  journal: "Journal",
  abstract: null,
  summaryZh: "这是一个足够长的摘要结果。",
  suggestedTags: ["LPBF", "方法分类"],
  confidence: .91,
  review: { required: false, reasons: [] },
  analysisSource: "text",
  evidence: ["Measured evidence"],
  relativePath: "Journal/paper.pdf",
  folderName: "Journal",
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
  updatedAt: 1,
};

describe("文献 Obsidian 报告", () => {
  it("sanitizes report names without changing the stable identity", () => {
    expect(sanitizeLiteratureReportStem("A/B: paper?")).toBe("A - B - paper");
    expect(literatureReportFileName(item)).toContain("-- 01000example.md");
    expect(literatureReportRelativePath(item, "03-Resources\\Reports")).toMatch(/^03-Resources\/Reports\/.+\.md$/);
  });

  it("combines analysis, evidence, and discussion with a recognizable marker", () => {
    const report = buildLiteratureReport(item, [{ id: "m1", role: "user", content: "方法是什么？", citations: [], createdAt: 1 }, { id: "m2", role: "assistant", content: "方法回答。", citations: [{ page: 3, excerpt: "The method" }], createdAt: 2 }], { generatedAt: 0 });
    expect(report).toContain("<!-- obsui-literature-report:local-1 -->");
    expect(report).toContain("Measured evidence");
    expect(report).toContain("方法回答");
    expect(report).toContain("[第 3 页]");
    expect(report).toContain('obsui_report: true');
  });
});
