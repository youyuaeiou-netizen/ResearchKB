import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { IoAddOutline, IoBookOutline, IoChatbubbleEllipsesOutline, IoCheckmarkCircleOutline, IoCheckboxOutline, IoCloudDownloadOutline, IoCloudUploadOutline, IoCubeOutline, IoDocumentTextOutline, IoGlobeOutline, IoLinkOutline, IoPaperPlaneOutline, IoPulseOutline, IoRefreshOutline, IoSettingsOutline, IoStopCircleOutline, IoTimerOutline, IoTrashOutline } from "react-icons/io5";
import { useHddChat } from "../HddChatPanel";
import type { ProjectKind, ResourceKind } from "../types";
import { ActionButton } from "./ActionButton";
import { CardRail } from "./CardRail";
import { ContentCard } from "./ContentCard";
import type { ProxyLaunchResult, V2BusinessContext, V2TabKey } from "./model";

const formatDuration = (totalSeconds: number) => [Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
const formatRate = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount >= 100 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
};
const metricValue = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value}%`;
const kindLabel: Record<ProjectKind, string> = { course: "课程", research: "科研", personal: "个人" };
const resourceLabel: Record<ResourceKind, string> = { link: "链接", file: "本机路径", note: "备注" };

function EmptyState({ title, detail, icon = <IoCubeOutline aria-hidden="true" />, showDetail = true }: { title: string; detail: string; icon?: ReactNode; showDetail?: boolean }) {
  return <div className="tab-modal-v2__empty"><span>{icon}</span><b>{title}</b>{showDetail && <small>{detail}</small>}</div>;
}

type OverviewAccent = "blue" | "gold" | "green" | "violet";
type OverviewStatusTone = "ready" | "warning" | "muted";

function OverviewMetric({ label, value, accent }: { label: string; value: string; accent: OverviewAccent }) {
  const numeric = Number.parseInt(value, 10);
  return <div className={`tab-modal-v2__overview-metric tab-modal-v2__overview-metric--${accent}`}>
    <div><span>{label}</span><strong>{value}</strong></div>
    <div className="tab-modal-v2__overview-metric-meter"><i style={{ width: `${Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0}%` }} /></div>
  </div>;
}

type ProxyFeedbackTone = "pending" | "success" | "error";
type ProxyFeedback = { tone: ProxyFeedbackTone; message: string };

export function V2Page({ tab, nav, context }: { tab: V2TabKey; nav: string; context: V2BusinessContext }) {
  if (tab === "target") return <TargetPage nav={nav} context={context} />;
  if (tab === "local") return <LocalPage nav={nav} context={context} />;
  if (tab === "storage") return <StoragePage nav={nav} context={context} />;
  if (tab === "literature") return <LiteraturePage nav={nav} context={context} />;
  return <HddPage nav={nav} context={context} />;
}

function TargetPage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const { state, automation, actions } = context;
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    actions.addTask({ title: title.trim(), projectId: null, dueDate, status: "active", priority: 3, folderPath: "", completedAt: null });
    setTitle("");
  };
  const openTasks = state.tasks.filter((task) => task.status !== "completed");
  if (nav === "automation") return <div className="tab-modal-v2__page-stack">
    <ContentCard accent="gold" className="tab-modal-v2__timer-card"><div className="tab-modal-v2__timer-orbit"><IoTimerOutline aria-hidden="true" /></div><strong>{formatDuration(automation.seconds)}</strong><div className="tab-modal-v2__action-row"><ActionButton variant="primary" onClick={actions.toggleAutomation}>{automation.running ? "暂停计时" : "开始计时"}</ActionButton><ActionButton onClick={actions.resetAutomation}>重置</ActionButton></div></ContentCard>
  </div>;
  return <div className="tab-modal-v2__page-stack">
    {nav === "tasks" && <form className="tab-modal-v2__form-card" onSubmit={submit}><div><b>加入今天的队列</b></div><input aria-label="任务标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理文献摘要" /><input aria-label="截止日期" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><ActionButton type="submit" variant="primary"><IoAddOutline />加入计划</ActionButton></form>}
    <CardRail title={nav === "tasks" ? "待办任务" : "今日目标"}>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><strong>{openTasks.length}</strong><b>项待处理</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{openTasks.filter((task) => task.dueDate).length}</strong><b>项有日期</b></ContentCard>
      <ContentCard accent="green" className="tab-modal-v2__summary-card"><strong>{formatDuration(automation.seconds)}</strong><b>{automation.running ? "正在计时" : "已暂停"}</b></ContentCard>
      <ContentCard accent="violet" className="tab-modal-v2__summary-card"><strong>{state.projects.length}</strong><b>个项目</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{state.tasks.filter((task) => task.status === "completed").length}</strong><b>项已完成</b></ContentCard>
    </CardRail>
    <section className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><b>{openTasks.length ? "待完成任务" : "队列已清空"}</b></div></div>{openTasks.length ? openTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => actions.toggleTask(task.id)} />) : <EmptyState title="今天没有待处理任务" detail="可以从上方新增一个小目标。" showDetail={false} icon={<IoCheckmarkCircleOutline aria-hidden="true" />} />}</section>
  </div>;
}

function TaskRow({ task, onToggle }: { task: { id: string; title: string; dueDate: string | null; status: string }; onToggle: () => void }) {
  return <button type="button" className={`tab-modal-v2__task-row${task.status === "completed" ? " is-done" : ""}`} onClick={onToggle}><span className="tab-modal-v2__task-check"><IoCheckboxOutline aria-hidden="true" /></span><span><b>{task.title}</b></span><IoChevronMark /></button>;
}

function IoChevronMark() { return <span className="tab-modal-v2__row-mark" aria-hidden="true">↗</span>; }

export function LocalPage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const { networkMetrics, networkEgress, actions } = context;
  const network = networkMetrics.data;
  const egress = networkEgress.data.data;
  if (nav === "network" || nav === "egress") return <div className="tab-modal-v2__page-stack">
    <section className="tab-modal-v2__network-hero"><div><strong>{nav === "egress" ? egress?.ip ?? (networkEgress.loading ? "查询中…" : "尚未刷新") : network?.adapter.name ?? "正在读取适配器"}</strong></div><div className="tab-modal-v2__network-actions"><ActionButton variant="primary" onClick={nav === "egress" ? actions.refreshEgress : actions.launchFlClash} disabled={nav === "egress" && networkEgress.loading}>{nav === "egress" ? <><IoRefreshOutline />刷新出口 IP</> : <><IoGlobeOutline />恢复 FlClash</>}</ActionButton></div></section>
    <CardRail title={nav === "egress" ? "出口信息" : "链路状态"}>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><strong>{network?.latency.milliseconds === null || network?.latency.milliseconds === undefined ? "—" : `${network.latency.milliseconds} ms`}</strong><b>{network?.latency.target ?? "1.1.1.1:443"}</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{formatRate(network?.downloadBytesPerSecond)}</strong><b>下载速率</b></ContentCard>
      <ContentCard accent="violet" className="tab-modal-v2__summary-card"><strong>{formatRate(network?.uploadBytesPerSecond)}</strong><b>上传速率</b></ContentCard>
      <ContentCard accent="green" className="tab-modal-v2__summary-card"><strong>{network?.flClash.running ? "ON" : "OFF"}</strong><b>{network?.flClash.launchConfigured ? "可启动" : "未配置"}</b></ContentCard>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><strong>{egress?.countryCode ?? "—"}</strong><b>{egress ? "已更新" : "自动更新"}</b></ContentCard>
    </CardRail>
    <section className="tab-modal-v2__detail-grid"><div className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><b>本机适配器</b></div></div><dl className="tab-modal-v2__definition-list"><div><dt>名称</dt><dd>{network?.adapter.name ?? "—"}</dd></div><div><dt>局域网 IP</dt><dd>{network?.adapter.localIpv4 ?? "—"}</dd></div><div><dt>链路速率</dt><dd>{network?.adapter.linkSpeed ?? "—"}</dd></div></dl></div></section>
  </div>;
  return <LocalOverview context={context} />;
}

function LocalOverview({ context }: { context: V2BusinessContext }) {
  const { systemMetrics, networkMetrics, networkEgress, localModels, codexUsage, actions } = context;
  const [proxyMenuOpen, setProxyMenuOpen] = useState(false);
  const [proxyActionPending, setProxyActionPending] = useState<string | null>(null);
  const [proxyFeedback, setProxyFeedback] = useState<ProxyFeedback | null>(null);
  const proxyMenuRef = useRef<HTMLDivElement>(null);
  const metrics = systemMetrics.data;
  const network = networkMetrics.data;
  const egress = networkEgress.data.data;
  const egressValue = egress?.ip ?? (networkEgress.loading ? "查询中…" : networkEgress.data.status === "unconfigured" ? "未配置" : networkEgress.data.status === "unavailable" ? "暂不可用" : "尚未刷新");
  const localModelRows = localModels.data.models.slice(0, 3);
  const localModelStatus = localModels.loading ? "读取中" : localModels.data.status === "ready" ? "在线" : "离线";
  const localModelTone: OverviewStatusTone = localModels.loading ? "warning" : localModels.data.status === "ready" ? "ready" : "warning";

  useEffect(() => {
    if (!proxyMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!proxyMenuRef.current?.contains(event.target as Node)) setProxyMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [proxyMenuOpen]);

  useEffect(() => {
    if (!proxyFeedback) return;
    const timer = window.setTimeout(() => setProxyFeedback(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [proxyFeedback]);

  const runProxyAction = async (label: string, action: () => void | Promise<ProxyLaunchResult>) => {
    if (proxyActionPending) return;
    setProxyActionPending(label);
    setProxyFeedback({ tone: "pending", message: `正在打开 ${label}…` });
    try {
      const result = await action();
      if (result && !result.ok) {
        setProxyFeedback({ tone: "error", message: result.message });
      } else {
        setProxyFeedback({ tone: "success", message: result?.message ?? `${label}已请求打开。` });
      }
    } catch (error) {
      setProxyFeedback({ tone: "error", message: error instanceof Error ? error.message : `无法打开 ${label}。` });
    } finally {
      setProxyActionPending(null);
    }
  };

  return <div className="tab-modal-v2__page-stack tab-modal-v2__local-overview">
    <section className="tab-modal-v2__list-panel" aria-label="Codex 使用限额">
      <div className="tab-modal-v2__section-heading"><div><b>Codex 使用限额</b></div></div>
      <div className="tab-modal-v2__quota-line"><strong>{codexUsage.data ? `${codexUsage.data.remainingPercent}%` : "—"}</strong><span>剩余</span><span>已使用 {codexUsage.data ? `${codexUsage.data.usedPercent}%` : "—"}</span></div>
      <div className="tab-modal-v2__meter"><i style={{ width: `${codexUsage.data?.remainingPercent ?? 0}%` }} /></div>
    </section>
    <CardRail title="本机状态" className="tab-modal-v2__overview-rail">
      <ContentCard accent="blue" className="tab-modal-v2__overview-card tab-modal-v2__system-overview-card" data-overview-card="system" aria-label="系统状态">
        <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoPulseOutline aria-hidden="true" /></span></div>
        <div className="tab-modal-v2__overview-card-heading"><b>系统状态</b></div>
        <div className="tab-modal-v2__overview-metric-grid">
          <OverviewMetric label="CPU" value={metricValue(metrics?.cpu)} accent="blue" />
          <OverviewMetric label="GPU" value={metricValue(metrics?.gpu)} accent="gold" />
          <OverviewMetric label="内存" value={metricValue(metrics?.memory)} accent="violet" />
          <OverviewMetric label="硬盘" value={metricValue(metrics?.disk)} accent="green" />
        </div>
      </ContentCard>

      <ContentCard accent="gold" className="tab-modal-v2__overview-card tab-modal-v2__network-overview-card" data-overview-card="network" aria-label="网络状态">
        <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoGlobeOutline aria-hidden="true" /></span><ActionButton className="tab-modal-v2__overview-refresh" type="button" onClick={actions.refreshEgress} disabled={networkEgress.loading || networkEgress.data.status === "unconfigured"} title="刷新出口 IP"><IoRefreshOutline aria-hidden="true" />{networkEgress.loading ? "查询中…" : "刷新出口 IP"}</ActionButton></div>
        <div className="tab-modal-v2__overview-card-heading"><b>网络状态</b></div>
        <div className="tab-modal-v2__network-rate-grid"><div><span>下载</span><strong>{formatRate(network?.downloadBytesPerSecond)}</strong></div><div><span>上传</span><strong>{formatRate(network?.uploadBytesPerSecond)}</strong></div></div>
        <dl className="tab-modal-v2__overview-field-list"><div><dt>局域网 IP</dt><dd>{network?.adapter.localIpv4 ?? "—"}</dd></div><div><dt>出口 IP</dt><dd>{egressValue}</dd></div><div><dt>FlClash</dt><dd>{network?.flClash.running ? "运行中" : network?.flClash.launchConfigured ? "可启动" : "未配置"}</dd></div></dl>
        <div className="tab-modal-v2__overview-proxy-actions" ref={proxyMenuRef} aria-busy={proxyActionPending !== null}>
          <div className="tab-modal-v2__overview-action-row"><ActionButton variant="primary" type="button" aria-expanded={proxyMenuOpen} aria-controls="obsui-proxy-actions" onClick={() => setProxyMenuOpen((open) => !open)} disabled={proxyActionPending !== null}>打开代理</ActionButton></div>
          {proxyMenuOpen && <div id="obsui-proxy-actions" className="tab-modal-v2__overview-proxy-menu" role="menu"><ActionButton type="button" role="menuitem" onClick={() => { setProxyMenuOpen(false); void runProxyAction("FlClash", actions.launchFlClash); }} disabled={proxyActionPending !== null}>打开 FlClash</ActionButton><ActionButton type="button" role="menuitem" onClick={() => { setProxyMenuOpen(false); void runProxyAction("Clash Verge", actions.launchClashVerge); }} disabled={proxyActionPending !== null}>打开 Clash Verge</ActionButton></div>}
          {proxyFeedback && <div className={`tab-modal-v2__overview-action-feedback tab-modal-v2__overview-action-feedback--${proxyFeedback.tone}`} role={proxyFeedback.tone === "error" ? "alert" : "status"} aria-live="polite">{proxyFeedback.message}</div>}
        </div>
      </ContentCard>

      <ContentCard accent="violet" className="tab-modal-v2__overview-card tab-modal-v2__local-model-overview-card" data-overview-card="local-model" aria-label="本地模型">
        <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoCubeOutline aria-hidden="true" /></span></div>
        <div className="tab-modal-v2__overview-card-heading"><b>本地模型</b></div>
        <div className="tab-modal-v2__overview-model-list">
          <div className="tab-modal-v2__overview-model-row tab-modal-v2__overview-model-row--head"><span>模型名称</span><span>VRAM</span><span>RAM</span><span>状态</span></div>
          {localModelRows.length ? localModelRows.map((model) => <div className="tab-modal-v2__overview-model-row" key={model.name}><b title={model.name}>{model.name}</b><span>—</span><span>—</span><span className={`tab-modal-v2__model-status-dot tab-modal-v2__model-status-dot--${localModelTone}`} role="img" aria-label={localModelStatus} title={localModelStatus} /></div>) : <div className="tab-modal-v2__overview-model-row"><b>{localModels.loading ? "读取中…" : localModels.data.status === "unavailable" ? "Ollama 未连接" : "未检测到模型"}</b><span>—</span><span>—</span><span className={`tab-modal-v2__model-status-dot tab-modal-v2__model-status-dot--${localModelTone}`} role="img" aria-label={localModelStatus} title={localModelStatus} /></div>}
        </div>
      </ContentCard>

      <ContentCard accent="green" className="tab-modal-v2__overview-card tab-modal-v2__automation-overview-card" data-overview-card="automation" aria-label="Codex 自动化">
        <div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoTimerOutline aria-hidden="true" /></span></div>
        <div className="tab-modal-v2__overview-card-heading"><b>Codex 自动化</b></div>
        <dl className="tab-modal-v2__overview-field-list"><div><dt>运行周期</dt><dd>未配置</dd></div><div><dt>状态</dt><dd>未接入</dd></div><div><dt>上次运行</dt><dd>—</dd></div><div><dt>下次运行</dt><dd>—</dd></div></dl>
      </ContentCard>
    </CardRail>
  </div>;
}

function StoragePage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const { state, actions } = context;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("research");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    actions.addProject({ title: title.trim(), kind, status: "active", tags: [], description: "", });
    setTitle("");
  };
  const projects = state.projects;
  const resources = state.resources;
  return <div className="tab-modal-v2__page-stack">
    {nav === "projects" && <form className="tab-modal-v2__form-card" onSubmit={submit}><div><span className="tab-modal-v2__micro-label">NEW PROJECT</span><b>建立一个本地索引</b><small>项目内容仍由原有业务状态管理。</small></div><input aria-label="项目名称" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：焊接接头研究" /><select aria-label="项目类型" value={kind} onChange={(event) => setKind(event.target.value as ProjectKind)}><option value="research">科研</option><option value="course">课程</option><option value="personal">个人</option></select><ActionButton type="submit" variant="primary"><IoAddOutline />加入仓库</ActionButton></form>}
    <CardRail title={nav === "resources" ? "资料入口" : "项目索引"}>
      <ContentCard accent="blue" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">PROJECTS</span><strong>{projects.length}</strong><b>个项目</b><small>活跃索引由本机数据库提供。</small></ContentCard>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">RESOURCES</span><strong>{resources.length}</strong><b>个资料入口</b><small>网页、本机路径或备注。</small></ContentCard>
      <ContentCard accent="green" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">ACTIVE</span><strong>{projects.filter((project) => project.status === "active").length}</strong><b>个活跃项目</b><small>只显示当前业务状态。</small></ContentCard>
      <ContentCard accent="violet" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">TASK LINKS</span><strong>{state.tasks.filter((task) => task.projectId).length}</strong><b>项已关联任务</b><small>关联关系可在原有页面继续维护。</small></ContentCard>
      <ContentCard accent="gold" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">RECYCLE</span><strong>{state.recycleBin.length}</strong><b>项可恢复</b><small>回收站不会自动清理内容。</small></ContentCard>
    </CardRail>
    {nav === "resources" ? <section className="tab-modal-v2__list-panel">{resources.length ? resources.map((resource) => <div className="tab-modal-v2__resource-row" key={resource.id}><span className="tab-modal-v2__row-icon"><IoLinkOutline /></span><span><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></span><IoChevronMark /></div>) : <EmptyState title="还没有关联资料" detail="前往文献 Tab 保存一个可回到的入口。" icon={<IoDocumentTextOutline aria-hidden="true" />} />}</section> : <section className="tab-modal-v2__project-grid">{projects.length ? projects.map((project) => <ContentCard key={project.id} accent={project.kind === "research" ? "gold" : project.kind === "course" ? "blue" : "violet"}><span className="tab-modal-v2__card-code">{kindLabel[project.kind]}</span><h2>{project.title}</h2><p>{project.description || "还没有项目说明。"}</p><div className="tab-modal-v2__project-meta"><span>{state.tasks.filter((task) => task.projectId === project.id && task.status !== "completed").length} 个待办</span><span>{resources.filter((resource) => resource.projectId === project.id).length} 个资料</span></div></ContentCard>) : <EmptyState title="项目仓库为空" detail="可以在这里建立一个本地项目索引。" />}</section>}
  </div>;
}

function LiteraturePage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const { state, actions } = context;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !location.trim()) return;
    actions.addResource({ title: title.trim(), location: location.trim(), kind: "link", projectId: null, tags: [] });
    setTitle("");
    setLocation("");
  };
  return <div className="tab-modal-v2__page-stack">
    {nav === "save" && <form className="tab-modal-v2__form-card tab-modal-v2__literature-form" onSubmit={submit}><div><span className="tab-modal-v2__micro-label">LITERATURE ENTRY</span><b>保存一个可回到的入口</b><small>不会自动读取或写入 ResearchKB Vault 文件。</small></div><input aria-label="资料名称" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="资料标题" /><input aria-label="资料地址" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="https:// 或本机路径" /><ActionButton type="submit" variant="primary"><IoAddOutline />保存入口</ActionButton></form>}
    <CardRail title="最近入口"><ContentCard accent="blue" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">DOCKED</span><strong>{state.resources.length}</strong><b>个资料入口</b><small>每一项都可以回到原始位置。</small></ContentCard><ContentCard accent="gold" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">LINKS</span><strong>{state.resources.filter((resource) => resource.kind === "link").length}</strong><b>个链接</b><small>保持来源路径不变。</small></ContentCard><ContentCard accent="green" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">LOCAL FILES</span><strong>{state.resources.filter((resource) => resource.kind === "file").length}</strong><b>个本机路径</b><small>仅保存入口信息。</small></ContentCard><ContentCard accent="violet" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">NOTES</span><strong>{state.resources.filter((resource) => resource.kind === "note").length}</strong><b>个备注</b><small>数据由本地数据库保存。</small></ContentCard><ContentCard accent="blue" className="tab-modal-v2__summary-card"><span className="tab-modal-v2__card-code">LOCAL ONLY</span><strong>100%</strong><b>本机保存</b><small>不会自动上传文献内容。</small></ContentCard></CardRail>
    <section className="tab-modal-v2__list-panel">{state.resources.length ? state.resources.map((resource) => <div className="tab-modal-v2__resource-row" key={resource.id}><span className="tab-modal-v2__row-icon"><IoBookOutline /></span><span><b>{resource.title}</b><small>{resourceLabel[resource.kind]} · {resource.location}</small></span><IoChevronMark /></div>) : <EmptyState title="还没有资料入口" detail="从保存入口开始添加网页、本机路径或备注。" icon={<IoBookOutline aria-hidden="true" />} />}</section>
  </div>;
}

function HddPage({ nav, context }: { nav: string; context: V2BusinessContext }) {
  const chat = useHddChat();
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void chat.sendMessage(); }
  };
  if (nav === "sources") return <div className="tab-modal-v2__page-stack"><section className="tab-modal-v2__list-panel"><div className="tab-modal-v2__section-heading"><div><span className="tab-modal-v2__micro-label">SOURCES</span><b>最近回答的来源</b></div><span>{chat.lastCitations.length} ITEMS</span></div>{chat.lastCitations.length ? <div className="tab-modal-v2__source-list">{chat.lastCitations.map((citation) => <div className="tab-modal-v2__resource-row" key={citation.path}><span className="tab-modal-v2__row-icon"><IoDocumentTextOutline /></span><span><b>{citation.label}</b><small>{citation.path}</small></span></div>)}</div> : <EmptyState title="还没有来源" detail="H.D.D 回答中的 Source 行会出现在这里。" icon={<IoDocumentTextOutline aria-hidden="true" />} />}</section></div>;
  if (nav === "settings") return <div className="tab-modal-v2__page-stack"><ContentCard accent="gold" className="tab-modal-v2__hdd-status-card"><div className="tab-modal-v2__card-top"><span className="tab-modal-v2__card-icon"><IoSettingsOutline /></span><span className={`tab-modal-v2__live-pill${chat.status?.available ? " is-ready" : ""}`}><i />{chat.status?.available ? "ONLINE" : chat.status ? "OFFLINE" : "CHECKING"}</span></div><h2>H.D.D 本机桥接</h2><p>当前 V2 页面只复用本机接口能力，不复用旧弹窗的 DOM 或外壳。知识镜像保持只读，回答和历史会话保存在本机桥接目录。</p><div className="tab-modal-v2__definition-list"><div><span>版本</span><b>{chat.status?.version ?? "—"}</b></div><div><span>状态</span><b>{chat.status?.message ?? "正在检查本机 Codex CLI"}</b></div></div><ActionButton variant="quiet" onClick={context.actions.openSettings}>打开工作台设置</ActionButton></ContentCard></div>;
  return <div className="tab-modal-v2__hdd-layout"><aside className="tab-modal-v2__hdd-sessions"><header><div><span className="tab-modal-v2__micro-label">CONVERSATIONS</span><b>会话</b></div><ActionButton aria-label="新建会话" title="新建会话" onClick={() => void chat.createConversation()}><IoAddOutline /></ActionButton></header><div className="tab-modal-v2__hdd-session-list">{chat.conversations.map((conversation) => <button type="button" key={conversation.id} className={`tab-modal-v2__hdd-session${conversation.id === chat.active?.id ? " is-selected" : ""}`} onClick={() => void chat.openConversation(conversation.id)}><IoChatbubbleEllipsesOutline /><span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></button>)}{!chat.conversations.length && <span className="tab-modal-v2__hdd-muted">还没有会话</span>}</div></aside><section className="tab-modal-v2__hdd-conversation"><header className="tab-modal-v2__hdd-conversation-header"><div><span className="tab-modal-v2__micro-label">LOCAL CODEX</span><h2>{chat.active?.title ?? "新会话"}</h2></div><div className="tab-modal-v2__hdd-header-actions">{chat.active && <ActionButton aria-label="删除当前会话" title="删除当前会话" onClick={() => chat.requestDelete()}><IoTrashOutline /></ActionButton>}<span className="tab-modal-v2__live-pill"><i />{chat.status?.available ? "在线" : chat.status ? "离线" : "检查中"}</span></div></header><div className="tab-modal-v2__hdd-messages" ref={chat.messagesRef}>{chat.loadingConversation && <span className="tab-modal-v2__hdd-muted">正在读取会话…</span>}{chat.active?.messages.map((message) => <article className={`tab-modal-v2__hdd-message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "H.D.D"}</span><p>{message.content || (chat.loading ? "正在生成…" : "")}</p></article>)}{!chat.loadingConversation && !chat.active && <EmptyState title="从一个问题开始" detail="本机 Codex 只读回答，不会联网或修改文件。" icon={<IoChatbubbleEllipsesOutline aria-hidden="true" />} />}</div>{chat.error && <div className="tab-modal-v2__hdd-error" role="status">{chat.error}</div>}<form className="tab-modal-v2__hdd-composer" onSubmit={(event) => void chat.sendMessage(event)}><textarea value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={chat.status?.available ? "向 H.D.D 提问…" : "Codex CLI 离线时不会伪造回答"} disabled={chat.loading || !chat.status?.available} rows={2} aria-label="向 H.D.D 提问" />{chat.loading ? <ActionButton type="button" variant="danger" onClick={chat.stopGeneration} aria-label="停止生成"><IoStopCircleOutline /></ActionButton> : <ActionButton type="submit" variant="primary" disabled={!chat.draft.trim() || !chat.status?.available} aria-label="发送消息"><IoPaperPlaneOutline /></ActionButton>}</form></section>{chat.deleteCandidate && <div className="tab-modal-v2__confirm" role="dialog" aria-modal="true"><b>删除这个会话？</b><p>历史 JSON 将被移除，且无法从 ObsUI 恢复。</p><div><ActionButton onClick={chat.cancelDelete}>取消</ActionButton><ActionButton variant="danger" onClick={() => void chat.deleteConversation()}><IoTrashOutline />确认删除</ActionButton></div></div>}</div>;
}
