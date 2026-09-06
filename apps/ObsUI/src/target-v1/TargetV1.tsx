import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { V2BusinessContext } from "../tab-modal-v2/model";
import type { Priority, Task } from "../types";
import { openTargetFolder } from "./folder-api";
import {
  buildTargetCalendar,
  deadlineProgress,
  findTaskForDate,
  formatDueDate,
  localDateKey,
  localMonthKey,
  remainingTimeLabel,
  sortTargetTasks,
} from "./task-model";
import "./target-v1.css";

type TargetSection = "current" | "calendar";
type TaskFormState = {
  id?: string;
  dueDate: string;
  title: string;
  priority: Priority | 0;
  folderPath: string;
};

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const priorityValues: Priority[] = [1, 2, 3, 4, 5];

function createTaskForm(dueDate: string, task?: Task): TaskFormState {
  return task
    ? { id: task.id, dueDate: task.dueDate, title: task.title, priority: task.priority, folderPath: task.folderPath }
    : { dueDate, title: "", priority: 0, folderPath: "" };
}

export function TargetV1({ context }: { context: V2BusinessContext }) {
  const [section, setSection] = useState<TargetSection>("current");
  const nowDate = new Date();
  const [calendarYear, setCalendarYear] = useState(nowDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(nowDate.getMonth());
  const [now, setNow] = useState(nowDate);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [hoverPriority, setHoverPriority] = useState<Priority | 0>(0);
  const [message, setMessage] = useState<string | null>(null);
  const sortedTasks = useMemo(() => sortTargetTasks(context.state.tasks), [context.state.tasks]);
  const primaryTask = sortedTasks.find((task) => task.status === "active") ?? null;
  const otherTasks = primaryTask ? sortedTasks.filter((task) => task.id !== primaryTask.id) : sortedTasks;

  useEffect(() => {
    const refreshMonth = () => {
      const current = new Date();
      setNow(current);
      context.actions.cleanupTargetTasks(localMonthKey(current));
    };
    refreshMonth();
    const timer = window.setInterval(refreshMonth, 60_000);
    return () => window.clearInterval(timer);
  }, [context.actions.cleanupTargetTasks]);

  useEffect(() => {
    const closeMenu = () => setOpenMenuId(null);
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, []);

  const showCalendar = (task?: Task) => {
    const date = task?.dueDate || localDateKey(new Date());
    const [year, month] = date.split("-").map(Number);
    setCalendarYear(year);
    setCalendarMonth(month - 1);
    setSection("calendar");
    if (task) setForm(createTaskForm(date, task));
  };

  const openFolder = async (task: Task) => {
    setMessage(null);
    try {
      const result = await openTargetFolder(task.folderPath);
      setMessage(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法打开关联文件夹。");
    }
  };

  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (!form.priority) {
      setMessage("请选择 1～5 星优先级。");
      return;
    }
    const result = context.actions.saveTargetTask({ ...form, priority: form.priority });
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage("任务已保存到本机。");
    setForm(null);
    setHoverPriority(0);
  };

  if (!context.ready) {
    return <div className="target-v1 target-v1--loading" role="status">正在读取本地任务…</div>;
  }

  return <section className="target-v1" aria-label="目标">
    <aside className="target-v1__sidebar" aria-label="目标页功能板块">
      <button type="button" className={`target-v1__section-button${section === "current" ? " is-active" : ""}`} aria-pressed={section === "current"} onClick={() => setSection("current")}>
        <strong>当前目标</strong>
      </button>
      <button type="button" className={`target-v1__section-button${section === "calendar" ? " is-active" : ""}`} aria-pressed={section === "calendar"} onClick={() => setSection("calendar")}>
        <strong>日历 / 月历</strong>
      </button>
    </aside>

    <div className="target-v1__workspace">
      {context.storageError && <div className="target-v1__alert is-error" role="alert">{context.storageError}</div>}
      {message && <button type="button" className="target-v1__alert" onClick={() => setMessage(null)}>{message}<span>关闭</span></button>}
      {section === "current"
        ? <CurrentTargetView
            primaryTask={primaryTask}
            otherTasks={otherTasks}
            now={now}
            openMenuId={openMenuId}
            onMenuToggle={(id) => setOpenMenuId((current) => current === id ? null : id)}
            onComplete={context.actions.completeTargetTask}
            onCancel={context.actions.cancelTargetTask}
            onOpenFolder={openFolder}
            onOpenCalendar={showCalendar}
          />
        : <CalendarView
            tasks={context.state.tasks}
            year={calendarYear}
            month={calendarMonth}
            onYearChange={setCalendarYear}
            onMonthChange={setCalendarMonth}
            onDateClick={(dueDate) => setForm(createTaskForm(dueDate, findTaskForDate(context.state.tasks, dueDate)))}
          />}
    </div>

    {form && <TaskDialog
      form={form}
      hoverPriority={hoverPriority}
      onChange={setForm}
      onHoverPriority={setHoverPriority}
      onClose={() => { setForm(null); setHoverPriority(0); }}
      onSubmit={submitTask}
    />}
  </section>;
}

function CurrentTargetView({
  primaryTask,
  otherTasks,
  now,
  openMenuId,
  onMenuToggle,
  onComplete,
  onCancel,
  onOpenFolder,
  onOpenCalendar,
}: {
  primaryTask: Task | null;
  otherTasks: Task[];
  now: Date;
  openMenuId: string | null;
  onMenuToggle: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenFolder: (task: Task) => void;
  onOpenCalendar: (task?: Task) => void;
}) {
  return <div className="target-v1__current-view">
    <section className="target-v1__primary" aria-label="最高优先任务">
      {primaryTask ? <>
        <header className="target-v1__primary-meta">
          <div><strong>{formatDueDate(primaryTask.dueDate)}</strong></div>
          <div className="target-v1__progress"><span><b>{deadlineProgress(primaryTask, now)}%</b></span><i><em style={{ width: `${deadlineProgress(primaryTask, now)}%` }} /></i></div>
          <div className={`target-v1__remaining${remainingTimeLabel(primaryTask, now).startsWith("已逾期") ? " is-overdue" : ""}`}><strong>{remainingTimeLabel(primaryTask, now)}</strong></div>
          <TaskMenu task={primaryTask} open={openMenuId === primaryTask.id} onToggle={onMenuToggle} onComplete={onComplete} onCancel={onCancel} />
        </header>
           <div className="target-v1__primary-body">
           <Stars priority={primaryTask.priority} />
           <h2>{primaryTask.title}</h2>
           {primaryTask.folderPath.trim() && <button type="button" className="target-v1__go" onClick={() => onOpenFolder(primaryTask)}>前往</button>}
         </div>
      </> : <EmptyPrimary onCreate={() => onOpenCalendar()} />}
    </section>

    <section className="target-v1__other" aria-label="其他任务">
      <header><div><span>其他任务</span></div><button type="button" onClick={() => onOpenCalendar()}>打开月历</button></header>
      {otherTasks.length
        ? <TaskRail tasks={otherTasks} now={now} openMenuId={openMenuId} onMenuToggle={onMenuToggle} onComplete={onComplete} onCancel={onCancel} onOpenFolder={onOpenFolder} />
        : <div className="target-v1__other-empty"><button type="button" onClick={() => onOpenCalendar()}>选择日期创建</button></div>}
    </section>
  </div>;
}

function EmptyPrimary({ onCreate }: { onCreate: () => void }) {
  return <div className="target-v1__primary-empty"><h2>当前没有进行中的目标</h2><button type="button" onClick={onCreate}>前往月历</button></div>;
}

function TaskRail({ tasks, now, openMenuId, onMenuToggle, onComplete, onCancel, onOpenFolder }: {
  tasks: Task[];
  now: Date;
  openMenuId: string | null;
  onMenuToggle: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenFolder: (task: Task) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; scroll: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragging(false);
  };

  return <div className="target-v1__rail-mask">
    <div
      ref={railRef}
      className={`target-v1__rail${dragging ? " is-dragging" : ""}`}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        drag.current = { id: event.pointerId, x: event.clientX, scroll: event.currentTarget.scrollLeft };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.id !== event.pointerId) return;
        const distance = event.clientX - drag.current.x;
        if (Math.abs(distance) > 3) setDragging(true);
        event.currentTarget.scrollLeft = drag.current.scroll - distance;
        event.preventDefault();
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
        if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
        event.currentTarget.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        event.preventDefault();
      }}
    >
      {tasks.map((task) => <article className={`target-v1__task-card${task.status === "completed" ? " is-completed" : ""}`} key={task.id}>
        <header><div><strong>{formatDueDate(task.dueDate)}</strong></div><TaskMenu task={task} open={openMenuId === task.id} onToggle={onMenuToggle} onComplete={onComplete} onCancel={onCancel} /></header>
        <h3>{task.title}</h3>
         <div className="target-v1__task-card-status">{task.status === "completed" && <span className="target-v1__complete-mark">✓ 已完成</span>}<Stars priority={task.priority} /></div>
         <p className={remainingTimeLabel(task, now).startsWith("已逾期") ? "is-overdue" : ""}>{remainingTimeLabel(task, now)}</p>
         {task.folderPath.trim() && <button type="button" className="target-v1__go" onClick={() => onOpenFolder(task)}>前往</button>}
       </article>)}
    </div>
  </div>;
}

function TaskMenu({ task, open, onToggle, onComplete, onCancel }: {
  task: Task;
  open: boolean;
  onToggle: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return <div className="target-v1__menu" onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" className="target-v1__more" aria-label={`${task.title}的操作菜单`} aria-expanded={open} onClick={() => onToggle(task.id)}>···</button>
    {open && <div className="target-v1__menu-popover" role="menu">
      <button type="button" role="menuitem" disabled={task.status === "completed"} onClick={() => onComplete(task.id)}>已完成</button>
      <button type="button" role="menuitem" onClick={() => onCancel(task.id)}>取消</button>
    </div>}
  </div>;
}

function CalendarView({ tasks, year, month, onYearChange, onMonthChange, onDateClick }: {
  tasks: Task[];
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onDateClick: (date: string) => void;
}) {
  const cells = useMemo(() => buildTargetCalendar(year, month), [year, month]);
  const today = localDateKey(new Date());
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 17 }, (_, index) => currentYear - 8 + index);
  return <section className="target-v1__calendar" aria-label="月历">
    <header className="target-v1__calendar-toolbar">
      <div><span>月历</span></div>
      <label><span>年份</span><select value={year} onChange={(event) => onYearChange(Number(event.target.value))}>{years.map((value) => <option key={value} value={value}>{value} 年</option>)}</select></label>
      <label><span>月份</span><select value={month} onChange={(event) => onMonthChange(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{index + 1} 月</option>)}</select></label>
    </header>
    <div className="target-v1__weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
    <div className="target-v1__calendar-grid">
      {cells.map((cell) => {
        const task = findTaskForDate(tasks, cell.date);
        return <button type="button" key={cell.date} className={`${cell.inMonth ? "" : "is-outside"}${cell.date === today ? " is-today" : ""}${task?.status === "completed" ? " is-completed" : ""}`} onClick={() => onDateClick(cell.date)} aria-label={`${cell.date}${task ? `，${task.title}，${task.priority} 星` : "，无任务"}`}>
          <span>{cell.day}</span>
          {task && <Stars priority={task.priority} compact />}
          {task?.status === "completed" && <i>✓</i>}
        </button>;
      })}
    </div>
  </section>;
}

function TaskDialog({ form, hoverPriority, onChange, onHoverPriority, onClose, onSubmit }: {
  form: TaskFormState;
  hoverPriority: Priority | 0;
  onChange: (form: TaskFormState) => void;
  onHoverPriority: (priority: Priority | 0) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const visiblePriority = hoverPriority || form.priority;
  return <div className="target-v1__dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="target-v1__dialog" role="dialog" aria-modal="true" aria-label={form.id ? "修改任务" : "创建任务"} onSubmit={onSubmit}>
      <header><div><span>{form.id ? "修改任务" : "新建任务"}</span></div><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>
      <label><span>日期</span><input type="date" required value={form.dueDate} onChange={(event) => onChange({ ...form, dueDate: event.target.value })} /></label>
      <label><span>目标名称</span><input required value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} placeholder="输入清晰、可执行的目标" /></label>
      <fieldset><legend>1～5 星优先级</legend><div className="target-v1__star-picker" onMouseLeave={() => onHoverPriority(0)}>{priorityValues.map((priority) => <button type="button" key={priority} aria-label={`${priority} 星`} aria-pressed={form.priority === priority} className={priority <= visiblePriority ? "is-filled" : ""} onMouseEnter={() => onHoverPriority(priority)} onFocus={() => onHoverPriority(priority)} onBlur={() => onHoverPriority(0)} onClick={() => onChange({ ...form, priority })}>★</button>)}</div></fieldset>
      <label><span>关联文件夹（可选）</span><input aria-label="关联文件夹（可选）" value={form.folderPath} onChange={(event) => onChange({ ...form, folderPath: event.target.value })} placeholder="可选，例如 F:\\ResearchKB\\projects\\项目名" /></label>
      <button type="submit" className="target-v1__confirm">确认</button>
    </form>
  </div>;
}

function Stars({ priority, compact = false }: { priority: Priority; compact?: boolean }) {
  return <span className={`target-v1__stars${compact ? " is-compact" : ""}`} aria-label={`${priority} 星优先级`}>{priorityValues.slice(0, priority).map((value) => <i key={value}>★</i>)}</span>;
}
