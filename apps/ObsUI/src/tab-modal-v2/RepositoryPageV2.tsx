import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { IoAddOutline, IoAlertCircleOutline, IoBookOutline, IoCheckmarkCircleOutline, IoCubeOutline, IoDocumentTextOutline, IoFolderOpenOutline, IoGitBranchOutline, IoRefreshOutline, IoSearchOutline, IoTrashOutline } from "react-icons/io5";
import { redactRemoteUrl, type GitStatusResponse, type GitStatusSnapshot, type RepositoryEntry, type RepositoryKind } from "../repositories";
import { ActionButton } from "./ActionButton";
import { ObsidianWorkspace } from "./ObsidianWorkspace";
import { RepositoryGraph } from "./RepositoryGraph";
import type { V2BusinessContext } from "./model";

type RepositoryFilter = "all" | RepositoryKind;
type RepositoryForm = { kind: RepositoryKind; name: string; localPath: string; remoteUrl: string; note: string };

const filters: { id: RepositoryFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "obsidian", label: "Obsidian" },
  { id: "git", label: "Git" },
  { id: "material", label: "素材" },
];

const kindLabels: Record<RepositoryKind, string> = { git: "Git", obsidian: "Obsidian", material: "素材" };
const gitStateLabels: Record<GitStatusSnapshot["state"], string> = {
  clean: "干净",
  modified: "有修改",
  untracked: "有未跟踪",
  conflicted: "有冲突",
};

function pathKey(value: string) {
  return value.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

function folderNameFromPath(value: string) {
  return value.trim().replace(/[\\/]+$/, "").split(/[\\/]+/).filter(Boolean).at(-1) ?? value.trim();
}

function unavailable(message: string): GitStatusResponse {
  return { status: "unavailable", message, checkedAt: new Date().toISOString() };
}

async function requestGitStatus(repository: RepositoryEntry): Promise<GitStatusResponse> {
  try {
    const response = await fetch("/api/repositories/git-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: repository.localPath }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as Partial<GitStatusResponse> | null;
    if (response.ok && payload?.status === "ready" && payload.snapshot) return payload as GitStatusResponse;
    return unavailable(payload?.status === "unavailable" && typeof payload.message === "string" ? payload.message : "Git 状态暂不可用。");
  } catch {
    return unavailable("无法连接本机 Git 状态接口。");
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function repositoryIcon(kind: RepositoryKind) {
  if (kind === "git") return <IoGitBranchOutline aria-hidden="true" />;
  if (kind === "obsidian") return <IoBookOutline aria-hidden="true" />;
  return <IoCubeOutline aria-hidden="true" />;
}

function GitStatus({ status, loading }: { status: GitStatusResponse | undefined; loading: boolean }) {
  if (loading || !status) return <div className="tab-modal-v2__repository-status is-loading" role="status">正在读取 Git 状态…</div>;
  if (status.status === "unavailable") return <div className="tab-modal-v2__repository-status is-unavailable" role="status"><IoAlertCircleOutline aria-hidden="true" /><span>暂不可用：{status.message}</span></div>;
  const snapshot = status.snapshot;
  return <div className="tab-modal-v2__repository-git-status">
    <div className={`tab-modal-v2__repository-status is-${snapshot.state}`}><IoCheckmarkCircleOutline aria-hidden="true" /><span>{snapshot.detached ? "detached HEAD" : snapshot.branch ?? "未识别分支"} · {gitStateLabels[snapshot.state]}</span></div>
    <div className="tab-modal-v2__repository-counts" aria-label="Git 变更统计">
      <span>暂存 <b>{snapshot.staged}</b></span>
      <span>未暂存 <b>{snapshot.unstaged}</b></span>
      <span>未跟踪 <b>{snapshot.untracked}</b></span>
      <span>冲突 <b>{snapshot.conflicted}</b></span>
    </div>
    <div className="tab-modal-v2__repository-commit"><span>最近提交</span>{snapshot.latestCommit ? <b title={snapshot.latestCommit.subject}>{snapshot.latestCommit.shortHash} · {snapshot.latestCommit.subject} · {formatDate(snapshot.latestCommit.committedAt)}</b> : <b>暂无提交</b>}</div>
    <div className="tab-modal-v2__repository-remote"><span>origin</span><b>{snapshot.originUrl ?? "未配置远程"}</b></div>
  </div>;
}

export function RepositoryPageV2({ context }: { context: V2BusinessContext }) {
  const repositories = context.state.repositories ?? [];
  const [filter, setFilter] = useState<RepositoryFilter>("all");
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Record<string, GitStatusResponse>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeObsidianVaultId, setActiveObsidianVaultId] = useState<string | null>(null);
  const [initialObsidianNotePath, setInitialObsidianNotePath] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);
  const [form, setForm] = useState<RepositoryForm>({ kind: "git", name: "", localPath: "", remoteUrl: "", note: "" });

  const fetchStatuses = useCallback(async (entries: RepositoryEntry[] = repositories) => {
    const gitEntries = entries.filter((entry) => entry.kind === "git");
    if (!gitEntries.length) return;
    setRefreshing(true);
    setPendingIds(new Set(gitEntries.map((entry) => entry.id)));
    const results = await Promise.all(gitEntries.map(async (entry) => [entry.id, await requestGitStatus(entry)] as const));
    setStatuses((current) => ({ ...current, ...Object.fromEntries(results) }));
    setPendingIds(new Set());
    setRefreshing(false);
  }, [repositories]);

  useEffect(() => {
    if (context.ready) void fetchStatuses();
  }, [context.ready, fetchStatuses]);

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return repositories.filter((repository) => {
      if (filter !== "all" && repository.kind !== filter) return false;
      if (!normalizedQuery) return true;
      return [repository.name, repository.localPath, repository.remoteUrl, repository.note, kindLabels[repository.kind]].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, repositories]);

  const openAddForm = () => {
    setNotice(null);
    setForm({ kind: "git", name: "", localPath: "", remoteUrl: "", note: "" });
    setFormOpen(true);
  };

  const addCurrentWorkspace = async () => {
    setNotice(null);
    try {
      const response = await fetch("/api/repositories/workspace", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { path?: unknown; name?: unknown; message?: unknown } | null;
      if (!response.ok || typeof payload?.path !== "string") throw new Error(typeof payload?.message === "string" ? payload.message : "当前工作区暂不可用。");
      const existing = repositories.find((repository) => pathKey(repository.localPath) === pathKey(payload.path as string));
      if (existing) {
        setSelectedId(existing.id);
        if (existing.kind === "git") void refreshOne(existing);
        setNotice("当前工作区已经登记。已选中对应条目。");
        return;
      }
      if (!context.actions.addRepository) throw new Error("当前页面未连接本地仓库登记存储。");
      context.actions.addRepository({ kind: "git", name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "当前工作区", localPath: payload.path as string, remoteUrl: "", note: "ObsUI 当前工作区" });
      setNotice("已登记当前工作区，正在读取 Git 状态。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "当前工作区暂不可用。");
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    const localPath = form.localPath.trim();
    if (!name || !localPath) {
      setNotice("请填写名称和本地路径。");
      return;
    }
    if (repositories.some((repository) => pathKey(repository.localPath) === pathKey(localPath))) {
      setNotice("这个本地路径已经登记。");
      return;
    }
    if (!context.actions.addRepository) {
      setNotice("当前页面未连接本地仓库登记存储。");
      return;
    }
    context.actions.addRepository({ ...form, name, localPath, remoteUrl: redactRemoteUrl(form.remoteUrl) ?? "", note: form.note.trim() });
    setFormOpen(false);
    setNotice("仓库登记已保存；Git 状态只在运行时读取。");
  };

  const selectRepositoryFolder = async () => {
    setNotice(null);
    setFolderPickerBusy(true);
    try {
      const response = await fetch("/api/repositories/select-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { status?: unknown; path?: unknown; message?: unknown } | null;
      if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "无法打开系统文件夹选择器。");
      if (payload?.status === "cancelled") {
        setNotice("已取消选择，登记内容未更改。");
        return;
      }
      if (payload?.status !== "selected" || typeof payload.path !== "string" || !payload.path.trim()) throw new Error("文件夹选择器没有返回有效路径。");
      const selectedPath = payload.path.trim();
      const folderName = folderNameFromPath(selectedPath);
      setForm((current) => ({ ...current, localPath: selectedPath, name: current.name.trim() ? current.name : folderName }));
      setNotice("已选择文件夹；点击“保存登记”后才会添加。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法打开系统文件夹选择器。");
    } finally {
      setFolderPickerBusy(false);
    }
  };

  const refreshOne = async (repository: RepositoryEntry) => {
    if (repository.kind !== "git") return;
    setPendingIds((current) => new Set(current).add(repository.id));
    const result = await requestGitStatus(repository);
    setStatuses((current) => ({ ...current, [repository.id]: result }));
    setPendingIds((current) => { const next = new Set(current); next.delete(repository.id); return next; });
  };

  const openFolder = async (repository: RepositoryEntry) => {
    try {
      const response = await fetch("/api/folders/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderPath: repository.localPath }) });
      const payload = await response.json().catch(() => null) as { message?: unknown } | null;
      if (!response.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "无法打开本地目录。");
      setNotice("已请求打开本地目录。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法打开本地目录。");
    }
  };

  const remove = (repository: RepositoryEntry) => {
    if (!window.confirm(`只移除“${repository.name}”的 ObsUI 登记记录？不会删除目录或文件。`)) return;
    context.actions.removeRepository?.(repository.id);
    setStatuses((current) => { const next = { ...current }; delete next[repository.id]; return next; });
    setSelectedId((current) => current === repository.id ? null : current);
    setNotice("已移除登记记录；真实目录和文件未改动。");
  };

  const activeObsidianVault = repositories.find((repository) => repository.id === activeObsidianVaultId && repository.kind === "obsidian");
  if (graphOpen) return <div className="tab-modal-v2__repository-page is-repository-graph"><RepositoryGraph
    context={context}
    onClose={() => setGraphOpen(false)}
    onOpenRepository={(repository) => { setGraphOpen(false); void openFolder(repository); }}
    onOpenVault={(vaultId) => { setGraphOpen(false); setInitialObsidianNotePath(null); setActiveObsidianVaultId(vaultId); }}
    onOpenNote={(vaultId, relativePath) => {
      setGraphOpen(false);
      setInitialObsidianNotePath(relativePath);
      setActiveObsidianVaultId(vaultId);
    }}
  /></div>;
  if (activeObsidianVault) return <div className="tab-modal-v2__repository-page is-obsidian"><ObsidianWorkspace
    vault={activeObsidianVault}
    initialNotePath={initialObsidianNotePath}
    onOpenGraph={(currentNotePath) => { if (currentNotePath) setInitialObsidianNotePath(currentNotePath); setGraphOpen(true); }}
    onClose={() => { setActiveObsidianVaultId(null); setInitialObsidianNotePath(null); }}
  /></div>;

  return <div className="tab-modal-v2__repository-page">
    <aside className="tab-modal-v2__repository-sidebar" aria-label="仓库分类">
      <div className="tab-modal-v2__repository-sidebar-heading"><span className="tab-modal-v2__micro-label">LOCAL REGISTRY</span><h1>仓库</h1><small>只保存入口，不触碰原始文件</small></div>
      <nav className="tab-modal-v2__repository-filters">{filters.map((item) => <button key={item.id} type="button" className={filter === item.id ? "is-selected" : ""} aria-pressed={filter === item.id} data-repository-filter={item.id} onClick={() => setFilter(item.id)}><span>{item.label}</span><b>{item.id === "all" ? repositories.length : repositories.filter((repository) => repository.kind === item.id).length}</b></button>)}</nav>
      <div className="tab-modal-v2__repository-sidebar-note"><IoAlertCircleOutline aria-hidden="true" /><span>Obsidian Vault 支持浏览与编辑 Markdown 文档；配置目录保持只读。</span></div>
    </aside>
    <section className="tab-modal-v2__repository-main">
      <header className="tab-modal-v2__repository-toolbar">
        <div><span className="tab-modal-v2__micro-label">REPOSITORY INDEX</span><h2>本地仓库登记</h2><small>Git 状态按进入、选择和手动刷新读取，不缓存过期快照。</small></div>
        <div className="tab-modal-v2__repository-actions"><label className="tab-modal-v2__repository-search"><IoSearchOutline aria-hidden="true" /><input aria-label="搜索仓库" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、路径或备注" /></label><ActionButton type="button" onClick={() => setGraphOpen(true)}><IoGitBranchOutline aria-hidden="true" />关系图谱</ActionButton><ActionButton type="button" onClick={openAddForm}><IoAddOutline aria-hidden="true" />添加仓库</ActionButton><ActionButton type="button" variant="primary" onClick={() => void addCurrentWorkspace()}>添加当前工作区</ActionButton><ActionButton type="button" aria-label="刷新仓库状态" title="刷新仓库状态" onClick={() => void fetchStatuses()} disabled={refreshing}><IoRefreshOutline aria-hidden="true" />{refreshing ? "读取中" : "刷新"}</ActionButton></div>
      </header>
      {context.storageError && <div className="tab-modal-v2__repository-notice is-warning" role="alert">{context.storageError}</div>}
      {notice && <div className="tab-modal-v2__repository-notice" role="status">{notice}</div>}
      {formOpen && <form className="tab-modal-v2__repository-form" onSubmit={submit} aria-label="添加仓库">
        <div><span className="tab-modal-v2__micro-label">NEW ENTRY</span><b>登记一个本地入口</b><small>仅保存名称、路径和备注，不会扫描或修改目录。</small></div>
        <label>名称<input aria-label="仓库名称" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如：ResearchKB" /></label>
        <label>类型<select aria-label="仓库类型" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as RepositoryKind }))}><option value="git">Git</option><option value="obsidian">Obsidian</option><option value="material">素材</option></select></label>
        <div className="tab-modal-v2__repository-path-picker is-wide"><label>本地路径<input aria-label="本地路径" value={form.localPath} onChange={(event) => setForm((current) => ({ ...current, localPath: event.target.value }))} placeholder="C:\\WorkSpace\\ResearchKB" /></label><ActionButton type="button" className="is-folder-picker" onClick={() => void selectRepositoryFolder()} disabled={folderPickerBusy}><IoFolderOpenOutline aria-hidden="true" />{folderPickerBusy ? "正在选择…" : "选择文件夹"}</ActionButton></div>
        <label>远程地址<input aria-label="远程地址" value={form.remoteUrl} onChange={(event) => setForm((current) => ({ ...current, remoteUrl: event.target.value }))} placeholder="可选；保存时会脱敏" /></label>
        <label>备注<input aria-label="仓库备注" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="可选" /></label>
        <div className="tab-modal-v2__repository-form-actions"><ActionButton type="button" onClick={() => setFormOpen(false)}>取消</ActionButton><ActionButton type="submit" variant="primary"><IoAddOutline aria-hidden="true" />保存登记</ActionButton></div>
      </form>}
      <div className="tab-modal-v2__repository-list" aria-live="polite">
        {!visibleRepositories.length && <div className="tab-modal-v2__repository-empty"><IoFolderOpenOutline aria-hidden="true" /><b>{repositories.length ? "没有匹配的仓库" : "还没有登记仓库"}</b><small>{repositories.length ? "换一个搜索词或分类。" : "添加一个仓库，或直接登记当前 ObsUI 工作区。"}</small></div>}
        {visibleRepositories.map((repository) => {
          const selected = selectedId === repository.id;
          return <article key={repository.id} className={`tab-modal-v2__repository-row${selected ? " is-selected" : ""}`} data-repository-id={repository.id} onClick={() => { setSelectedId(repository.id); void refreshOne(repository); }}>
            <div className="tab-modal-v2__repository-row-icon">{repositoryIcon(repository.kind)}</div>
            <div className="tab-modal-v2__repository-row-body"><header><div><span className={`tab-modal-v2__repository-kind is-${repository.kind}`}>{kindLabels[repository.kind]}</span><h3>{repository.name}</h3></div><div className="tab-modal-v2__repository-row-actions">{repository.kind === "obsidian" && <ActionButton type="button" variant="primary" className="is-open-vault" title="浏览知识库" aria-label={`浏览${repository.name}知识库`} onClick={(event) => { event.stopPropagation(); setInitialObsidianNotePath(null); setActiveObsidianVaultId(repository.id); }}><IoDocumentTextOutline aria-hidden="true" />浏览文档</ActionButton>}<ActionButton type="button" title="打开本地目录" aria-label={`打开${repository.name}的本地目录`} onClick={(event) => { event.stopPropagation(); void openFolder(repository); }}><IoFolderOpenOutline aria-hidden="true" /></ActionButton><ActionButton type="button" variant="danger" title="移除登记" aria-label={`移除${repository.name}登记`} onClick={(event) => { event.stopPropagation(); remove(repository); }}><IoTrashOutline aria-hidden="true" /></ActionButton></div></header><div className="tab-modal-v2__repository-path"><span>本地路径</span><b title={repository.localPath}>{repository.localPath}</b></div>{repository.remoteUrl && <div className="tab-modal-v2__repository-path"><span>登记远程</span><b title={repository.remoteUrl}>{repository.remoteUrl}</b></div>}{repository.note && <p className="tab-modal-v2__repository-note">{repository.note}</p>}{repository.kind === "git" ? <GitStatus status={statuses[repository.id]} loading={pendingIds.has(repository.id)} /> : repository.kind === "obsidian" ? <div className="tab-modal-v2__repository-status is-registration-only"><IoBookOutline aria-hidden="true" /><span>可浏览、阅读并编辑 Vault 内的 Markdown 文档</span></div> : <div className="tab-modal-v2__repository-status is-registration-only"><IoAlertCircleOutline aria-hidden="true" /><span>已登记入口；尚未接入实时读取</span></div>}</div>
          </article>;
        })}
      </div>
    </section>
  </div>;
}
