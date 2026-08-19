import { calendarMonthTitle, getCalendarMonthDays, shiftCalendarMonth } from "../src/calendar";

describe("monthly calendar", () => {
  it("returns a Monday-first six-week grid with stable date keys", () => {
    const cells = getCalendarMonthDays(new Date(2026, 7, 19));
    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({ date: "2026-07-27", day: 27, inMonth: false });
    expect(cells.find((cell) => cell.date === "2026-08-01")).toMatchObject({ day: 1, inMonth: true });
    expect(cells.at(-1)).toMatchObject({ date: "2026-09-06", inMonth: false });
  });

  it("moves between months without changing the day unexpectedly", () => {
    const next = shiftCalendarMonth(new Date(2026, 0, 31), 1);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(1);
    expect(calendarMonthTitle(next)).toContain("2月");
  });
});
