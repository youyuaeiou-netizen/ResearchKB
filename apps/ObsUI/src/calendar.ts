export type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getCalendarMonthDays(anchor: Date): CalendarCell[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const firstCell = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return { date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}

export function shiftCalendarMonth(anchor: Date, delta: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}

export function calendarMonthTitle(anchor: Date): string {
  return anchor.toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
}
