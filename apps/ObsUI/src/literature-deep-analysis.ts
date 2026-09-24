import { createHash } from "node:crypto";

export type DeepEvidence = { page: number; excerpt: string; point: string };

export type DeepAnalysis = {
  researchQuestion: string;
  methods: string[];
  findings: DeepEvidence[];
  limitations: string[];
  implications: string[];
  unknowns: string[];
  pagesAnalyzed: number;
  pageCount: number;
};

export const DEEP_REPORT_FOLDER = "03-Resources/Curated";
export const DEEP_REPORT_MARKER = "<!-- obsui-deep-analysis:";
const hashMarker = "<!-- obsui-generated-sha256:";

export function sealDeepReport(body: string) {
  return `${body}${hashMarker}${createHash("sha256").update(body).digest("hex")} -->\n`;
}

export function isUntouchedDeepReport(content: string, itemId: string) {
  const marker = `${DEEP_REPORT_MARKER}${itemId.replace(/[^a-zA-Z0-9_-]/g, "_")} -->`;
  if (!content.startsWith(marker)) return false;
  const match = content.match(/<!-- obsui-generated-sha256:([a-f0-9]{64}) -->\n$/);
  if (!match) return false;
  const body = content.slice(0, -match[0].length);
  return createHash("sha256").update(body).digest("hex") === match[1];
}

export function splitPageText(text: string, maxLength = 6_000) {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length; offset += maxLength) parts.push(text.slice(offset, offset + maxLength));
  return parts;
}

export function evidenceAppearsOnPage(excerpt: string, pageText: string) {
  const normalize = (value: string) => value.replace(/\s+/g, "").toLocaleLowerCase();
  const needle = normalize(excerpt);
  return needle.length >= 8 && normalize(pageText).includes(needle);
}

export function normalizeDeepEvidence(value: unknown, pages: ReadonlyMap<number, string>): DeepEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const page = Number(record.page);
    const excerpt = typeof record.excerpt === "string" ? record.excerpt.trim().slice(0, 400) : "";
    const point = typeof record.point === "string" ? record.point.trim().slice(0, 600) : "";
    return Number.isInteger(page) && point && evidenceAppearsOnPage(excerpt, pages.get(page) ?? "") ? [{ page, excerpt, point }] : [];
  });
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 1_000)) : [];
}

export function normalizeDeepAnalysis(value: unknown, pages: ReadonlyMap<number, string>, pageCount: number): DeepAnalysis {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const findings = normalizeDeepEvidence(raw.findings, pages);
  const unknowns = strings(raw.unknowns);
  if (Array.isArray(raw.findings) && findings.length < raw.findings.length) unknowns.push("部分模型结论缺少可核对的原文摘录，已从关键发现中排除。");
  if (!findings.length) unknowns.push("未获得带可核对页码和原文摘录的关键发现。");
  return {
    researchQuestion: typeof raw.researchQuestion === "string" ? raw.researchQuestion.trim().slice(0, 2_000) : "",
    methods: strings(raw.methods),
    findings,
    limitations: strings(raw.limitations),
    implications: strings(raw.implications),
    unknowns,
    pagesAnalyzed: pages.size,
    pageCount,
  };
}

export function renderDeepReport(item: { id: string; title: string; doi: string | null }, analysis: DeepAnalysis) {
  const id = item.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const bullets = (values: readonly string[]) => values.length ? values.map((value) => `- ${value}`).join("\n") : "- 原文未能确认。";
  return [
    `${DEEP_REPORT_MARKER}${id} -->`,
    `# ${item.title}`,
    "",
    `> ObsUI 深读报告 · 已处理 ${analysis.pagesAnalyzed}/${analysis.pageCount} 页 · DOI：${item.doi ?? "无"}`,
    "",
    "## 研究问题",
    analysis.researchQuestion || "原文未能确认。",
    "",
    "## 方法链",
    bullets(analysis.methods),
    "",
    "## 关键结果与原文依据",
    analysis.findings.length ? analysis.findings.map((finding) => `- ${finding.point}（第 ${finding.page} 页）\n  > ${finding.excerpt}`).join("\n") : "- 未获得可核对的关键结果。",
    "",
    "## 局限性",
    bullets(analysis.limitations),
    "",
    "## 对研究的启发",
    bullets(analysis.implications),
    "",
    "## 待核实的问题",
    bullets(analysis.unknowns),
    "",
    "---",
    "本报告由本地模型辅助生成；页码和摘录供回到原 PDF 复核。原始 PDF 未被修改。",
    "",
  ].join("\n");
}
