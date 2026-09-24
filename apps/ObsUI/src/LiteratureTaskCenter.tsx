import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { IoCheckmarkOutline, IoCloseOutline, IoEllipsisHorizontalOutline, IoWarningOutline } from "react-icons/io5";
import type { LiteratureTask } from "./literature";
import { cancelLiteratureTask, getLiteratureTaskSnapshot, refreshLiteratureTasks, subscribeLiteratureTasks } from "./literature-task-store";
import "./literature-task-center.css";

function taskStatusLabel(task: LiteratureTask) {
  if (task.status === "queued") return "排队中";
  if (task.status === "running") return "运行中";
  if (task.status === "completed") return "已完成";
  if (task.status === "cancelled") return "已取消";
  return "失败";
}

function taskProgress(task: LiteratureTask) {
  if (task.kind === "analysis-batch") return task.total ? Math.min(100, Math.round(((task.completed + task.failed) / task.total) * 100)) : 0;
  if (!task.totalPages) return 0;
  return Math.min(100, Math.round(((task.completedPages ?? 0) / task.totalPages) * 100));
}

function taskPhase(task: LiteratureTask) {
  if (task.kind === "analysis-batch") return `${task.completed + task.failed}/${task.total} 篇`;
  if (task.phase === "synthesizing") return "汇总全文";
  if (task.phase === "writing") return "保存报告";
  if (task.totalPages) return `${task.completedPages ?? 0}/${task.totalPages} 页`;
  return "准备中";
}

export function LiteratureTaskCenter() {
  const snapshot = useSyncExternalStore(subscribeLiteratureTasks, getLiteratureTaskSnapshot, getLiteratureTaskSnapshot);
  const [open, setOpen] = useState(false);
  const [canceling, setCanceling] = useState("");
  const activeCount = useMemo(() => snapshot.tasks.filter((task) => task.status === "queued" || task.status === "running").length, [snapshot.tasks]);
  const activeTask = snapshot.tasks.find((task) => task.status === "running" || task.status === "queued");

  useEffect(() => {
    void refreshLiteratureTasks();
    const timer = window.setInterval(() => void refreshLiteratureTasks(), activeCount ? 1_500 : 8_000);
    return () => window.clearInterval(timer);
  }, [activeCount]);

  const cancel = async (task: LiteratureTask) => {
    setCanceling(task.id);
    try {
      await cancelLiteratureTask(task.id);
    } finally {
      setCanceling("");
    }
  };

  return <div className="obsui-task-center">
    {activeTask && <div className="obsui-task-top-progress" role="progressbar" aria-label="文献后台分析进度" aria-valuemin={0} aria-valuemax={activeTask.kind === "analysis-batch" ? activeTask.total : activeTask.totalPages || undefined} aria-valuenow={activeTask.kind === "analysis-batch" ? activeTask.completed + activeTask.failed : activeTask.totalPages ? activeTask.completedPages ?? 0 : undefined} title={activeTask.title}>
      <span>{taskPhase(activeTask)}</span><i><b style={{ width: `${taskProgress(activeTask)}%` }} /></i>
    </div>}
    <button type="button" className={`obsui-task-center-trigger${activeCount ? " is-active" : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <span className="obsui-task-center-pulse" aria-hidden="true">●</span><span>TASKS</span><b>{activeCount}</b>
    </button>
    {open && <section className="obsui-task-center-popover" role="dialog" aria-label="后台任务中心">
      <header><div><span className="obsui-task-center-kicker">BACKGROUND WORK</span><b>后台任务</b></div><button type="button" aria-label="关闭后台任务中心" onClick={() => setOpen(false)}><IoCloseOutline /></button></header>
      {snapshot.error && <p className="obsui-task-center-error"><IoWarningOutline />{snapshot.error}</p>}
      <div className="obsui-task-center-list">
        {!snapshot.tasks.length && <div className="obsui-task-center-empty"><IoEllipsisHorizontalOutline /><span>暂无后台任务</span><small>从文献页加入论文分析后，任务会在这里持续运行。</small></div>}
        {snapshot.tasks.slice(0, 8).map((task) => <article className={`obsui-task-row is-${task.status}`} key={task.id}>
          <div className="obsui-task-row-heading"><span className="obsui-task-row-icon">{task.status === "completed" ? <IoCheckmarkOutline /> : task.status === "failed" ? <IoWarningOutline /> : <i aria-hidden="true" />}</span><b title={task.title}>{task.title}</b><small>{taskStatusLabel(task)}</small></div>
          {(task.status === "queued" || task.status === "running") && <div className="obsui-task-progress"><i style={{ width: `${taskProgress(task)}%` }} /><span>{taskPhase(task)}</span></div>}
          <div className="obsui-task-row-meta"><span>{task.kind === "analysis-batch" ? `${task.completed + task.failed} / ${task.total} 篇` : task.totalPages ? `${task.completedPages ?? 0} / ${task.totalPages} 页` : "等待读取 PDF"}</span><span>{task.executor === "ollama" ? "本地模型" : "ChatGPT（Codex）"}</span>{(task.status === "queued" || task.status === "running") && <button type="button" disabled={canceling === task.id} onClick={() => void cancel(task)}>{canceling === task.id ? "取消中" : "取消"}</button>}</div>
          {task.output && <p title={task.output}>{task.output}</p>}
        </article>)}
      </div>
      <footer><span>{activeCount ? `有 ${activeCount} 个任务在后台运行，不影响继续浏览。` : "深读任务仅保留运行中的任务和最近一次成功报告；失败及旧记录自动清理。报告保存在 Obsidian Vault。"}</span></footer>
    </section>}
  </div>;
}
