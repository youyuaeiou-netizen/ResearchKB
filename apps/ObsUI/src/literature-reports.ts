import type { LiteratureDiscussionMessage, LiteratureUnifiedItem } from "./literature";

export const OBSUI_REPORT_MARKER_PREFIX = "<!-- obsui-literature-report:";

function reportScalar(value: string | null | undefined) {
  return JSON.stringify(value ?? "");
}

function reportText(value: string | null | undefined, fallback = "待补充") {
  const text = (value ?? "").trim();
  return text || fallback;
}

export function sanitizeLiteratureReportStem(value: string | null | undefined, fallback = "未命名文献") {
  const cleaned = reportText(value, fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " - ")
    .replace(/[.# ]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/(?:\s*-\s*)+$/g, "")
    .trim();
  return (cleaned || fallback).slice(0, 150);
}

export function literatureReportFileName(item: Pick<LiteratureUnifiedItem, "title" | "id" | "doi">) {
  const stableSuffix = sanitizeLiteratureReportStem(item.doi?.replace(/[^a-z0-9]+/gi, "").slice(-12) || item.id.slice(-12), "report");
  return `${sanitizeLiteratureReportStem(item.title)} -- ${stableSuffix}.md`;
}

export function literatureReportRelativePath(item: Pick<LiteratureUnifiedItem, "title" | "id" | "doi">, reportFolder: string) {
  const folder = reportFolder.replace(/[\\]+/g, "/").replace(/^\/+|\/+$/g, "");
  return `${folder}/${literatureReportFileName(item)}`;
}

function discussionSection(messages: readonly LiteratureDiscussionMessage[]) {
  if (!messages.length) return "尚未产生讨论记录。";
  return messages.map((message) => {
    const heading = message.role === "user" ? "问题" : "AI 回答";
    const citations = message.citations.length
      ? `\n\n${message.citations.map((citation) => `> [第 ${citation.page} 页] ${citation.excerpt}`).join("\n")}`
      : "";
    return `### ${heading} · ${new Date(message.createdAt).toLocaleString("zh-CN")}\n\n${message.content}${citations}`;
  }).join("\n\n");
}

export function buildLiteratureReport(
  item: LiteratureUnifiedItem,
  messages: readonly LiteratureDiscussionMessage[],
  options: { generatedAt?: number; relativePdfPath?: string | null } = {},
) {
  const generatedAt = options.generatedAt ?? Date.now();
  const tags = item.suggestedTags.length ? item.suggestedTags : ["待分类"];
  const evidence = item.evidence.length
    ? item.evidence.map((value) => `- ${value}`).join("\n")
    : "- 当前分析没有返回可核验的正文证据。";
  const reportId = item.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return [
    `${OBSUI_REPORT_MARKER_PREFIX}${reportId} -->`,
    "---",
    "obsui_report: true",
    `source_id: ${reportScalar(item.id)}`,
    `title: ${reportScalar(item.title)}`,
    `doi: ${reportScalar(item.doi)}`,
    `generated_at: ${reportScalar(new Date(generatedAt).toISOString())}`,
    `tags: ${JSON.stringify(tags)}`,
    "---",
    "",
    `# ${reportText(item.title)}`,
    "",
    `> 由 ObsUI 文献工作区自动生成。最后更新：${new Date(generatedAt).toLocaleString("zh-CN")}`,
    "",
    "## 文献元数据",
    "",
    `- 作者：${reportText(item.authors.join("、"), "待识别")}`,
    `- 期刊：${reportText(item.journal, "待识别")}`,
    `- 年份：${item.year ?? "待识别"}`,
    `- DOI：${reportText(item.doi, "无")}`,
    `- 来源文件：${reportText(options.relativePdfPath ?? item.relativePath, "Zotero 附件或未记录")}`,
    "",
    "## 分析结果",
    "",
    `### 中文摘要\n\n${reportText(item.summaryZh ?? item.abstract)}`,
    "",
    `### 方法与分类\n\n${tags.map((tag) => `- ${tag}`).join("\n")}`,
    "",
    `### 置信度\n\n${item.confidence === null ? "待评估" : `${Math.round(item.confidence * 100)}%`}`,
    "",
    "### 可核验证据",
    "",
    evidence,
    "",
    "## 阅读讨论",
    "",
    discussionSection(messages),
    "",
    "## 人工复核与下一步",
    "",
    item.review.required ? `- 需要复核：${item.review.reasons.join("；")}` : "- 当前分析未标记必须复核，但仍建议对关键结论回到原文确认。",
    "- 可继续追问：研究假设、实验设计、局限性、与当前研究的关系。",
    "",
    "## ObsUI 来源",
    "",
    "- 本文件由 ObsUI 文献分析与讨论任务生成。原始 PDF 不会被移动、覆盖或写入。",
    "",
  ].join("\n");
}
