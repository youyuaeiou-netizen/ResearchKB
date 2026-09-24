import { describe, expect, it } from "vitest";
import { DEEP_REPORT_FOLDER, evidenceAppearsOnPage, isUntouchedDeepReport, normalizeDeepAnalysis, renderDeepReport, sealDeepReport, splitPageText } from "../src/literature-deep-analysis";

describe("文献深读报告", () => {
  it("keeps text beyond the old 60k limit and preserves page-local chunks", () => {
    const chunks = splitPageText("研究方法与证据。".repeat(10_000));
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.join("")).toHaveLength("研究方法与证据。".repeat(10_000).length);
  });

  it("keeps only evidence whose page and excerpt match the extracted text", () => {
    const pages = new Map([[1, "The measured hardness increased by 20 percent."], [2, "The sample cracked during the test."]]);
    expect(evidenceAppearsOnPage("hardness increased by 20 percent", pages.get(1)!)).toBe(true);
    const analysis = normalizeDeepAnalysis({
      researchQuestion: "What changed?", methods: ["Measured hardness"],
      findings: [
        { page: 1, excerpt: "hardness increased by 20 percent", point: "硬度上升" },
        { page: 3, excerpt: "invented result", point: "虚构结论" },
      ], limitations: [], implications: [], unknowns: [],
    }, pages, 2);
    expect(analysis.findings).toHaveLength(1);
    expect(analysis.unknowns).toContain("部分模型结论缺少可核对的原文摘录，已从关键发现中排除。");
    expect(renderDeepReport({ id: "zotero-ABC", title: "Test", doi: null }, analysis)).toContain("第 1 页");
  });

  it("writes inside Curated and refuses to overwrite manually changed content", () => {
    expect(DEEP_REPORT_FOLDER).toBe("03-Resources/Curated");
    const sealed = sealDeepReport("<!-- obsui-deep-analysis:local-1 -->\n# 论文\n");
    expect(isUntouchedDeepReport(sealed, "local-1")).toBe(true);
    expect(isUntouchedDeepReport(sealed + "我的笔记", "local-1")).toBe(false);
    expect(isUntouchedDeepReport(sealed, "local-2")).toBe(false);
    expect(isUntouchedDeepReport("# 人工笔记", "local-1")).toBe(false);
  });
});
