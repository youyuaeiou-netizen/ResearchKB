import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import { parseGitLatestCommit, parseGitStatusPorcelain, redactRemoteUrl, type GitStatusResponse, type ObsidianGraph, type ObsidianNote, type ObsidianVaultEntry, type RepositoryFolderEntry } from "./repositories";
import { writeTextAtomically } from "./atomic-file";

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 5_000;
const gitMaxBuffer = 1024 * 1024;
const maxObsidianNoteBytes = 2 * 1024 * 1024;
const maxObsidianAssetBytes = 12 * 1024 * 1024;
const maxObsidianGraphNotes = 1_200;
const maxObsidianGraphDirectories = 5_000;
const maxObsidianGraphReadBytes = 32 * 1024 * 1024;
const maxObsidianGraphEdges = 6_000;
const ignoredVaultDirectories = new Set([".obsidian", ".git", ".claudian", ".trash", "_system", "node_modules"]);
const ignoredRepositoryFolders = new Set([".git", "node_modules"]);
const obsidianImageMimeTypes = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".gif", "image/gif"],
  [".webp", "image/webp"], [".avif", "image/avif"], [".bmp", "image/bmp"], [".svg", "image/svg+xml"],
]);
const windowsPowerShell = join(process.env.SystemRoot?.trim() || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

type MiddlewareServer = {
  middlewares: {
    use: (path: string, handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void;
  };
};

type CommandError = Error & {
  code?: string | number;
  killed?: boolean;
  signal?: string;
  stderr?: string | Buffer;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function hasSameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  return typeof origin === "string" && typeof host === "string" && origin === `http://${host}`;
}

async function readJsonBody(request: IncomingMessage, maxBytes = 8 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function runGit(directory: string, args: string[]) {
  return execFileAsync("git", ["-C", directory, ...args], {
    windowsHide: true,
    timeout: gitTimeoutMs,
    maxBuffer: gitMaxBuffer,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
}

function commandText(error: CommandError) {
  return `${String(error.message ?? "")} ${String(error.stderr ?? "")}`.toLowerCase();
}

function isNoCommitError(error: CommandError) {
  const text = commandText(error);
  return error.code === 128 && /(does not have any commits|your current branch.*does not have any commits|ambiguous argument ['"]?head)/i.test(text);
}

function isNoOriginError(error: CommandError) {
  return error.code === 2 && /no such remote ['"]?origin|unknown section ['"]?remote\.origin/i.test(commandText(error));
}

function unavailableMessage(error: CommandError, fallback: string) {
  const text = commandText(error);
  if (error.code === "ENOENT" && !text.includes("not a git repository")) return "Git 不可用：未找到 git 可执行文件。";
  if (error.killed || error.code === "ETIMEDOUT" || /timed out|timeout/i.test(text)) return "Git 状态读取超时，暂不可用。";
  if (error.code === "ENOENT" || error.code === "ENOTDIR") return "本地路径不存在或不是目录。";
  if (/not a git repository|outside a repository/i.test(text)) return "该目录不是 Git 仓库。";
  return fallback;
}

async function resolveGitRoot(path: string) {
  if (!isAbsolute(path)) throw Object.assign(new Error("Repository path must be absolute."), { code: "EINVAL" });
  const metadata = await stat(path);
  if (!metadata.isDirectory()) throw Object.assign(new Error("Repository path is not a directory."), { code: "ENOTDIR" });
  const result = await runGit(path, ["rev-parse", "--show-toplevel"]);
  const root = String(result.stdout).trim();
  if (!root || !isAbsolute(root)) throw Object.assign(new Error("Git returned an invalid repository root."), { code: "EINVAL" });
  return root;
}

async function readGitStatus(path: string): Promise<GitStatusResponse> {
  const checkedAt = new Date().toISOString();
  try {
    const rootPath = await resolveGitRoot(path);
    const statusResult = await runGit(rootPath, ["status", "--porcelain=v1", "--branch", "--untracked-files=normal"]);
    const parsed = parseGitStatusPorcelain(String(statusResult.stdout));

    let latestCommit = null;
    try {
      const logResult = await runGit(rootPath, ["log", "-1", "--format=%h%x1f%cI%x1f%s"]);
      latestCommit = parseGitLatestCommit(String(logResult.stdout));
    } catch (error) {
      if (!isNoCommitError(error as CommandError)) throw error;
    }

    let originUrl: string | null = null;
    try {
      const remoteResult = await runGit(rootPath, ["remote", "get-url", "origin"]);
      originUrl = redactRemoteUrl(String(remoteResult.stdout));
    } catch (error) {
      if (!isNoOriginError(error as CommandError)) throw error;
    }

    return {
      status: "ready",
      snapshot: { ...parsed, rootPath, originUrl, latestCommit, checkedAt },
    };
  } catch (error) {
    return { status: "unavailable", message: unavailableMessage(error as CommandError, "Git 状态读取失败，暂不可用。"), checkedAt };
  }
}

async function sendWorkspace(workspaceRoot: string, response: ServerResponse) {
  try {
    const rootPath = await resolveGitRoot(workspaceRoot);
    sendJson(response, 200, { path: rootPath, name: basename(rootPath) });
  } catch (error) {
    sendJson(response, 503, { status: "unavailable", message: unavailableMessage(error as CommandError, "当前 ObsUI 工作区不是可用的 Git 仓库。") });
  }
}

let repositoryFolderPickerPromise: Promise<string | null> | null = null;

async function openRepositoryFolderPickerOnce() {
  if (process.platform !== "win32") throw new Error("当前平台不支持 Windows 文件夹选择器，请手工输入路径。");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$selected = $null",
    "$owner = $null",
    "$dialog = $null",
    "Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop",
    "Add-Type -AssemblyName System.Drawing -ErrorAction Stop",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "try {",
    "  $owner = New-Object System.Windows.Forms.Form",
    "  $owner.Text = 'ObsUI 文件夹选择'",
    "  $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen",
    "  $owner.Size = New-Object System.Drawing.Size(1, 1)",
    "  $owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None",
    "  $owner.ShowInTaskbar = $false",
    "  $owner.TopMost = $true",
    "  $owner.Opacity = 0.01",
    "  $owner.Show()",
    "  $owner.Activate()",
    "  $owner.BringToFront()",
    "  [System.Windows.Forms.Application]::DoEvents()",
    "  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "  $dialog.Description = '选择要添加到仓库的本地文件夹'",
    "  $dialog.ShowNewFolderButton = $false",
    "  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $selected = $dialog.SelectedPath }",
    "} finally {",
    "  if ($null -ne $dialog) { $dialog.Dispose() }",
    "  if ($null -ne $owner) { $owner.Close(); $owner.Dispose() }",
    "}",
    "if ($selected) { [Console]::Out.Write($selected) }",
  ].join("\n");
  const result = await execFileAsync(windowsPowerShell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-STA", "-Command", script], {
    windowsHide: true,
    timeout: 5 * 60_000,
    maxBuffer: 16 * 1024,
    encoding: "utf8",
  });
  return String(result.stdout).trim() || null;
}

async function openRepositoryFolderPicker() {
  if (repositoryFolderPickerPromise) return repositoryFolderPickerPromise;
  const current = openRepositoryFolderPickerOnce();
  repositoryFolderPickerPromise = current;
  try {
    return await current;
  } finally {
    if (repositoryFolderPickerPromise === current) repositoryFolderPickerPromise = null;
  }
}

async function sendRepositoryFolderSelection(response: ServerResponse) {
  try {
    const path = await openRepositoryFolderPicker();
    sendJson(response, 200, { status: path ? "selected" : "cancelled", path });
  } catch {
    sendJson(response, 503, { status: "unavailable", message: process.platform === "win32" ? "系统文件夹选择器启动失败，请手工输入路径。" : "当前平台不支持系统文件夹选择器，请手工输入路径。" });
  }
}

async function sendGitStatus(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request));
    const path = typeof payload?.path === "string" ? payload.path.trim() : "";
    if (!path || !isAbsolute(path)) return sendJson(response, 400, { status: "unavailable", message: "仓库路径必须是绝对目录路径。" });
    const result = await readGitStatus(path);
    sendJson(response, result.status === "ready" ? 200 : 503, result);
  } catch (error) {
    sendJson(response, 400, { status: "unavailable", message: error instanceof SyntaxError ? "请求体不是有效 JSON。" : "仓库状态请求无效。" });
  }
}

function isPathInside(path: string, root: string) {
  const relativePath = relative(root, path);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

async function resolveVaultRoot(value: unknown) {
  if (typeof value !== "string" || !value.trim() || !isAbsolute(value)) throw new Error("Obsidian Vault 必须是有效的绝对路径。");
  const requestedPath = resolve(value);
  const metadata = await lstat(requestedPath);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("Obsidian Vault 必须是普通文件夹，不能是符号链接。");
  if (ignoredVaultDirectories.has(basename(requestedPath).toLocaleLowerCase())) throw new Error("Obsidian 配置和系统目录不能作为 Vault 打开。");
  return realpath(requestedPath);
}

function safeVaultSegments(value: unknown, allowEmpty = false, directoryPath = false) {
  if (typeof value !== "string" || value.includes("\0") || isAbsolute(value)) throw new Error("文档路径无效。");
  const segments = value.split(/[\\/]+/).filter(Boolean);
  if ((!allowEmpty && !segments.length) || segments.length > 64 || segments.some((segment) => segment.length > 240 || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error("文档路径无效或超出 Vault 范围。");
  }
  const directories = directoryPath ? segments : segments.slice(0, -1);
  if (directories.some((segment) => ignoredVaultDirectories.has(segment.toLocaleLowerCase()))) {
    throw new Error("Obsidian 配置和系统目录不开放浏览或编辑。");
  }
  return segments;
}

async function assertRegularVaultPath(root: string, segments: string[], finalKind: "directory" | "note") {
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error("Vault 中的符号链接不开放浏览或编辑。");
    const isFinal = index === segments.length - 1;
    if (!isFinal && !metadata.isDirectory()) throw new Error("Vault 路径中包含非文件夹项目。");
    if (isFinal && (finalKind === "directory" ? !metadata.isDirectory() : !metadata.isFile())) throw new Error("请求的 Vault 项目类型不正确。");
  }
  return segments.length ? current : root;
}

async function listVaultDirectory(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request));
    const root = await resolveVaultRoot(payload?.path);
    const segments = safeVaultSegments(payload?.directory ?? "", true, true);
    const directoryPath = segments.length ? await assertRegularVaultPath(root, segments, "directory") : root;
    const directoryRealPath = await realpath(directoryPath);
    if (!isPathInside(directoryRealPath, root)) throw new Error("Vault 路径超出允许范围。");
    const items = await readdir(directoryPath, { withFileTypes: true });
    const entries: ObsidianVaultEntry[] = [];
    for (const item of items) {
      if (item.isSymbolicLink()) continue;
      const lowerName = item.name.toLocaleLowerCase();
      if (item.isDirectory() && ignoredVaultDirectories.has(lowerName)) continue;
      if (!item.isDirectory() && (!item.isFile() || extname(item.name).toLocaleLowerCase() !== ".md")) continue;
      const itemPath = join(directoryPath, item.name);
      const metadata = await stat(itemPath);
      entries.push({
        kind: item.isDirectory() ? "directory" : "note",
        name: item.name,
        relativePath: relative(root, itemPath).split(sep).join("/"),
        size: metadata.size,
        modifiedAt: metadata.mtime.toISOString(),
      });
    }
    entries.sort((left, right) => left.kind === right.kind ? left.name.localeCompare(right.name, "zh-CN") : left.kind === "directory" ? -1 : 1);
    sendJson(response, 200, { vaultName: basename(root), entries });
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error && error.message ? error.message : "无法读取 Obsidian Vault 目录。" });
  }
}

async function listRepositoryFolders(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request));
    const path = typeof payload?.path === "string" ? payload.path.trim() : "";
    if (!path || !isAbsolute(path)) throw new Error("仓库路径必须是有效的绝对路径。");
    const root = await realpath(resolve(path));
    if (!(await stat(root)).isDirectory()) throw new Error("仓库路径不是文件夹。");
    const ignoredFolders = payload?.kind === "obsidian" ? ignoredVaultDirectories : ignoredRepositoryFolders;
    const items = await readdir(root, { withFileTypes: true });
    const folders: RepositoryFolderEntry[] = items
      .filter((item) => item.isDirectory() && !ignoredFolders.has(item.name.toLocaleLowerCase()))
      .map((item) => ({ name: item.name, relativePath: item.name }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    sendJson(response, 200, { folders });
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error && error.message ? error.message : "无法读取仓库下级文件夹。" });
  }
}

function normalizeGraphTarget(value: string, baseSegments: string[]) {
  let decoded = value.trim();
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep literal percent characters in note names. */ }
  if (!decoded || /^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith("//")) return null;
  const pathOnly = decoded.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  if (!pathOnly) return null;
  const segments = pathOnly.startsWith("/") ? [] : [...baseSegments];
  for (const segment of pathOnly.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else {
      if (segment.includes(":") || segment.includes("\0")) return null;
      segments.push(segment);
    }
  }
  if (!segments.length) return null;
  if (extname(segments.at(-1) ?? "").toLocaleLowerCase() !== ".md") segments[segments.length - 1] += ".md";
  return segments.join("/").toLocaleLowerCase();
}

function extractGraphTargets(content: string, sourcePath: string) {
  const targets: { value: string; relativeToSource: boolean }[] = [];
  const sourceDirectory = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";
  const wikiPattern = /!?\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wikiPattern.exec(content)) !== null) {
    const value = match[1].split("|")[0].split("#")[0].trim();
    if (value) targets.push({ value, relativeToSource: false });
  }
  const markdownPattern = /\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g;
  while ((match = markdownPattern.exec(content)) !== null) {
    const value = (match[1] ?? match[2] ?? "").trim();
    const targetExtension = extname(value.split(/[?#]/, 1)[0]).toLocaleLowerCase();
    if (value && (!targetExtension || targetExtension === ".md")) {
      targets.push({ value, relativeToSource: !value.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(value) });
    }
  }
  return targets.map((target) => ({ ...target, sourceDirectory }));
}

async function buildVaultGraph(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request));
    const root = await resolveVaultRoot(payload?.path);
    const relativePaths: string[] = [];
    const pendingDirectories: string[][] = [[]];
    let visitedDirectories = 0;
    let truncated = false;

    while (pendingDirectories.length && relativePaths.length < maxObsidianGraphNotes) {
      const directorySegments = pendingDirectories.shift()!;
      visitedDirectories += 1;
      if (visitedDirectories > maxObsidianGraphDirectories) { truncated = true; break; }
      const directoryPath = directorySegments.length ? await assertRegularVaultPath(root, directorySegments, "directory") : root;
      const entries = (await readdir(directoryPath, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
      for (const item of entries) {
        if (item.isSymbolicLink()) continue;
        const lowerName = item.name.toLocaleLowerCase();
        if (item.isDirectory()) {
          if (!ignoredVaultDirectories.has(lowerName)) {
            if (directorySegments.length >= 63) truncated = true;
            else if (pendingDirectories.length + visitedDirectories < maxObsidianGraphDirectories) pendingDirectories.push([...directorySegments, item.name]);
            else truncated = true;
          }
          continue;
        }
        if (!item.isFile() || extname(item.name).toLocaleLowerCase() !== ".md") continue;
        if (relativePaths.length >= maxObsidianGraphNotes) { truncated = true; break; }
        relativePaths.push([...directorySegments, item.name].join("/"));
      }
      if (truncated) break;
    }
    if (pendingDirectories.length) truncated = true;

    const nodes: ObsidianGraph["nodes"] = relativePaths.map((relativePath) => {
      const name = relativePath.slice(relativePath.lastIndexOf("/") + 1).replace(/\.md$/i, "");
      return { id: relativePath, label: name, relativePath };
    });
    const exactPath = new Map(nodes.map((node) => [node.relativePath.toLocaleLowerCase(), node.id] as const));
    const basenameIndex = new Map<string, string[]>();
    for (const node of nodes) {
      const key = node.label.toLocaleLowerCase();
      basenameIndex.set(key, [...(basenameIndex.get(key) ?? []), node.id]);
    }
    const edges: ObsidianGraph["edges"] = [];
    const edgeKeys = new Set<string>();
    let bytesRead = 0;
    for (const node of nodes) {
      if (bytesRead >= maxObsidianGraphReadBytes) { truncated = true; break; }
      const segments = safeVaultSegments(node.relativePath);
      const notePath = await assertRegularVaultPath(root, segments, "note");
      const metadata = await stat(notePath);
      if (metadata.size > maxObsidianNoteBytes || bytesRead + metadata.size > maxObsidianGraphReadBytes) {
        truncated = true;
        continue;
      }
      const content = (await readFile(notePath)).toString("utf8");
      bytesRead += metadata.size;
      for (const target of extractGraphTargets(content, node.relativePath)) {
        const pathBase = target.relativeToSource && target.sourceDirectory
          ? target.sourceDirectory.split("/")
          : [];
        const resolvedTarget = normalizeGraphTarget(target.value, pathBase);
        let destination = resolvedTarget ? exactPath.get(resolvedTarget) : undefined;
        if (!destination && !target.value.includes("/") && !target.value.startsWith("/") && target.sourceDirectory) {
          const localTarget = normalizeGraphTarget(target.value, target.sourceDirectory.split("/"));
          if (localTarget) destination = exactPath.get(localTarget);
        }
        if (!destination && !target.value.includes("/") && !target.value.startsWith("/")) {
          const basenameMatches = basenameIndex.get(target.value.replace(/\.md$/i, "").toLocaleLowerCase()) ?? [];
          if (basenameMatches.length === 1) destination = basenameMatches[0];
        }
        if (!destination) continue;
        if (destination === node.id) continue;
        const edgeKey = [node.id, destination].sort((left, right) => left.localeCompare(right, "en")).join("\0");
        if (edgeKeys.has(edgeKey)) continue;
        if (edges.length >= maxObsidianGraphEdges) { truncated = true; break; }
        edgeKeys.add(edgeKey);
        edges.push({ source: node.id, target: destination });
      }
      if (edges.length >= maxObsidianGraphEdges) break;
    }
    sendJson(response, 200, { nodes, edges, truncated } satisfies ObsidianGraph);
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error && error.message ? error.message : "无法读取 Obsidian Vault 关系图谱。" });
  }
}

function normalizeVaultFileTarget(value: string, baseSegments: string[]) {
  let decoded = value.trim();
  try { decoded = decodeURIComponent(decoded); } catch { /* Keep literal percent characters in file names. */ }
  if (!decoded || /^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith("//")) return null;
  const pathOnly = decoded.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  if (!pathOnly) return null;
  const segments = pathOnly.startsWith("/") ? [] : [...baseSegments];
  for (const segment of pathOnly.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return null;
      segments.pop();
    } else {
      if (segment.includes(":") || segment.includes("\0")) return null;
      segments.push(segment);
    }
  }
  if (!segments.length || segments.slice(0, -1).some((segment) => ignoredVaultDirectories.has(segment.toLocaleLowerCase()))) return null;
  return segments;
}

async function findUniqueVaultImage(root: string, imageName: string) {
  const requestedExtension = extname(imageName).toLocaleLowerCase();
  const requestedStem = requestedExtension ? imageName.slice(0, -requestedExtension.length).toLocaleLowerCase() : imageName.toLocaleLowerCase();
  const candidates: string[][] = [];
  const pendingDirectories: string[][] = [[]];
  let visited = 0;
  while (pendingDirectories.length && visited < maxObsidianGraphDirectories) {
    const directorySegments = pendingDirectories.shift()!;
    visited += 1;
    const directoryPath = directorySegments.length ? await assertRegularVaultPath(root, directorySegments, "directory") : root;
    const items = await readdir(directoryPath, { withFileTypes: true });
    for (const item of items) {
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (!ignoredVaultDirectories.has(item.name.toLocaleLowerCase()) && directorySegments.length < 63) pendingDirectories.push([...directorySegments, item.name]);
        continue;
      }
      if (!item.isFile()) continue;
      const extension = extname(item.name).toLocaleLowerCase();
      if (!obsidianImageMimeTypes.has(extension)) continue;
      const stem = item.name.slice(0, -extension.length).toLocaleLowerCase();
      if (requestedExtension ? item.name.toLocaleLowerCase() === imageName.toLocaleLowerCase() : stem === requestedStem) {
        candidates.push([...directorySegments, item.name]);
        if (candidates.length > 1) return null;
      }
    }
  }
  return candidates[0] ?? null;
}

async function readVaultImage(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request));
    const root = await resolveVaultRoot(payload?.path);
    if (typeof payload?.target !== "string" || payload.target.length > 2_000) throw new Error("图片路径无效。");
    const noteSegments = safeVaultSegments(payload?.relativePath);
    if (extname(noteSegments.at(-1) ?? "").toLocaleLowerCase() !== ".md") throw new Error("图片所属文档路径无效。");
    const noteParent = noteSegments.slice(0, -1);
    const kind = payload?.kind === "wiki" ? "wiki" : "markdown";
    const bases = kind === "wiki" && !payload.target.startsWith("/") ? [noteParent, []] : [noteParent];
    const candidateSegments: string[][] = [];
    for (const base of bases) {
      const segments = normalizeVaultFileTarget(payload.target, base);
      if (!segments) continue;
      const extension = extname(segments.at(-1) ?? "").toLocaleLowerCase();
      if (extension && !obsidianImageMimeTypes.has(extension)) continue;
      const possibilities = extension ? [segments] : [...obsidianImageMimeTypes.keys()].map((imageExtension) => [...segments.slice(0, -1), `${segments.at(-1)}${imageExtension}`]);
      for (const possibility of possibilities) {
        const key = possibility.join("/").toLocaleLowerCase();
        if (!candidateSegments.some((item) => item.join("/").toLocaleLowerCase() === key)) candidateSegments.push(possibility);
      }
    }

    let imagePath: string | null = null;
    for (const segments of candidateSegments) {
      try {
        imagePath = await assertRegularVaultPath(root, safeVaultSegments(segments.join("/")), "note");
        break;
      } catch { /* Try another Obsidian resolution candidate. */ }
    }
    if (!imagePath && !payload.target.includes("/") && !payload.target.includes("\\")) {
      const imageSegments = await findUniqueVaultImage(root, payload.target);
      if (imageSegments) imagePath = await assertRegularVaultPath(root, imageSegments, "note");
    }
    if (!imagePath) return sendJson(response, 404, { message: "没有在 Vault 中找到这张图片，或存在重名文件。" });
    const resolvedPath = await realpath(imagePath);
    if (!isPathInside(resolvedPath, root)) throw new Error("图片路径超出 Vault 范围。");
    const extension = extname(imagePath).toLocaleLowerCase();
    const mimeType = obsidianImageMimeTypes.get(extension);
    if (!mimeType) throw new Error("目前只支持显示常见图片文件。");
    const metadata = await stat(imagePath);
    if (metadata.size > maxObsidianAssetBytes) throw new Error("图片超过 12 MB，暂不支持内嵌显示。");
    const content = await readFile(imagePath);
    sendJson(response, 200, { relativePath: relative(root, imagePath).split(sep).join("/"), dataUrl: `data:${mimeType};base64,${content.toString("base64")}` });
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error && error.message ? error.message : "无法读取 Vault 图片。" });
  }
}

async function readVaultNote(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request));
    const root = await resolveVaultRoot(payload?.path);
    const segments = safeVaultSegments(payload?.relativePath);
    if (extname(segments.at(-1) ?? "").toLocaleLowerCase() !== ".md") throw new Error("目前只支持 Markdown 文档。");
    const targetPath = await assertRegularVaultPath(root, segments, "note");
    const resolvedPath = await realpath(targetPath);
    if (!isPathInside(resolvedPath, root)) throw new Error("文档路径超出 Vault 范围。");
    const metadata = await stat(targetPath);
    if (metadata.size > maxObsidianNoteBytes) throw new Error("文档超过 2 MB，暂不支持在工作台打开。");
    const content = await readFile(targetPath);
    const note: ObsidianNote = {
      relativePath: segments.join("/"),
      content: content.toString("utf8"),
      version: createHash("sha256").update(content).digest("hex"),
      modifiedAt: metadata.mtime.toISOString(),
    };
    sendJson(response, 200, note);
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error && error.message ? error.message : "无法读取 Markdown 文档。" });
  }
}

async function writeVaultNote(request: IncomingMessage, response: ServerResponse) {
  try {
    const payload = asRecord(await readJsonBody(request, maxObsidianNoteBytes + 16 * 1024));
    const root = await resolveVaultRoot(payload?.path);
    const segments = safeVaultSegments(payload?.relativePath);
    if (extname(segments.at(-1) ?? "").toLocaleLowerCase() !== ".md") throw new Error("目前只支持 Markdown 文档。");
    if (typeof payload?.content !== "string" || Buffer.byteLength(payload.content, "utf8") > maxObsidianNoteBytes) throw new Error("文档内容超过 2 MB，无法保存。");
    if (typeof payload?.version !== "string" || !/^[a-f\d]{64}$/i.test(payload.version)) throw new Error("缺少文档版本信息，请重新打开文档后再保存。");
    const targetPath = await assertRegularVaultPath(root, segments, "note");
    const resolvedPath = await realpath(targetPath);
    if (!isPathInside(resolvedPath, root)) throw new Error("文档路径超出 Vault 范围。");
    const currentContent = await readFile(targetPath);
    if (currentContent.length > maxObsidianNoteBytes) throw new Error("当前文档超过 2 MB，已拒绝覆盖。");
    const currentVersion = createHash("sha256").update(currentContent).digest("hex");
    if (currentVersion !== payload.version) {
      return sendJson(response, 409, { status: "conflict", message: "磁盘上的文档已发生变化。你的编辑内容仍保留，请先重新读取并核对。" });
    }
    await writeTextAtomically(targetPath, payload.content);
    const savedContent = Buffer.from(payload.content, "utf8");
    const metadata = await stat(targetPath);
    sendJson(response, 200, {
      relativePath: segments.join("/"),
      version: createHash("sha256").update(savedContent).digest("hex"),
      modifiedAt: metadata.mtime.toISOString(),
    });
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error && error.message ? error.message : "无法保存 Markdown 文档。" });
  }
}

export function createRepositoryPlugin(workspaceRoot: string): Plugin {
  const registerRoutes = (server: MiddlewareServer) => {
    server.middlewares.use("/api/repositories/workspace", (request, response, next) => {
      if (request.method !== "GET") return next();
      if (request.headers.origin && !hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void sendWorkspace(workspaceRoot, response);
    });
    server.middlewares.use("/api/repositories/select-folder", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void sendRepositoryFolderSelection(response);
    });
    server.middlewares.use("/api/repositories/git-status", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { status: "unavailable", message: "本机来源校验失败。" });
      void sendGitStatus(request, response);
    });
    server.middlewares.use("/api/repositories/folders", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void listRepositoryFolders(request, response);
    });
    server.middlewares.use("/api/repositories/obsidian/tree", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void listVaultDirectory(request, response);
    });
    server.middlewares.use("/api/repositories/obsidian/graph", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void buildVaultGraph(request, response);
    });
    server.middlewares.use("/api/repositories/obsidian/asset", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void readVaultImage(request, response);
    });
    server.middlewares.use("/api/repositories/obsidian/read", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void readVaultNote(request, response);
    });
    server.middlewares.use("/api/repositories/obsidian/write", (request, response, next) => {
      if (request.method !== "POST") return next();
      if (!hasSameOrigin(request)) return sendJson(response, 403, { message: "本机来源校验失败。" });
      void writeVaultNote(request, response);
    });
  };

  return {
    name: "obsui-repositories",
    configureServer: registerRoutes,
    configurePreviewServer: registerRoutes,
  };
}
