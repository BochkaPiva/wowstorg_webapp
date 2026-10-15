import { describe, expect, it } from "vitest";
import { moveDateMarker, rentalDayWord, timelineDate, timelineDay, timelineControlLayout, type ScheduleDates } from "@/app/catalog/timeline-dates";
import { billableRentalDaysFromDateOnly } from "@/lib/rental-days";
const dates: ScheduleDates = { readyByDate: "2026-10-20", startDate: "2026-10-21", endDate: "2026-10-23", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING" };
describe("timeline calendar semantics", () => {
  it.each([[[-500, -100, 80], 720], [[250, 250, 260], 720], [[900, 1100, 1500], 720], [[0, 1, 2], 350], [[0, 1, 2], 0]] as [number[], number][])("keeps clamped labels ordered and collision-free", (points, available) => {
    const layout = timelineControlLayout(points, available);
    expect(layout.positions[0]).toBeGreaterThanOrEqual(-.001);
    expect(layout.positions.at(-1)! + layout.width).toBeLessThanOrEqual(available + .001);
    for (let i = 1; i < layout.positions.length; i++) expect(layout.positions[i]).toBeGreaterThanOrEqual(layout.positions[i - 1] + layout.width - .001);
  });
  it.each(["2026-03-29", "2026-10-25", "2028-02-29", "2027-01-01"])("round trips %s without DST offsets", date => {
    expect(timelineDate(timelineDay(date))).toBe(date);
    expect(timelineDay(timelineDate(timelineDay(date) + 1))).toBe(timelineDay(date) + 1);
  });
  it("bounds preparation without shifting or charging the rental", () => {
    const earlier = moveDateMarker(dates, "readyByDate", timelineDay("2026-10-01"), "2026-10-15");
    expect(earlier.readyByDate).toBe("2026-10-15");
    expect(billableRentalDaysFromDateOnly(earlier)).toBe(3);
    expect(moveDateMarker(dates, "readyByDate", timelineDay("2026-11-01"), "2026-10-15").readyByDate).toBe(dates.startDate);
  });
  it("does not let start precede preparation; advancing it past end yields a full day", () => {
    expect(moveDateMarker(dates, "startDate", timelineDay("2026-10-15"), "2026-10-15").startDate).toBe("2026-10-20");
    const moved = moveDateMarker(dates, "startDate", timelineDay("2026-10-25"), "2026-10-15");
    expect(moved.startDate).toBe(moved.endDate);
    expect(moved.rentalStartPartOfDay).toBe("MORNING"); expect(moved.rentalEndPartOfDay).toBe("EVENING");
    expect(billableRentalDaysFromDateOnly(moved)).toBe(1);
    expect(dates.startDate).toBe("2026-10-21");
  });
  it("bounds the end and permits crossing months/years", () => {
    expect(moveDateMarker(dates, "endDate", timelineDay("2026-10-01"), "2026-10-15").endDate).toBe(dates.startDate);
    expect(moveDateMarker(dates, "endDate", timelineDay("2027-01-07"), "2026-10-15").endDate).toBe("2027-01-07");
  });
  it.each([[1,"день"],[2,"дня"],[11,"дней"],[21,"день"],[23,"дня"],[111,"дней"]])("declines %i", (days, word) => expect(rentalDayWord(Number(days))).toBe(word));
});
