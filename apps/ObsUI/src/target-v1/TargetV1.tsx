import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { IoAddOutline, IoChevronBackOutline, IoChevronForwardOutline } from "react-icons/io5";
import type { V2BusinessContext } from "../tab-modal-v2/model";
import type { Priority, Task } from "../types";
import { openTargetFolder } from "./folder-api";
import {
  buildTargetCalendarMondayFirst,
  DEFAULT_DUE_TIME,
  deadlineProgress,
  formatDueDate,
  formatDueTime,
  isValidTimeKey,
  localDateKey,
  localMonthKey,
  normalizeDueTime,
  remainingTimeLabel,
  sortTargetTasks,
} from "./task-model";
import "./target-v1.css";

type TargetSection = "current" | "calendar";
type TaskFormState = {
  id?: string;
  dueDate: string;
  dueTime: string;
  title: string;
  priority: Priority | 0;
  folderPath: string;
};

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const priorityValues: Priority[] = [1, 2, 3, 4, 5];

function createTaskForm(dueDate: string, task?: Task): TaskFormState {
  return task
    ? { id: task.id, dueDate: task.dueDate, dueTime: normalizeDueTime(task.dueTime), title: task.title, priority: task.priority, folderPath: task.folderPath }
    : { dueDate, dueTime: DEFAULT_DUE_TIME, title: "", priority: 0, folderPath: "" };
}

export function TargetV1({ context }: { context: V2BusinessContext }) {
  const [section, setSection] = useState<TargetSection>("current");
  const nowDate = new Date();
  const [calendarYear, setCalendarYear] = useState(nowDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(nowDate.getMonth());
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(nowDate));
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
    setSelectedDate(date);
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
    if (!isValidTimeKey(form.dueTime)) {
      setMessage("请选择有效时间。");
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

  const toggleTargetTask = (id: string) => {
    setOpenMenuId(null);
    context.actions.toggleTask(id);
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
            onToggleComplete={toggleTargetTask}
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
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            projects={context.state.projects}
            onDateClick={(dueDate) => setForm(createTaskForm(dueDate))}
            onTaskClick={(task) => setForm(createTaskForm(task.dueDate, task))}
            onToggleTask={toggleTargetTask}
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
  onToggleComplete,
  onCancel,
  onOpenFolder,
  onOpenCalendar,
}: {
  primaryTask: Task | null;
  otherTasks: Task[];
  now: Date;
  openMenuId: string | null;
  onMenuToggle: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenFolder: (task: Task) => void;
  onOpenCalendar: (task?: Task) => void;
}) {
  return <div className="target-v1__current-view">
    <section className="target-v1__primary" aria-label="最高优先任务">
      {primaryTask ? <>
        <div className="target-v1__primary-strip">
          <div className="target-v1__primary-datetime"><strong>{formatDueDate(primaryTask.dueDate)}</strong><small>具体时间 {formatDueTime(primaryTask.dueTime)}</small></div>
          <div className="target-v1__progress"><span><b>{deadlineProgress(primaryTask, now)}%</b></span><i><em style={{ width: `${deadlineProgress(primaryTask, now)}%` }} /></i></div>
          <div className={`target-v1__remaining${remainingTimeLabel(primaryTask, now).startsWith("已逾期") ? " is-overdue" : ""}`}><strong>{remainingTimeLabel(primaryTask, now)}</strong></div>
          <div className="target-v1__primary-task">
           <Stars priority={primaryTask.priority} />
           <h2>{primaryTask.title}</h2>
           {primaryTask.folderPath.trim() && <button type="button" className="target-v1__go" onClick={() => onOpenFolder(primaryTask)}>前往</button>}
          </div>
          <TaskMenu task={primaryTask} open={openMenuId === primaryTask.id} onToggle={onMenuToggle} onToggleComplete={onToggleComplete} onCancel={onCancel} />
        </div>
      </> : <EmptyPrimary onCreate={() => onOpenCalendar()} />}
    </section>

    <section className="target-v1__other" aria-label="其他任务">
      <header><div><span>其他任务</span></div><button type="button" onClick={() => onOpenCalendar()}>打开月历</button></header>
      {otherTasks.length
        ? <TaskRail tasks={otherTasks} now={now} openMenuId={openMenuId} onMenuToggle={onMenuToggle} onToggleComplete={onToggleComplete} onCancel={onCancel} onOpenFolder={onOpenFolder} />
        : <div className="target-v1__other-empty"><button type="button" onClick={() => onOpenCalendar()}>选择日期创建</button></div>}
    </section>
  </div>;
}

function EmptyPrimary({ onCreate }: { onCreate: () => void }) {
  return <div className="target-v1__primary-empty"><h2>当前没有进行中的目标</h2><button type="button" onClick={onCreate}>前往月历</button></div>;
}

function TaskRail({ tasks, now, openMenuId, onMenuToggle, onToggleComplete, onCancel, onOpenFolder }: {
  tasks: Task[];
  now: Date;
  openMenuId: string | null;
  onMenuToggle: (id: string) => void;
  onToggleComplete: (id: string) => void;
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
        <header><div><strong>{formatDueDate(task.dueDate)}</strong><small>具体时间 {formatDueTime(task.dueTime)}</small></div><TaskMenu task={task} open={openMenuId === task.id} onToggle={onMenuToggle} onToggleComplete={onToggleComplete} onCancel={onCancel} /></header>
        <h3>{task.title}</h3>
         <div className="target-v1__task-card-status">{task.status === "completed" && <span className="target-v1__complete-mark">✓ 已完成</span>}<Stars priority={task.priority} /></div>
         <p className={remainingTimeLabel(task, now).startsWith("已逾期") ? "is-overdue" : ""}>{remainingTimeLabel(task, now)}</p>
         {task.folderPath.trim() && <button type="button" className="target-v1__go" onClick={() => onOpenFolder(task)}>前往</button>}
       </article>)}
    </div>
  </div>;
}

function TaskMenu({ task, open, onToggle, onToggleComplete, onCancel }: {
  task: Task;
  open: boolean;
  onToggle: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return <div className="target-v1__menu" onPointerDown={(event) => event.stopPropagation()}>
    <button type="button" className="target-v1__more" aria-label={`${task.title}的操作菜单`} aria-expanded={open} onClick={() => onToggle(task.id)}>···</button>
    {open && <div className="target-v1__menu-popover" role="menu">
      <button type="button" role="menuitem" onClick={() => onToggleComplete(task.id)}>{task.status === "completed" ? "标记未完成" : "标记已完成"}</button>
      <button type="button" role="menuitem" onClick={() => onCancel(task.id)}>取消</button>
    </div>}
  </div>;
}

function CalendarView({ tasks, year, month, onYearChange, onMonthChange, selectedDate, onSelectedDateChange, projects, onDateClick, onTaskClick, onToggleTask }: {
  tasks: Task[];
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  projects: V2BusinessContext["state"]["projects"];
  onDateClick: (date: string) => void;
  onTaskClick: (task: Task) => void;
  onToggleTask: (id: string) => void;
}) {
  const cells = useMemo(() => buildTargetCalendarMondayFirst(year, month), [year, month]);
  const today = localDateKey(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    tasks.filter((task) => Boolean(task.dueDate)).forEach((task) => {
      const dateTasks = grouped.get(task.dueDate) ?? [];
      dateTasks.push(task);
      grouped.set(task.dueDate, dateTasks);
    });
    return grouped;
  }, [tasks]);
  const selectedTasks = tasksByDate.get(selectedDate) ?? [];
  const selectedDateLabel = selectedDate.replaceAll("-", ".");

  const changeMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    onYearChange(next.getFullYear());
    onMonthChange(next.getMonth());
    onSelectedDateChange(localDateKey(next));
  };
  const changePickerMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    onYearChange(next.getFullYear());
    onMonthChange(next.getMonth());
  };
  const selectDate = (date: string) => {
    onSelectedDateChange(date);
  };
  const chooseDate = (date: string) => {
    const [nextYear, nextMonth] = date.split("-").map(Number);
    onYearChange(nextYear);
    onMonthChange(nextMonth - 1);
    onSelectedDateChange(date);
    setDatePickerOpen(false);
  };
  const projectLabel = (task: Task) => projects.find((project) => project.id === task.projectId)?.title ?? "目标";
  const taskSummary = (date: string) => (tasksByDate.get(date) ?? []).map((task) => task.title).join("、");

  return <section className="target-v1__calendar" aria-label="月历">
    <header className="target-v1__calendar-toolbar">
      <div className="target-v1__calendar-title"><h2>月度行动日历</h2><span>// OPERATION CALENDAR</span></div>
      <div className="target-v1__calendar-nav" aria-label="月份导航">
        <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月"><IoChevronBackOutline aria-hidden="true" /></button>
        <button type="button" className="target-v1__calendar-month" aria-expanded={datePickerOpen} aria-haspopup="dialog" onClick={() => setDatePickerOpen((open) => !open)} aria-label="选择月份和日期">{year} / {String(month + 1).padStart(2, "0")}</button>
        <button type="button" onClick={() => changeMonth(1)} aria-label="下个月"><IoChevronForwardOutline aria-hidden="true" /></button>
        {datePickerOpen && <div className="target-v1__calendar-date-picker" role="dialog" aria-label="选择日期">
          <header><b>选择日期</b><span>{year} / {String(month + 1).padStart(2, "0")}</span></header>
          <div className="target-v1__calendar-date-picker-nav"><button type="button" onClick={() => changePickerMonth(-1)} aria-label="上个月"><IoChevronBackOutline aria-hidden="true" /></button><span>{year} / {String(month + 1).padStart(2, "0")}</span><button type="button" onClick={() => changePickerMonth(1)} aria-label="下个月"><IoChevronForwardOutline aria-hidden="true" /></button></div>
          <div className="target-v1__calendar-date-picker-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
          <div className="target-v1__calendar-date-picker-grid">{cells.map((cell) => <button type="button" key={cell.date} className={`${cell.inMonth ? "" : "is-outside"}${cell.date === selectedDate ? " is-selected" : ""}${cell.date === today ? " is-today" : ""}`} onClick={() => chooseDate(cell.date)}>{cell.day}</button>)}</div>
        </div>}
      </div>
    </header>
    <div className="target-v1__calendar-layout">
      <section className="target-v1__calendar-main" aria-label="月历网格">
        <div className="target-v1__calendar-weekday-bar"><div className="target-v1__weekdays">{["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((weekday) => <span key={weekday}>{weekday}</span>)}</div><span>MONTHLY SCHEDULE / LOCAL TIME</span></div>
        <div className="target-v1__calendar-grid">
          {cells.map((cell) => {
            const dateTasks = tasksByDate.get(cell.date) ?? [];
            return <button type="button" key={cell.date} className={`target-v1__calendar-cell${cell.inMonth ? "" : " is-outside"}${cell.date === today ? " is-today" : ""}${cell.date === selectedDate ? " is-selected" : ""}`} onClick={() => selectDate(cell.date)} aria-label={`${cell.date}${dateTasks.length ? `，${taskSummary(cell.date)}` : "，无任务"}`}>
              <span className="target-v1__calendar-cell-top"><b>{String(cell.day).padStart(2, "0")}</b>{cell.date === today && <em>TODAY</em>}</span>
              <span className="target-v1__calendar-cell-tasks">{dateTasks.slice(0, 2).map((task) => <span className={`target-v1__calendar-task-preview priority-${task.priority}${task.status === "completed" ? " is-completed" : ""}`} key={task.id}><i aria-hidden="true" /><span>{task.title}</span></span>)}{dateTasks.length > 2 && <span className="target-v1__calendar-task-more">+{dateTasks.length - 2}</span>}</span>
            </button>;
          })}
        </div>
      </section>
      <aside className="target-v1__calendar-detail" aria-label="选中日期详情">
        <header><span>SELECTED DATE</span><small>DATE DETAIL / ACTIVE</small></header>
        <strong className="target-v1__calendar-selected-date">{selectedDateLabel}</strong>
        <div className="target-v1__calendar-accent" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="target-v1__calendar-event-count"><b>{selectedTasks.length}</b><span>/ EVENTS</span></div>
        <div className="target-v1__calendar-events">{selectedTasks.map((task, index) => <article className={`target-v1__calendar-event${task.status === "completed" ? " is-completed" : ""}`} key={task.id}>
          <button type="button" className="target-v1__calendar-event-main" onClick={() => onTaskClick(task)} aria-label={`编辑${task.title}`}><span className="target-v1__calendar-event-index">{String(index + 1).padStart(2, "0")}</span><span className="target-v1__calendar-event-copy"><b>{formatDueTime(task.dueTime)}</b><strong>{task.title}</strong><small>{projectLabel(task)} / PLAN-{String(index + 1).padStart(3, "0")}</small></span></button>
          <button type="button" className="target-v1__calendar-event-status" onClick={() => onToggleTask(task.id)}>{task.status === "completed" ? "已完成" : "进行中"}</button>
        </article>)}</div>
        {!selectedTasks.length && <div className="target-v1__calendar-empty">当前日期没有安排。</div>}
        <button type="button" className="target-v1__calendar-add" onClick={() => onDateClick(selectedDate)}><IoAddOutline aria-hidden="true" />ADD SCHEDULE / 新增日程</button>
      </aside>
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
      <label><span>具体时间</span><input aria-label="具体时间" type="time" required value={form.dueTime} onChange={(event) => onChange({ ...form, dueTime: event.target.value })} /></label>
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
