import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import iconUrl from "../assets/obsui.ico";
import {
  createBackup,
  createId,
  createInitialState,
  loadAppState,
  parseBackup,
  saveAppState,
  touch,
} from "./storage";
import { calendarMonthTitle, dateKey, getCalendarMonthDays, shiftCalendarMonth } from "./calendar";
import type { AppState, Priority, Project, ProjectKind, Resource, ResourceKind, Task, TaskStatus } from "./types";

type View = "overview" | "calendar" | "projects" | "tasks" | "resources" | "recycle" | "settings";

const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : "未设定";
const kindLabel: Record<ProjectKind, string> = { course: "课程", research: "科研", personal: "个人" };
const statusLabel: Record<TaskStatus, string> = { todo: "待开始", doing: "进行中", done: "已完成" };
const priorityLabel: Record<Priority, string> = { low: "低", medium: "中", high: "高" };
const resourceLabel: Record<ResourceKind, string> = { link: "链接", file: "本机路径", note: "备注" };

function App() {
  const [view, setView] = useState<View>("overview");
  const [state, setState] = useState<AppState>(() => createInitialState());
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAppState().then((loaded) => { setState(loaded); setReady(true); }).catch(() => {
      setNotice("本地数据读取失败，当前显示的是临时示例数据。重启前请先导出备份。");
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => { saveAppState(state).catch(() => setNotice("本地数据保存失败，请立即导出备份。")); }, 160);
    return () => window.clearTimeout(timer);
  }, [ready, state]);

  const commit = (next: AppState) => setState(touch(next));
  const activeProjects = state.projects.filter((project) => project.status === "active");
  const openTasks = state.tasks.filter((task) => task.status !== "done");
  const dueSoon = openTasks.filter((task) => task.dueDate && task.dueDate <= new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10));

  const addProject = (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => commit({ ...state, projects: [{ ...project, id: createId("project"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.projects] });
  const addTask = (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => commit({ ...state, tasks: [{ ...task, id: createId("task"), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.tasks] });
  const addResource = (resource: Omit<Resource, "id" | "createdAt">) => commit({ ...state, resources: [{ ...resource, id: createId("resource"), createdAt: new Date().toISOString() }, ...state.resources] });

  const recycle = (entityType: "project" | "task" | "resource", id: string) => {
    const collections = { project: state.projects, task: state.tasks, resource: state.resources } as const;
    const item = collections[entityType].find((candidate) => candidate.id === id);
    if (!item || !window.confirm("移入回收站？正式删除前仍可恢复。")) return;
    const next = entityType === "project" ? { ...state, projects: state.projects.filter((candidate) => candidate.id !== id), tasks: state.tasks.map((task) => task.projectId === id ? { ...task, projectId: null } : task) } :
      entityType === "task" ? { ...state, tasks: state.tasks.filter((candidate) => candidate.id !== id) } :
        { ...state, resources: state.resources.filter((candidate) => candidate.id !== id) };
    commit({ ...next, recycleBin: [{ id: createId("recycle"), entityType, deletedAt: new Date().toISOString(), payload: item }, ...state.recycleBin] });
  };

  const restore = (recycleId: string) => {
    const item = state.recycleBin.find((candidate) => candidate.id === recycleId);
    if (!item) return;
    const next = item.entityType === "project" ? { ...state, projects: [item.payload as Project, ...state.projects] } : item.entityType === "task" ? { ...state, tasks: [item.payload as Task, ...state.tasks] } : { ...state, resources: [item.payload as import("./types").Resource, ...state.resources] };
    commit({ ...next, recycleBin: state.recycleBin.filter((candidate) => candidate.id !== recycleId) });
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(createBackup(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `obsui-backup-${today()}.json`; link.click(); URL.revokeObjectURL(url);
    setNotice("备份已导出；文件只包含 ObsUI 自己的数据。");
  };

  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { const imported = parseBackup(JSON.parse(String(reader.result))); if (!window.confirm("导入后会替换当前 ObsUI 数据，是否继续？")) return; setState(imported); setNotice("备份已导入。"); }
      catch (error) { setNotice(error instanceof Error ? error.message : "备份文件无法读取，现有数据未改变。"); }
    };
    reader.onerror = () => setNotice("备份文件读取失败，现有数据未改变。"); reader.readAsText(file);
  };

  const resetDemo = () => { if (window.confirm("清空当前 ObsUI 数据并恢复示例数据？请先导出备份。")) { setState(createInitialState()); setNotice("已恢复示例数据。"); } };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src={iconUrl} alt="ObsUI" /><div><strong>OBSUI</strong><span>STUDENT WORKBENCH</span></div></div>
      <div className="local-badge"><i /> LOCAL / OFFLINE</div>
      <nav>{([ ["overview", "总览", "⌂"], ["calendar", "月历", "▦"], ["projects", "项目", "◈"], ["tasks", "任务", "✓"], ["resources", "资料", "▤"], ["recycle", "回收站", "♲"], ["settings", "设置", "⚙"] ] as const).map(([key, label, symbol]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><span>{symbol}</span>{label}{key === "tasks" && openTasks.length > 0 && <em>{openTasks.length}</em>}</button>)}</nav>
      <div className="sidebar-footer"><span>v0.1.0</span><small>本地数据 · 不连接 Vault</small></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">WORKSPACE / {view.toUpperCase()}</span><h1>{view === "overview" ? "今天要推进什么？" : ({ calendar: "月历与截止日期", projects: "项目空间", tasks: "任务队列", resources: "资料库", recycle: "回收站", settings: "工作台设置" } as Record<string, string>)[view]}</h1></div><div className="topbar-meta"><span>{new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" })}</span><b>{activeProjects.length} 个进行中项目</b></div></header>
      {notice && <button className="notice" onClick={() => setNotice("")} title="关闭提示">{notice}<span>×</span></button>}
      {view === "overview" && <Overview state={state} dueSoon={dueSoon} openTasks={openTasks} onView={setView} onToggle={(id) => commit({ ...state, tasks: state.tasks.map((task) => task.id === id ? { ...task, status: task.status === "done" ? "todo" : "done", updatedAt: new Date().toISOString() } : task) })} />}
      {view === "calendar" && <Calendar state={state} onToggle={(id) => commit({ ...state, tasks: state.tasks.map((task) => task.id === id ? { ...task, status: task.status === "done" ? "todo" : "done", updatedAt: new Date().toISOString() } : task) })} onView={setView} />}
      {view === "projects" && <Projects state={state} onAdd={addProject} onRecycle={(id) => recycle("project", id)} />}
      {view === "tasks" && <Tasks state={state} onAdd={addTask} onRecycle={(id) => recycle("task", id)} onToggle={(id, status) => commit({ ...state, tasks: state.tasks.map((task) => task.id === id ? { ...task, status, updatedAt: new Date().toISOString() } : task) })} />}
      {view === "resources" && <Resources state={state} onAdd={addResource} onRecycle={(id) => recycle("resource", id)} />}
      {view === "recycle" && <Recycle state={state} onRestore={restore} onEmpty={() => { if (window.confirm("永久清空回收站？此操作不可恢复。")) commit({ ...state, recycleBin: [] }); }} />}
      {view === "settings" && <Settings onExport={exportData} onImport={() => importRef.current?.click()} onReset={resetDemo} updatedAt={state.updatedAt} />}
      <input ref={importRef} type="file" accept="application/json" hidden onChange={importData} />
    </main>
  </div>;
}

function Overview({ state, dueSoon, openTasks, onView, onToggle }: { state: AppState; dueSoon: Task[]; openTasks: Task[]; onView: (view: View) => void; onToggle: (id: string) => void }) {
  const active = state.projects.filter((project) => project.status === "active");
  return <section className="page"><div className="metric-grid"><Metric label="进行中项目" value={active.length} hint="课程 / 科研 / 个人" tone="blue" /><Metric label="待处理任务" value={openTasks.length} hint="完成后自动归档到今日记录" tone="gold" /><Metric label="近期截止" value={dueSoon.length} hint="未来 7 天" tone="violet" /><Metric label="资料条目" value={state.resources.length} hint="本地状态，不进入 Git" tone="green" /></div><div className="split-grid"><section className="panel focus-panel"><PanelTitle title="今日焦点" action="查看全部" onClick={() => onView("tasks")} /><div className="task-stack">{openTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} project={state.projects.find((project) => project.id === task.projectId)} onToggle={() => onToggle(task.id)} />)}{!openTasks.length && <Empty title="今天没有未完成任务" detail="去任务页创建一个小而明确的下一步。" />}</div></section><section className="panel"><PanelTitle title="项目雷达" action="管理项目" onClick={() => onView("projects")} /><div className="project-stack">{active.slice(0, 4).map((project) => <div className="project-line" key={project.id}><span className={`project-dot ${project.kind}`} /><div><b>{project.title}</b><small>{kindLabel[project.kind]} · {state.tasks.filter((task) => task.projectId === project.id && task.status !== "done").length} 个待处理</small></div><strong>{Math.min(99, Math.max(12, state.tasks.filter((task) => task.projectId === project.id && task.status === "done").length * 20 + 12))}%</strong></div>)}{!active.length && <Empty title="还没有进行中的项目" detail="创建一个课程、科研或个人项目。" />}</div></section></div><section className="panel recent-panel"><PanelTitle title="最近资料" action="打开资料库" onClick={() => onView("resources")} /><div className="resource-grid">{state.resources.slice(0, 3).map((resource) => <div className="resource-card" key={resource.id}><span>{resource.kind === "link" ? "↗" : resource.kind === "file" ? "⌂" : "▤"}</span><div><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></div></div>)}{!state.resources.length && <Empty title="还没有资料" detail="将链接、本机路径或短笔记放在这里。" />}</div></section></section>;
}

function Calendar({ state, onToggle, onView }: { state: AppState; onToggle: (id: string) => void; onView: (view: View) => void }) {
  const [month, setMonth] = useState(() => new Date());
  const cells = useMemo(() => getCalendarMonthDays(month), [month]);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    state.tasks.filter((task): task is Task & { dueDate: string } => Boolean(task.dueDate)).forEach((task) => {
      const tasks = grouped.get(task.dueDate) ?? [];
      tasks.push(task);
      grouped.set(task.dueDate, tasks);
    });
    return grouped;
  }, [state.tasks]);
  const monthTaskCount = cells.filter((cell) => cell.inMonth).reduce((count, cell) => count + (tasksByDate.get(cell.date)?.length ?? 0), 0);
  const todayKey = dateKey(new Date());

  return <section className="page calendar-page">
    <div className="page-intro">
      <div><span className="eyebrow">MONTHLY PLANNER</span><p>按截止日期查看任务；点击任务即可切换完成状态。</p></div>
      <div className="calendar-actions"><button className="secondary" onClick={() => setMonth((current) => shiftCalendarMonth(current, -1))} aria-label="上个月">‹</button><button className="secondary" onClick={() => setMonth(new Date())}>回到今天</button><button className="secondary" onClick={() => setMonth((current) => shiftCalendarMonth(current, 1))} aria-label="下个月">›</button></div>
    </div>
    <section className="panel calendar-panel">
      <header className="calendar-heading"><div><h2>{calendarMonthTitle(month)}</h2><span>{monthTaskCount} 个截止任务 · 数据保存在本地</span></div><button className="panel-link" onClick={() => onView("tasks")}>管理任务 →</button></header>
      <div className="calendar-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((label) => <span key={label}>{label}</span>)}</div>
      <div className="calendar-grid">{cells.map((cell) => {
        const tasks = tasksByDate.get(cell.date) ?? [];
        return <div className={`calendar-cell ${cell.inMonth ? "" : "outside"} ${cell.date === todayKey ? "today" : ""}`} key={cell.date}>
          <div className="calendar-day-number"><b>{cell.day}</b>{cell.date === todayKey && <i>今</i>}</div>
          <div className="calendar-tasks">{tasks.slice(0, 3).map((task) => <button className={`calendar-task ${task.status === "done" ? "done" : ""}`} key={task.id} onClick={() => onToggle(task.id)} title="点击切换完成状态"><span className={`calendar-task-dot ${task.priority}`} />{task.title}</button>)}{tasks.length > 3 && <small className="calendar-more">+{tasks.length - 3} 个任务</small>}</div>
        </div>;
      })}</div>
    </section>
  </section>;
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) { return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>; }
function PanelTitle({ title, action, onClick }: { title: string; action: string; onClick: () => void }) { return <header className="panel-title"><h2>{title}</h2><button onClick={onClick}>{action} →</button></header>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="empty"><b>{title}</b><span>{detail}</span></div>; }
function TaskRow({ task, project, onToggle, onRecycle }: { task: Task; project?: Project; onToggle: () => void; onRecycle?: () => void }) { return <div className={`task-row ${task.status}`}><button className="check" onClick={onToggle} aria-label={task.status === "done" ? "标记未完成" : "标记完成"}>{task.status === "done" ? "✓" : ""}</button><div className="task-copy"><b>{task.title}</b><small>{project?.title || "未归属项目"} · {task.dueDate ? `截止 ${dateLabel(task.dueDate)}` : "无截止日期"}</small></div><span className={`priority ${task.priority}`}>{priorityLabel[task.priority]}</span>{onRecycle && <button className="icon-button" onClick={onRecycle} aria-label="移入回收站">×</button>}</div>; }

function Projects({ state, onAdd, onRecycle }: { state: AppState; onAdd: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => void; onRecycle: (id: string) => void }) { const [title, setTitle] = useState(""); const [kind, setKind] = useState<ProjectKind>("research"); const [description, setDescription] = useState(""); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; onAdd({ title: title.trim(), kind, status: "active", tags: [], description: description.trim(), }); setTitle(""); setDescription(""); }; return <section className="page"><div className="page-intro"><div><span className="eyebrow">PROJECT REGISTRY</span><p>把课程、科研与个人目标放进可推进的工作空间。</p></div><form className="inline-form" onSubmit={submit}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="新项目名称" /><select value={kind} onChange={(event) => setKind(event.target.value as ProjectKind)}><option value="research">科研</option><option value="course">课程</option><option value="personal">个人</option></select><button className="primary" type="submit">+ 创建项目</button></form></div><div className="project-grid">{state.projects.map((project) => <article className="project-card" key={project.id}><div className="card-top"><span className={`type-chip ${project.kind}`}>{kindLabel[project.kind]}</span><button className="icon-button" onClick={() => onRecycle(project.id)} aria-label="项目移入回收站">×</button></div><h2>{project.title}</h2><p>{project.description || "还没有项目说明。"}</p><div className="card-meta"><span>{state.tasks.filter((task) => task.projectId === project.id && task.status !== "done").length} 个未完成任务</span><span>{state.resources.filter((resource) => resource.projectId === project.id).length} 个资料</span></div><div className="progress"><i style={{ width: `${Math.min(100, Math.max(8, state.tasks.filter((task) => task.projectId === project.id && task.status === "done").length * 20 + 8))}%` }} /></div></article>)}{!state.projects.length && <Empty title="还没有项目" detail="从上方创建第一个项目。" />}</div></section>; }

function Tasks({ state, onAdd, onRecycle, onToggle }: { state: AppState; onAdd: (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => void; onRecycle: (id: string) => void; onToggle: (id: string, status: TaskStatus) => void }) { const [title, setTitle] = useState(""); const [projectId, setProjectId] = useState(""); const [dueDate, setDueDate] = useState(""); const [priority, setPriority] = useState<Priority>("medium"); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; onAdd({ title: title.trim(), projectId: projectId || null, dueDate: dueDate || null, status: "todo", priority }); setTitle(""); setDueDate(""); }; return <section className="page"><form className="create-panel" onSubmit={submit}><div><span className="eyebrow">NEXT ACTION</span><h2>创建一个明确的下一步</h2></div><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：读完论文方法部分并写下三个问题" /><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">不归属项目</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option></select><button className="primary" type="submit">加入队列</button></form><div className="task-list">{state.tasks.map((task) => <TaskRow key={task.id} task={task} project={state.projects.find((project) => project.id === task.projectId)} onToggle={() => onToggle(task.id, task.status === "done" ? "todo" : "done")} onRecycle={() => onRecycle(task.id)} />)}{!state.tasks.length && <Empty title="任务队列为空" detail="创建一个可在今天完成的下一步。" />}</div></section>; }

function Resources({ state, onAdd, onRecycle }: { state: AppState; onAdd: (resource: Omit<Resource, "id" | "createdAt">) => void; onRecycle: (id: string) => void }) { const [title, setTitle] = useState(""); const [location, setLocation] = useState(""); const [kind, setKind] = useState<ResourceKind>("link"); const [projectId, setProjectId] = useState(""); const submit = (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !location.trim()) return; onAdd({ title: title.trim(), location: location.trim(), kind, projectId: projectId || null, tags: [] }); setTitle(""); setLocation(""); }; return <section className="page"><form className="create-panel resource-form" onSubmit={submit}><div><span className="eyebrow">RESOURCE DOCK</span><h2>保存一个可回到的资料入口</h2></div><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="资料标题" /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="https:// 或本机路径" /><select value={kind} onChange={(event) => setKind(event.target.value as ResourceKind)}><option value="link">链接</option><option value="file">本机路径</option><option value="note">备注</option></select><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">不归属项目</option>{state.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><button className="primary" type="submit">保存资料</button></form><div className="resource-list">{state.resources.map((resource) => <article className="resource-row" key={resource.id}><span className="resource-symbol">{resource.kind === "link" ? "↗" : resource.kind === "file" ? "⌂" : "▤"}</span><div><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></div><span>{state.projects.find((project) => project.id === resource.projectId)?.title || "未归属"}</span><button className="icon-button" onClick={() => onRecycle(resource.id)} aria-label="资料移入回收站">×</button></article>)}{!state.resources.length && <Empty title="资料库为空" detail="先保存链接、本机路径或备注。" />}</div></section>; }

function Recycle({ state, onRestore, onEmpty }: { state: AppState; onRestore: (id: string) => void; onEmpty: () => void }) { return <section className="page"><div className="page-intro"><div><span className="eyebrow">RECOVERY ZONE</span><p>移入回收站的项目、任务和资料仍可恢复。</p></div>{state.recycleBin.length > 0 && <button className="danger-button" onClick={onEmpty}>清空回收站</button>}</div><div className="recycle-list">{state.recycleBin.map((item) => <article key={item.id}><div><b>{item.payload.title}</b><small>{item.entityType} · 删除于 {new Date(item.deletedAt).toLocaleString("zh-CN")}</small></div><button className="secondary" onClick={() => onRestore(item.id)}>恢复</button></article>)}{!state.recycleBin.length && <Empty title="回收站为空" detail="这里不会自动清理任何内容。" />}</div></section>; }

function Settings({ onExport, onImport, onReset, updatedAt }: { onExport: () => void; onImport: () => void; onReset: () => void; updatedAt: string }) { return <section className="page settings-page"><article className="settings-card"><span className="eyebrow">LOCAL DATA</span><h2>数据只属于这个工作台</h2><p>v0.1 不读取或写入 ResearchKB、Obsidian、Zotero，也不发起网络请求。项目、任务和资料保存在本机浏览器的 ObsUI 数据库中。</p><div className="settings-actions"><button className="primary" onClick={onExport}>导出 JSON 备份</button><button className="secondary" onClick={onImport}>导入 JSON 备份</button><button className="danger-button" onClick={onReset}>恢复示例数据</button></div><small>最近保存：{new Date(updatedAt).toLocaleString("zh-CN")}</small></article><article className="settings-card roadmap-card"><span className="eyebrow">ROADMAP</span><h2>下一阶段</h2><div><b>v0.2</b><span>项目详情与画布</span></div><div><b>v0.3</b><span>ResearchKB / Obsidian 只读适配</span></div><div><b>v0.4</b><span>可选 Codex 项目协作</span></div><div><b>v1.0</b><span>Tauri Windows App</span></div></article></section>; }

export default App;
