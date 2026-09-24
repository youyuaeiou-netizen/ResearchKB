import { useCallback, useEffect, useRef, useState } from "react";
import { IoAlertCircleOutline, IoArrowBackOutline, IoChevronDownOutline, IoChevronForwardOutline, IoCodeSlashOutline, IoDocumentTextOutline, IoEyeOutline, IoFolderOutline, IoGitBranchOutline, IoRefreshOutline, IoSaveOutline } from "react-icons/io5";
import type { ObsidianNote, ObsidianVaultEntry, RepositoryEntry } from "../repositories";
import { ActionButton } from "./ActionButton";
import { ObsidianMarkdown } from "./ObsidianMarkdown";

type ObsidianWorkspaceProps = {
  vault: RepositoryEntry;
  onClose: () => void;
  onOpenGraph: (currentNotePath?: string) => void;
  initialNotePath?: string | null;
};

type DirectoryResponse = { entries: ObsidianVaultEntry[] };
type SaveResponse = { relativePath: string; version: string; modifiedAt: string };
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as (T & { message?: unknown }) | null;
  if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "本机知识库接口暂不可用。");
  if (!payload) throw new Error("本机知识库返回了无效响应。");
  return payload;
}

export function ObsidianWorkspace({ vault, onClose, onOpenGraph, initialNotePath }: ObsidianWorkspaceProps) {
  const [childrenByDirectory, setChildrenByDirectory] = useState<Record<string, ObsidianVaultEntry[]>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set([""]));
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set());
  const [directoryErrors, setDirectoryErrors] = useState<Record<string, string>>({});
  const [activeNote, setActiveNote] = useState<ObsidianNote | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const latestReadId = useRef(0);
  const loadedDirectories = useRef(new Set<string>());
  const dirty = Boolean(activeNote && draft !== activeNote.content);

  const loadDirectory = useCallback(async (directory: string, force = false) => {
    if (!force && loadedDirectories.current.has(directory)) return;
    setLoadingDirectories((current) => new Set(current).add(directory));
    setDirectoryErrors((current) => { const next = { ...current }; delete next[directory]; return next; });
    try {
      const result = await postJson<DirectoryResponse>("/api/repositories/obsidian/tree", { path: vault.localPath, directory });
      loadedDirectories.current.add(directory);
      setChildrenByDirectory((current) => ({ ...current, [directory]: result.entries }));
    } catch (error) {
      setDirectoryErrors((current) => ({ ...current, [directory]: error instanceof Error ? error.message : "无法读取目录。" }));
    } finally {
      setLoadingDirectories((current) => { const next = new Set(current); next.delete(directory); return next; });
    }
  }, [vault.localPath]);

  useEffect(() => { void loadDirectory(""); }, [loadDirectory]);

  const openNote = async (relativePath: string) => {
    if (activeNote && draft !== activeNote.content && !window.confirm("当前文档有未保存修改。切换文档会放弃这些修改，继续吗？")) return;
    const requestId = ++latestReadId.current;
    setLoadingNote(true);
    setNotice(null);
    try {
      const note = await postJson<ObsidianNote>("/api/repositories/obsidian/read", { path: vault.localPath, relativePath });
      if (requestId !== latestReadId.current) return;
      setActiveNote(note);
      setDraft(note.content);
      setEditing(false);
    } catch (error) {
      if (requestId === latestReadId.current) setNotice(error instanceof Error ? error.message : "无法读取 Markdown 文档。");
    } finally {
      if (requestId === latestReadId.current) setLoadingNote(false);
    }
  };
  const openNoteRef = useRef(openNote);
  openNoteRef.current = openNote;

  useEffect(() => {
    if (!initialNotePath) return;
    const directories: string[] = [];
    const segments = initialNotePath.split("/").filter(Boolean).slice(0, -1);
    let directory = "";
    for (const segment of segments) {
      directory = directory ? `${directory}/${segment}` : segment;
      directories.push(directory);
    }
    setExpandedDirectories((current) => new Set([...current, ...directories]));
    for (const path of directories) void loadDirectory(path);
    void openNoteRef.current(initialNotePath);
  }, [initialNotePath, vault.id, loadDirectory]);

  const toggleDirectory = (relativePath: string) => {
    const willExpand = !expandedDirectories.has(relativePath);
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
    if (willExpand) void loadDirectory(relativePath);
  };

  const refreshTree = () => {
    loadedDirectories.current.clear();
    setChildrenByDirectory({});
    setExpandedDirectories(new Set([""]));
    void loadDirectory("", true);
  };

  const saveNote = async () => {
    if (!activeNote || !dirty || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/repositories/obsidian/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: vault.localPath, relativePath: activeNote.relativePath, content: draft, version: activeNote.version }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as (SaveResponse & { status?: string; message?: unknown }) | null;
      if (response.status === 409) {
        setNotice(typeof payload?.message === "string" ? payload.message : "磁盘上的文档已变化。你的编辑内容仍保留，请先重新读取并核对。");
        return;
      }
      if (!response.ok || !payload || typeof payload.version !== "string") throw new Error(typeof payload?.message === "string" ? payload.message : "无法保存 Markdown 文档。");
      setActiveNote((current) => current ? { ...current, content: draft, version: payload.version, modifiedAt: payload.modifiedAt } : current);
      setNotice("文档已保存到 Obsidian Vault。");
      const separatorIndex = activeNote.relativePath.lastIndexOf("/");
      void loadDirectory(separatorIndex < 0 ? "" : activeNote.relativePath.slice(0, separatorIndex), true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法保存 Markdown 文档。");
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (dirty && !window.confirm("当前文档有未保存修改。返回会放弃这些修改，继续吗？")) return;
    onClose();
  };

  const flattenDirectory = (directory: string, depth: number): { entry: ObsidianVaultEntry; depth: number }[] =>
    (childrenByDirectory[directory] ?? []).flatMap((entry) => [
      { entry, depth },
      ...(entry.kind === "directory" && expandedDirectories.has(entry.relativePath) ? flattenDirectory(entry.relativePath, depth + 1) : []),
    ]);

  const treeEntries = flattenDirectory("", 0);
  const noteTitle = activeNote?.relativePath.split("/").at(-1) ?? "";

  return <section className="tab-modal-v2__obsidian-workspace" aria-label={`${vault.name} Obsidian 知识库`}>
    <header className="tab-modal-v2__obsidian-toolbar">
      <div className="tab-modal-v2__obsidian-toolbar-title">
        <ActionButton type="button" onClick={leave}><IoArrowBackOutline aria-hidden="true" />返回仓库</ActionButton>
        <div><span className="tab-modal-v2__micro-label">OBSIDIAN VAULT</span><h2>{vault.name}</h2><small title={vault.localPath}>{vault.localPath}</small></div>
      </div>
      <div className="tab-modal-v2__obsidian-actions">
        <ActionButton type="button" onClick={() => {
          if (dirty && !window.confirm("当前文档有未保存修改。打开关系图谱会暂时离开编辑器，未保存修改将丢失，继续吗？")) return;
          onOpenGraph(activeNote?.relativePath);
        }}><IoGitBranchOutline aria-hidden="true" />关系图谱</ActionButton>
        {activeNote && <>
          <span className={`tab-modal-v2__obsidian-save-state${dirty ? " is-dirty" : ""}`} role="status">{saving ? "正在保存…" : dirty ? "有未保存修改" : "已同步"}</span>
          <ActionButton type="button" aria-pressed={!editing} onClick={() => setEditing(false)} disabled={!editing}><IoEyeOutline aria-hidden="true" />阅读</ActionButton>
          <ActionButton type="button" aria-pressed={editing} onClick={() => setEditing(true)} disabled={editing}><IoCodeSlashOutline aria-hidden="true" />编辑</ActionButton>
          <ActionButton type="button" variant="primary" onClick={() => void saveNote()} disabled={!dirty || saving}><IoSaveOutline aria-hidden="true" />{saving ? "保存中" : "保存"}</ActionButton>
        </>}
      </div>
    </header>
    <div className="tab-modal-v2__obsidian-body">
      <aside className="tab-modal-v2__obsidian-tree" aria-label="知识库文档">
        <header><div><span className="tab-modal-v2__micro-label">FILE EXPLORER</span><b>文档</b></div><ActionButton type="button" aria-label="刷新知识库目录" title="刷新目录" onClick={refreshTree}><IoRefreshOutline aria-hidden="true" /></ActionButton></header>
        <nav className="tab-modal-v2__obsidian-tree-list" role="tree">
          {treeEntries.map(({ entry, depth }) => {
            const expanded = expandedDirectories.has(entry.relativePath);
            const selected = entry.kind === "note" && activeNote?.relativePath === entry.relativePath;
            return <button key={entry.relativePath} type="button" role="treeitem" aria-level={depth + 1} aria-expanded={entry.kind === "directory" ? expanded : undefined} aria-current={selected ? "page" : undefined} className={`tab-modal-v2__obsidian-tree-item${selected ? " is-selected" : ""}`} style={{ paddingLeft: `${9 + depth * 14}px` }} title={entry.relativePath} onClick={() => entry.kind === "directory" ? toggleDirectory(entry.relativePath) : void openNote(entry.relativePath)}>
              {entry.kind === "directory" ? expanded ? <IoChevronDownOutline aria-hidden="true" /> : <IoChevronForwardOutline aria-hidden="true" /> : <span className="tab-modal-v2__obsidian-tree-spacer" />}
              {entry.kind === "directory" ? <IoFolderOutline aria-hidden="true" /> : <IoDocumentTextOutline aria-hidden="true" />}
              <span>{entry.kind === "note" ? entry.name.replace(/\.md$/i, "") : entry.name}</span>
              {entry.kind === "directory" && loadingDirectories.has(entry.relativePath) && <i aria-label="正在读取" />}
            </button>;
          })}
          {loadingDirectories.has("") && <div className="tab-modal-v2__obsidian-tree-message" role="status">正在读取 Markdown 文档…</div>}
          {directoryErrors[""] && <div className="tab-modal-v2__obsidian-tree-error" role="alert"><IoAlertCircleOutline aria-hidden="true" />{directoryErrors[""]}</div>}
          {!loadingDirectories.has("") && !directoryErrors[""] && treeEntries.length === 0 && <div className="tab-modal-v2__obsidian-tree-message">这个 Vault 中还没有 Markdown 文档。</div>}
          {treeEntries.some(({ entry }) => entry.kind === "directory" && expandedDirectories.has(entry.relativePath) && directoryErrors[entry.relativePath]) && <div className="tab-modal-v2__obsidian-tree-error" role="alert">部分子目录暂不可用；可以折叠后重试。</div>}
        </nav>
        <small className="tab-modal-v2__obsidian-tree-footnote">仅显示 Markdown 文件；配置目录和符号链接不开放编辑。</small>
      </aside>
      <main className="tab-modal-v2__obsidian-document" aria-live="polite">
        {notice && <div className="tab-modal-v2__repository-notice tab-modal-v2__obsidian-notice" role="status">{notice}</div>}
        {loadingNote && <div className="tab-modal-v2__obsidian-document-message" role="status">正在打开文档…</div>}
        {!loadingNote && activeNote && <article className="tab-modal-v2__obsidian-document-inner">
          <header><div><span className="tab-modal-v2__micro-label">MARKDOWN NOTE</span><h1>{noteTitle}</h1><small title={activeNote.relativePath}>{activeNote.relativePath} · 修改于 {new Date(activeNote.modifiedAt).toLocaleString("zh-CN")}</small></div></header>
          {editing ? <textarea className="tab-modal-v2__obsidian-editor" aria-label="Markdown 文档内容" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveNote(); } }} spellCheck={false} /> : <div className="tab-modal-v2__obsidian-preview"><ObsidianMarkdown content={draft} vaultPath={vault.localPath} relativePath={activeNote.relativePath} /></div>}
        </article>}
        {!loadingNote && !activeNote && <div className="tab-modal-v2__obsidian-document-message"><IoDocumentTextOutline aria-hidden="true" /><b>选择一篇文档开始阅读</b><small>Markdown 会以阅读视图打开；需要修改时切换到编辑并保存。</small></div>}
      </main>
    </div>
  </section>;
}
