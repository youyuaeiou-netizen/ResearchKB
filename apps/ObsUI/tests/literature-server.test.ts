import { describe, expect, it } from "vitest";
import { academicGlossaryTranslation, coalesceLocalLiteratureRecords, detachZoteroRecord, extractAuthorCandidates, extractDoiCandidate, extractPdfText, findLiteratureDuplicates, groupLiteratureModels, ignoreDuplicateLiteratureRecords, importIdempotencyKey, literatureDoiUrl, literatureExternalUrl, literatureFolderNameFromRelativePath, markAnalysisFailed, markSourceFileMissing, mergeDuplicateLiteratureRecords, modelSelectionFromRuntimeTag, normalizeLiteratureAnalysis, normalizeRecord, normalizeSettings, parsePdfByteRange, parseTranslationModelOutput, reconcileLiteratureRecords, renderPdfPages, restoredLiteratureStatus, sanitizeLiteratureFileName, sanitizeLiteratureFolderName, shouldSkipLiteratureFileHash, sourceDirectoryPath, statusAfterMissingFile, statusAfterZoteroDeletion, toZoteroCreators, unifyLiteratureRecords, updateRecordForFile, zoteroDeleteHeaders, zoteroFileUploadHeaders } from "../src/literature-server";
import type { LiteratureSelectionTranslationRequest } from "../src/literature";

const source = {
  title: "Physics-guided melt pool model",
  authors: ["Ada Lovelace"],
  year: 2024,
  doi: "10.1000/example",
  sha256: "a".repeat(64),
};

function makePdf(contentStream: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(contentStream, "ascii")} >>\nstream\n${contentStream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

describe("文献后端边界", () => {
  const translationRequest: LiteratureSelectionTranslationRequest = {
    itemId: "local-1",
    page: 1,
    text: "Metallic components are the cornerstone of modern industries.",
    mode: "passage",
    sourceLanguage: "auto",
    targetLanguage: "简体中文",
    model: { providerId: "ollama", modelId: "qwen3.5:9b-64k" },
  };

  it("accepts structured or plain-text translation output without exposing wrappers", () => {
    expect(parseTranslationModelOutput('{"translation":"金属部件是现代工业的基石。","sourceLanguage":"英语"}', translationRequest)).toMatchObject({ translation: "金属部件是现代工业的基石。", sourceLanguage: "英语" });
    expect(parseTranslationModelOutput("译文：金属部件是现代工业的基石。", translationRequest)).toMatchObject({ translation: "金属部件是现代工业的基石。", sourceLanguage: "自动识别" });
    expect(parseTranslationModelOutput('{"translation":[{"text":"金属部件是现代工业的基石。"}],"sourceLanguage":"英语"}', translationRequest)).toMatchObject({ translation: "金属部件是现代工业的基石。", sourceLanguage: "英语" });
    expect(parseTranslationModelOutput('{"result":{"translation":"金属部件是现代工业的基石。","sourceLanguage":"英语"}}', translationRequest)).toMatchObject({ translation: "金属部件是现代工业的基石。", sourceLanguage: "英语" });
  });

  it("rejects an echoed or obviously truncated Chinese translation", () => {
    const longRequest = { ...translationRequest, text: `${translationRequest.text} To a large extent, it determines the performance of an entire mechanical system.` };
    expect(() => parseTranslationModelOutput('{"translation":"Metallic components are the cornerstone of modern industries.","sourceLanguage":"English"}', longRequest)).toThrow("疑似未翻译完整");
    expect(() => parseTranslationModelOutput('{"translation":"金属部件是现代工业的基石。","sourceLanguage":"English"}', longRequest)).toThrow("疑似未翻译完整");
  });

  it("preserves uppercase academic abbreviations instead of accepting phonetic transliteration", () => {
    const acronymRequest = { ...translationRequest, text: "LDED", mode: "word" as const };
    expect(() => parseTranslationModelOutput('{"translation":"莱迪德","sourceLanguage":"English"}', acronymRequest)).toThrow("遗漏了学术缩写 LDED");
    expect(parseTranslationModelOutput('{"translation":"LDED（激光定向能量沉积）","sourceLanguage":"English"}', acronymRequest).translation).toBe("LDED（激光定向能量沉积）");
    expect(academicGlossaryTranslation("LDED", "简体中文")).toBe("LDED（激光定向能量沉积）");
    expect(academicGlossaryTranslation("LDED", "English")).toBeNull();
  });

  it("groups context profiles under one model family", () => {
    expect(modelSelectionFromRuntimeTag("qwen3.5:9b-64k")).toEqual({ family: "qwen3.5:9b", profile: "64k", runtimeTag: "qwen3.5:9b-64k" });
    const families = groupLiteratureModels([
      { name: "qwen3.5:9b", size: 1, modifiedAt: 1 },
      { name: "qwen3.5:4b", size: 1, modifiedAt: 1 },
      { name: "qwen3.5:9b-128k", size: 1, modifiedAt: 1 },
      { name: "qwen3.5:9b-64k", size: 1, modifiedAt: 1 },
    ]);
    expect(families).toHaveLength(2);
    expect(families.find((family) => family.name === "qwen3.5:9b")?.profiles.map((profile) => profile.profile)).toEqual(["64k", "128k"]);
    expect(families.find((family) => family.name === "qwen3.5:4b")?.profiles.map((profile) => profile.profile)).toEqual(["default"]);
    expect(groupLiteratureModels([{ name: "qwen3.5:9b", size: 1, modifiedAt: 1 }])[0]?.profiles.map((profile) => profile.profile)).toEqual(["default"]);
    expect(normalizeSettings({ modelFamily: "qwen3.5:4b", modelProfile: "default", runtimeTag: "qwen3.5:4b" })).toMatchObject({ modelFamily: "qwen3.5:4b", modelProfile: "default", runtimeTag: "qwen3.5:4b" });
  });

  it("sanitizes model-generated journal folders and PDF names for Windows", () => {
    const folder = sanitizeLiteratureFolderName("Journal/Name:*?");
    const file = sanitizeLiteratureFileName("A: title?.pdf");
    expect(folder).not.toMatch(/[<>:"/\\|?*]/);
    expect(folder).toBe("Journal - Name -");
    expect(file.endsWith(".pdf")).toBe(true);
    expect(file.slice(0, -4)).not.toMatch(/[<>:"/\\|?*]/);
    expect(sanitizeLiteratureFolderName("CON")).toBe("_CON");
  });

  it("uses the child folder below Journal as the visible journal collection", () => {
    expect(literatureFolderNameFromRelativePath("Journal\\Journal of Alloys and Compounds\\paper.pdf")).toBe("Journal of Alloys and Compounds");
    expect(literatureFolderNameFromRelativePath("Journal\\paper.pdf")).toBe("未分类");
    expect(literatureFolderNameFromRelativePath("Laser Additive Manufacturing\\paper.pdf")).toBe("Laser Additive Manufacturing");
    expect(literatureFolderNameFromRelativePath("paper.pdf")).toBe("未分类");
  });

  it.each([
    ["C:\\ObsUI-Literature\\Journal\\Journal of Alloys and Compounds\\paper.pdf", "C:\\ObsUI-Literature\\Journal\\Journal of Alloys and Compounds"],
    ["C:\\ObsUI-Literature\\Journal\\Laser Additive Manufacturing of Metallic Materials and Components\\paper.pdf", "C:\\ObsUI-Literature\\Journal\\Laser Additive Manufacturing of Metallic Materials and Components"],
    ["C:\\ObsUI-Literature\\Journal\\增材制造与材料\\paper.pdf", "C:\\ObsUI-Literature\\Journal\\增材制造与材料"],
  ])("opens any local document by its own containing folder path: %s", (sourcePath, expectedDirectory) => {
    expect(sourceDirectoryPath(sourcePath)).toBe(expectedDirectory);
  });

  it("builds safe DOI and original-link targets for document opening", () => {
    expect(literatureDoiUrl("DOI: 10.1000/Example")).toBe("https://doi.org/10.1000/example");
    expect(literatureDoiUrl("https://doi.org/10.1000/Example")).toBe("https://doi.org/10.1000/example");
    expect(literatureDoiUrl("javascript:alert(1)")).toBeNull();
    expect(literatureExternalUrl("https://publisher.example/paper")).toBe("https://publisher.example/paper");
    expect(literatureExternalUrl("file:///C:/private/paper.pdf")).toBeNull();
  });

  it("refreshes folder metadata without discarding an unchanged analysis", () => {
    const record = normalizeRecord({
      id: "local-folder-migration",
      sourcePath: "C:\\ObsUI-Literature\\Journal\\Additive Manufacturing\\paper.pdf",
      relativePath: "Journal\\Additive Manufacturing\\paper.pdf",
      folderName: "Journal",
      fileName: "paper.pdf",
      size: 1,
      mtimeMs: 1,
      sha256: "9".repeat(64),
      status: "ready",
      title: "Analyzed title",
      journal: "Additive Manufacturing",
      analysisSource: "text",
    });
    expect(record).not.toBeNull();
    const migrated = updateRecordForFile(record!, {
      path: record!.sourcePath,
      relativePath: record!.relativePath,
      folderName: "Additive Manufacturing",
      fileName: record!.fileName,
      size: record!.size,
      mtimeMs: record!.mtimeMs,
    }, record!.sha256);
    expect(migrated.changed).toBe(true);
    expect(migrated.record.folderName).toBe("Additive Manufacturing");
    expect(migrated.record.title).toBe("Analyzed title");
    expect(migrated.record.status).toBe("ready");
  });

  it("accepts evidence-backed structured analysis and marks low confidence for review", () => {
    const analysis = normalizeLiteratureAnalysis({
      title: source.title,
      authors: source.authors,
      journal: "Additive Manufacturing",
      year: 2024,
      doi: source.doi,
      translatedTitleZh: "物理引导熔池模型",
      summaryZh: "测".repeat(120),
      suggestedTags: ["LPBF"],
      evidence: ["Abstract"],
      confidence: 0.4,
    }, "Abstract: Physics-guided melt pool model.");
    expect(analysis.review).toEqual(expect.objectContaining({ required: true }));
    expect(analysis.review.reasons).toContain("置信度低于 65%");
    expect(() => normalizeLiteratureAnalysis({ ...analysis, doi: "not-a-doi" }, "Abstract: Physics-guided melt pool model.")).toThrow("DOI");
  });

  it("accepts evidence from rendered pages without weakening text evidence checks", () => {
    const value = {
      title: source.title,
      authors: [],
      journal: "Additive Manufacturing",
      year: 2024,
      doi: source.doi,
      translatedTitleZh: "物理引导熔池模型",
      summaryZh: "测".repeat(120),
      suggestedTags: ["LPBF"],
      evidence: ["Evidence visible only in the rendered page"],
      confidence: 0.9,
    };
    expect(() => normalizeLiteratureAnalysis(value, "Only extracted text")).toThrow("证据无法在 PDF 内容中验证");
    const analysis = normalizeLiteratureAnalysis(value, "Only extracted text", { evidenceMode: "vision", fallbackAuthors: ["Ada Lovelace"] });
    expect(analysis.evidence).toEqual(["Evidence visible only in the rendered page"]);
    expect(analysis.authors).toEqual(["Ada Lovelace"]);
    expect(analysis.review.required).toBe(false);
    const noDoi = normalizeLiteratureAnalysis({ ...value, doi: null, evidence: ["Only extracted text"] }, "Only extracted text");
    expect(noDoi.review.required).toBe(false);
    const recoveredEvidence = normalizeLiteratureAnalysis(value, "Only extracted text", { fallbackEvidence: ["Only extracted text"] });
    expect(recoveredEvidence.evidence).toEqual(["Only extracted text"]);
  });

  it("uses PDF metadata and DOI candidates to reduce author hand entry", () => {
    expect(extractAuthorCandidates({ Author: "Ada Lovelace; Grace Hopper" })).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(extractDoiCandidate({ Subject: "A paper. 10.1016/B978-0-12-823783-0.00003-6" }, "")).toBe("10.1016/b978-0-12-823783-0.00003-6");
    expect(toZoteroCreators(["甜姐材料教研组", "Ada Lovelace"])).toEqual([
      { creatorType: "author", name: "甜姐材料教研组" },
      { creatorType: "author", firstName: "Ada", lastName: "Lovelace" },
    ]);
  });

  it("does not leave interrupted or failed analysis eligible for the automatic detected queue", () => {
    const interrupted = normalizeRecord({
      id: "local-interrupted",
      sourcePath: "C:\\\\ObsUI-Test\\\\paper.pdf",
      relativePath: "paper.pdf",
      fileName: "paper.pdf",
      sha256: "b".repeat(64),
      status: "analyzing",
    });
    expect(interrupted?.status).toBe("failed");
    expect(interrupted?.error).toContain("上一次分析未完成");
    expect(interrupted?.review.required).toBe(true);
    const failed = interrupted ? markAnalysisFailed(interrupted, new Error("证据校验失败")) : null;
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("证据校验失败");
  });

  it("restores a recovered file to its actionable persisted state", () => {
    expect(restoredLiteratureStatus({ analysisSource: "vision", duplicateCandidates: [{ itemKey: "Z1", title: "Existing", authors: [], year: 2024, doi: null, score: 1, reason: "doi" }] })).toBe("conflict");
    expect(restoredLiteratureStatus({ analysisSource: "text", duplicateCandidates: [] })).toBe("ready");
    expect(restoredLiteratureStatus({ analysisSource: null, duplicateCandidates: [] })).toBe("detected");
  });

  it("keeps manual deferrals ignored and revives legacy removal records when the file returns", () => {
    expect(statusAfterMissingFile("ignored")).toBe("ignored");
    expect(statusAfterMissingFile("imported")).toBe("imported");
    expect(statusAfterMissingFile("conflict")).toBe("missing");
    const imported = normalizeRecord({
      id: "local-imported",
      sourcePath: "C:\\ObsUI-Test\\imported.pdf",
      relativePath: "imported.pdf",
      fileName: "imported.pdf",
      size: 1,
      mtimeMs: 1,
      sha256: "e".repeat(64),
      status: "imported",
      sourceAvailability: "present",
      analysisSource: "text",
      zotero: { serverId: "server-1", itemKey: "Z1", attachmentKey: "A1" },
    });
    expect(imported).not.toBeNull();
    const missingImported = imported && markSourceFileMissing(imported);
    expect(missingImported?.record.status).toBe("imported");
    expect(missingImported?.record.sourceAvailability).toBe("missing");
    const returnedImported = imported && updateRecordForFile({ ...imported, sourceAvailability: "missing" }, {
      path: "C:\\ObsUI-Test\\imported.pdf",
      relativePath: "imported.pdf",
      folderName: "未分类",
      fileName: "imported.pdf",
      size: 1,
      mtimeMs: 1,
    }, "e".repeat(64));
    expect(returnedImported?.record.status).toBe("imported");
    expect(returnedImported?.record.sourceAvailability).toBe("present");
    const legacy = normalizeRecord({
      id: "local-removed",
      sourcePath: "C:\\ObsUI-Test\\removed.pdf",
      relativePath: "removed.pdf",
      fileName: "removed.pdf",
      size: 0,
      mtimeMs: 0,
      sha256: "c".repeat(64),
      status: "ignored",
    });
    expect(legacy?.status).toBe("ignored");
    expect(legacy?.ignoredReason).toBe("legacy-remove");
    const restored = legacy && updateRecordForFile(legacy, {
      path: "C:\\ObsUI-Test\\removed.pdf",
      relativePath: "removed.pdf",
      folderName: "未分类",
      fileName: "removed.pdf",
      size: 0,
      mtimeMs: 0,
    }, "c".repeat(64));
    expect(restored?.record.status).toBe("detected");
    expect(restored?.record.ignoredReason).toBeNull();

    const manual = normalizeRecord({
      id: "local-deferred",
      sourcePath: "C:\\ObsUI-Test\\deferred.pdf",
      relativePath: "deferred.pdf",
      fileName: "deferred.pdf",
      size: 0,
      mtimeMs: 0,
      sha256: "d".repeat(64),
      status: "ignored",
      ignoredReason: "manual",
    });
    expect(manual?.ignoredReason).toBe("manual");
    const stillDeferred = manual && updateRecordForFile(manual, {
      path: "C:\\ObsUI-Test\\deferred.pdf",
      relativePath: "deferred.pdf",
      folderName: "未分类",
      fileName: "deferred.pdf",
      size: 0,
      mtimeMs: 0,
    }, "d".repeat(64));
    expect(stillDeferred?.record.status).toBe("ignored");
  });

  it("coalesces legacy local records by the same SHA-256 and stores secondary paths relatively", () => {
    const first = normalizeRecord({
      id: "local-hash-a",
      sourcePath: "C:\\legacy-library\\papers\\same.pdf",
      relativePath: "papers/same.pdf",
      fileName: "same.pdf",
      sha256: source.sha256,
      title: source.title,
      authors: source.authors,
      year: source.year,
      status: "ready",
      analysisSource: "text",
    });
    const second = normalizeRecord({
      id: "local-hash-b",
      sourcePath: "D:\\another-copy\\same.pdf",
      relativePath: "archive/same.pdf",
      fileName: "same.pdf",
      sha256: source.sha256,
      title: source.title,
      authors: source.authors,
      year: source.year,
      status: "ready",
      analysisSource: "text",
    });

    const merged = coalesceLocalLiteratureRecords([first!, second!]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.localCopies.map((copy) => copy.relativePath)).toEqual(["archive/same.pdf"]);
    expect(merged[0]?.recordAliases).toContain("local-hash-b");
    expect(JSON.stringify(merged[0]?.localCopies)).not.toContain("C:");
    expect(JSON.stringify(merged[0]?.localCopies)).not.toContain("D:");
    const legacy = normalizeRecord({
      id: "local-old-schema",
      sourcePath: "C:\\legacy-library\\paper.pdf",
      relativePath: "paper.pdf",
      fileName: "paper.pdf",
      sha256: source.sha256,
      localCopies: [
        { relativePath: "C:\\machine-only\\private.pdf", folderName: "", fileName: "private.pdf", size: 1, mtimeMs: 1, sha256: source.sha256 },
        { relativePath: "..\\outside\\private.pdf", folderName: "", fileName: "private.pdf", size: 1, mtimeMs: 1, sha256: source.sha256 },
      ],
    });
    expect(legacy?.localCopies).toEqual([]);

    const uncertainA = normalizeRecord({ ...first, id: "local-title-a", sourcePath: "C:\\papers\\one.pdf", relativePath: "one.pdf", sha256: "c".repeat(64), doi: null });
    const uncertainB = normalizeRecord({ ...second, id: "local-title-b", sourcePath: "C:\\papers\\two.pdf", relativePath: "two.pdf", sha256: "d".repeat(64), doi: null });
    expect(coalesceLocalLiteratureRecords([uncertainA!, uncertainB!])).toHaveLength(2);
  });

  it("shows at most two local files while preserving the other associations", () => {
    const record = normalizeRecord({
      id: "local-many-copies",
      sourcePath: "C:\\papers\\main.pdf",
      relativePath: "papers/main.pdf",
      fileName: "main.pdf",
      sha256: source.sha256,
      localCopies: [1, 2, 3, 4].map((index) => ({
        relativePath: `archive/copy-${index}.pdf`,
        fileName: `copy-${index}.pdf`,
        sha256: source.sha256,
        size: 10,
        mtimeMs: index,
        sourceAvailability: "present",
      })),
    });

    expect(record?.localCopies).toHaveLength(4);
    expect(unifyLiteratureRecords([record!], [], null)[0]?.localFiles).toHaveLength(2);
  });

  it("links local and Zotero sources by a unique exact DOI and presents one literature item", () => {
    const local = normalizeRecord({
      id: "local-doi",
      sourcePath: "C:\\papers\\same.pdf",
      relativePath: "papers/same.pdf",
      fileName: "same.pdf",
      sha256: source.sha256,
      title: source.title,
      authors: source.authors,
      year: source.year,
      doi: "https://doi.org/10.1000/EXAMPLE",
      status: "ready",
      analysisSource: "text",
    });
    const zoteroItems = [{ key: "ZOTERO01", version: 1, meta: {}, data: { itemType: "journalArticle", title: source.title, DOI: "10.1000/example", creators: [], date: "2024" } }];
    const reconciled = reconcileLiteratureRecords([local!], zoteroItems, "server-1");
    const unified = unifyLiteratureRecords(reconciled, zoteroItems, "server-1");

    expect(reconciled[0]?.zotero).toMatchObject({ serverId: "server-1", itemKey: "ZOTERO01" });
    expect(unified).toHaveLength(1);
    expect(unified[0]).toMatchObject({ id: "local-doi", source: "merged", zoteroItemKey: "ZOTERO01" });
  });

  it("links a local PDF to its unique Zotero parent by the attachment MD5", () => {
    const local = normalizeRecord({
      id: "local-attachment-hash",
      sourcePath: "C:\\papers\\same.pdf",
      relativePath: "papers/same.pdf",
      fileName: "same.pdf",
      sha256: source.sha256,
      md5: "e".repeat(32),
      title: "Local filename metadata",
      authors: [],
      year: 2024,
      doi: null,
      status: "ready",
    });
    const zoteroItems = [
      { key: "ZOTERO02", version: 1, meta: {}, data: { itemType: "journalArticle", title: "Zotero parent", creators: [], date: "2024" } },
      { key: "ATTACH02", version: 1, meta: {}, data: { itemType: "attachment", parentItem: "ZOTERO02", contentType: "application/pdf", filename: "same.pdf", md5: "e".repeat(32) } },
    ];

    const candidates = findLiteratureDuplicates(local!, zoteroItems);
    const reconciled = reconcileLiteratureRecords([local!], zoteroItems, "server-1");
    const unified = unifyLiteratureRecords(reconciled, zoteroItems, "server-1");

    expect(candidates).toMatchObject([{ itemKey: "ZOTERO02", reason: "hash" }]);
    expect(reconciled[0]?.zotero).toMatchObject({ itemKey: "ZOTERO02", attachmentKey: "ATTACH02" });
    expect(unified).toHaveLength(1);
    expect(unified[0]).toMatchObject({ source: "merged", zoteroItemKey: "ZOTERO02" });
  });

  it("rehashes unchanged legacy PDFs when their MD5 has not been backfilled", () => {
    const file = { size: 120, mtimeMs: 1_700_000_000_000 };
    const existing = normalizeRecord({
      id: "local-missing-md5",
      sourcePath: "C:\\papers\\same.pdf",
      relativePath: "papers/same.pdf",
      fileName: "same.pdf",
      sha256: source.sha256,
      size: file.size,
      mtimeMs: file.mtimeMs,
      md5: null,
      sourceAvailability: "present",
      status: "ready",
    })!;

    expect(shouldSkipLiteratureFileHash(existing.status, existing, file, false)).toBe(false);
    expect(shouldSkipLiteratureFileHash(existing.status, { ...existing, md5: "e".repeat(32) }, file, false)).toBe(true);
  });

  it("keeps ambiguous identical attachments in the suspected duplicate state", () => {
    const local = normalizeRecord({
      id: "local-ambiguous-attachment-hash",
      sourcePath: "C:\\papers\\same.pdf",
      relativePath: "papers/same.pdf",
      fileName: "same.pdf",
      sha256: source.sha256,
      md5: "f".repeat(32),
      title: "Local filename metadata",
      authors: [],
      year: null,
      doi: null,
      status: "ready",
    });
    const zoteroItems = ["ZOTERO03", "ZOTERO04"].flatMap((key) => [
      { key, version: 1, meta: {}, data: { itemType: "journalArticle", title: `Parent ${key}` } },
      { key: `ATTACH-${key}`, version: 1, meta: {}, data: { itemType: "attachment", parentItem: key, contentType: "application/pdf", filename: "same.pdf", md5: "f".repeat(32) } },
    ]);

    const reconciled = reconcileLiteratureRecords([local!], zoteroItems, "server-1");

    expect(reconciled[0]).toMatchObject({ status: "conflict", duplicateCandidates: [{ itemKey: "ZOTERO03" }, { itemKey: "ZOTERO04" }] });
    expect(reconciled[0]?.zotero).toBeNull();
  });

  it("parses PDF byte ranges including suffix and open-ended requests", () => {
    expect(parsePdfByteRange("bytes=4-9", 20)).toEqual({ start: 4, end: 9 });
    expect(parsePdfByteRange("bytes=15-", 20)).toEqual({ start: 15, end: 19 });
    expect(parsePdfByteRange("bytes=-5", 20)).toEqual({ start: 15, end: 19 });
    expect(parsePdfByteRange("bytes=18-99", 20)).toEqual({ start: 18, end: 19 });
    expect(parsePdfByteRange(undefined, 20)).toBeNull();
    expect(parsePdfByteRange("bytes=20-", 20)).toBe("invalid");
    expect(parsePdfByteRange("bytes=0-1,3-4", 20)).toBe("invalid");
  });

  it("does not auto-link by title when both records have conflicting DOIs", () => {
    const candidates = findLiteratureDuplicates({ ...source, doi: "10.1000/local" }, [
      { key: "DIFFDOI1", version: 1, meta: {}, data: { itemType: "journalArticle", title: source.title, DOI: "10.1000/other", creators: [{ creatorType: "author", firstName: "Ada", lastName: "Lovelace" }], date: "2024" } },
    ]);
    expect(candidates).toEqual([]);
  });

  it("prioritizes exact DOI, then persisted hash, then title-year-first-author matching", () => {
    const candidates = findLiteratureDuplicates(source, [
      { key: "DOI00001", version: 1, meta: {}, data: { itemType: "journalArticle", title: "Other", DOI: "10.1000/example", creators: [], date: "2020" } },
      { key: "HASH0001", version: 1, meta: {}, data: { itemType: "journalArticle", title: "Copied PDF", extra: "ObsUI-Source-SHA256: " + "a".repeat(64), creators: [], date: "2022" } },
      { key: "TITLE001", version: 1, meta: {}, data: { itemType: "journalArticle", title: source.title, creators: [{ creatorType: "author", firstName: "Ada", lastName: "Lovelace" }], date: "2024" } },
    ]);
    expect(candidates.map((candidate) => candidate.reason)).toEqual(["doi"]);
    const hashMatches = findLiteratureDuplicates({ ...source, doi: null }, [
      { key: "HASH0001", version: 1, meta: {}, data: { itemType: "journalArticle", title: "Copied PDF", extra: "ObsUI-Source-SHA256: " + "a".repeat(64), creators: [], date: "2022" } },
      { key: "TITLE001", version: 1, meta: {}, data: { itemType: "journalArticle", title: source.title, creators: [{ creatorType: "author", firstName: "Ada", lastName: "Lovelace" }], date: "2024" } },
    ]);
    expect(hashMatches.map((candidate) => candidate.reason)).toEqual(["hash"]);
    const titleMatches = findLiteratureDuplicates({ ...source, doi: null }, [
      { key: "TITLE001", version: 1, meta: {}, data: { itemType: "journalArticle", title: source.title, creators: [{ creatorType: "author", firstName: "Ada", lastName: "Lovelace" }], date: "2024" } },
    ]);
    expect(titleMatches.map((candidate) => candidate.reason)).toEqual(["title-author"]);
  });

  it("applies duplicate merge and ignore batches atomically and rejects stale repeats", () => {
    const conflictRecord = (id: string, itemKey: string) => normalizeRecord({
      id,
      sourcePath: `C:\\papers\\${id}.pdf`,
      relativePath: `papers/${id}.pdf`,
      fileName: `${id}.pdf`,
      sha256: "b".repeat(64),
      status: "conflict",
      duplicateCandidates: [{ itemKey, title: "Existing Zotero paper", authors: [], year: 2024, doi: source.doi, score: 1, reason: "doi" }],
    })!;
    const zoteroItems = [
      { key: "ZOTERO01", version: 1, meta: {}, data: { itemType: "journalArticle", title: "Existing Zotero paper" } },
      { key: "ZOTERO02", version: 1, meta: {}, data: { itemType: "journalArticle", title: "Existing Zotero paper" } },
    ];
    const initial = [conflictRecord("local-merge", "ZOTERO01"), conflictRecord("local-ignore", "ZOTERO02")];
    const merged = mergeDuplicateLiteratureRecords(initial, [{ id: "local-merge", itemKey: "ZOTERO01" }], "server-1", zoteroItems);
    expect(merged[0]).toMatchObject({ status: "matched", zotero: { serverId: "server-1", itemKey: "ZOTERO01" }, duplicateCandidates: [] });
    expect(() => mergeDuplicateLiteratureRecords(merged, [{ id: "local-merge", itemKey: "ZOTERO01" }], "server-1", zoteroItems)).toThrow("状态已变化");

    const ignored = ignoreDuplicateLiteratureRecords(initial, ["local-ignore"]);
    expect(ignored[1]).toMatchObject({ status: "ignored", ignoredReason: "manual" });
    expect(() => ignoreDuplicateLiteratureRecords(ignored, ["local-ignore"])).toThrow("状态已变化");
    expect(() => ignoreDuplicateLiteratureRecords(initial, ["local-ignore", "missing-id"])).toThrow("状态已变化");
    expect(initial[1]?.status).toBe("conflict");
  });

  it("keeps import idempotency stable for one Zotero server and source hash", () => {
    expect(importIdempotencyKey("server-a", source.sha256)).toBe(importIdempotencyKey("server-a", source.sha256));
    expect(importIdempotencyKey("server-a", source.sha256)).not.toBe(importIdempotencyKey("server-b", source.sha256));
  });

  it("uses If-Match for an existing Zotero attachment and If-None-Match for a new one", () => {
    expect(zoteroFileUploadHeaders(null, false)).toEqual({ "If-None-Match": "*" });
    expect(zoteroFileUploadHeaders("E7974E62264033996B4BD404BDCDC1E6", true)).toEqual({ "If-Match": "e7974e62264033996b4bd404bdcdc1e6" });
    expect(() => zoteroFileUploadHeaders(null, true)).toThrow("MD5");
  });

  it("detaches a local record after its Zotero parent enters the trash", () => {
    const record = normalizeRecord({
      id: "local-zotero-delete",
      sourcePath: "C:\\ObsUI-Test\\paper.pdf",
      relativePath: "paper.pdf",
      fileName: "paper.pdf",
      size: 1,
      mtimeMs: 1,
      sha256: "f".repeat(64),
      status: "imported",
      sourceAvailability: "present",
      analysisSource: "text",
      duplicateCandidates: [
        { itemKey: "DELETE01", title: "Deleted candidate", authors: [], year: 2024, doi: null, score: 1, reason: "doi" },
        { itemKey: "KEEP0001", title: "Remaining candidate", authors: [], year: 2024, doi: null, score: 0.9, reason: "title-author" },
      ],
      importOperation: { idempotencyKey: "operation", phase: "verify", parentKey: "DELETE01", attachmentKey: "ATTACH01", targetItemKey: "DELETE01", disposition: "matched", updatedAt: 1 },
      zotero: { serverId: "server-1", itemKey: "DELETE01", attachmentKey: "ATTACH01" },
    });
    expect(record).not.toBeNull();
    expect(statusAfterZoteroDeletion(record!)).toBe("conflict");
    const detached = detachZoteroRecord(record!, "DELETE01");
    expect(detached.zotero).toBeNull();
    expect(detached.status).toBe("conflict");
    expect(detached.duplicateCandidates.map((candidate) => candidate.itemKey)).toEqual(["KEEP0001"]);
    expect(detached.importOperation).toBeNull();
    expect(detached.sourcePath).toContain("paper.pdf");
  });

  it("requires the current Zotero item version for deletion", () => {
    expect(zoteroDeleteHeaders(17)).toEqual({ "If-Unmodified-Since-Version": "17" });
    expect(() => zoteroDeleteHeaders(-1)).toThrow("版本");
  });

  it("uses PDF.js for textual PDFs and renders textless pages in memory", async () => {
    const textual = await extractPdfText(makePdf("BT /F1 18 Tf 72 720 Td (Physics guided PDF.js test) Tj ET"));
    expect(textual.text).toContain("Physics guided PDF.js test");

    const rendered = await renderPdfPages(makePdf("0 0 0 rg 36 36 120 120 re f"));
    expect(rendered).toHaveLength(1);
    expect(Buffer.from(rendered[0] ?? "", "base64").subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
