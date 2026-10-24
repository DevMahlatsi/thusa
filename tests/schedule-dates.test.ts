import { describe, expect, it } from "vitest";
import { addDays, dueDatesInMonth } from "@/lib/schedule-dates";

// October 2026 starts on a Thursday; its Fridays are the 2nd, 9th, 16th, 23rd and 30th.
describe("dueDatesInMonth", () => {
  it("puts monthly schedules on their day, or the last day of a short month", () => {
    expect(dueDatesInMonth({ rhythm: "MONTHLY", payday: 25, startsOn: "2026-01-01" }, 2026, 10)).toEqual(["2026-10-25"]);
    expect(dueDatesInMonth({ rhythm: "MONTHLY", payday: 31, startsOn: "2026-01-01" }, 2026, 2)).toEqual(["2026-02-28"]);
    expect(dueDatesInMonth({ rhythm: "MONTHLY", payday: 31, startsOn: "2026-01-01" }, 2026, 9)).toEqual(["2026-09-30"]);
  });

  it("lists every weekday for weekly schedules", () => {
    expect(dueDatesInMonth({ rhythm: "WEEKLY", payday: 5, startsOn: "2026-01-01" }, 2026, 10)).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
    expect(dueDatesInMonth({ rhythm: "WEEKLY", payday: 7, startsOn: "2026-01-01" }, 2026, 10)).toEqual([
      "2026-10-04",
      "2026-10-11",
      "2026-10-18",
      "2026-10-25",
    ]);
  });

  it("counts fortnights from the first payday on or after startsOn", () => {
    expect(dueDatesInMonth({ rhythm: "FORTNIGHTLY", payday: 5, startsOn: "2026-10-01" }, 2026, 10)).toEqual([
      "2026-10-02",
      "2026-10-16",
      "2026-10-30",
    ]);
    // Starting on a payday counts that day; here the fortnight began in September.
    expect(dueDatesInMonth({ rhythm: "FORTNIGHTLY", payday: 5, startsOn: "2026-09-25" }, 2026, 10)).toEqual([
      "2026-10-09",
      "2026-10-23",
    ]);
  });

  it("skips dates before the schedule starts", () => {
    expect(dueDatesInMonth({ rhythm: "MONTHLY", payday: 15, startsOn: "2026-10-20" }, 2026, 10)).toEqual([]);
    expect(dueDatesInMonth({ rhythm: "WEEKLY", payday: 5, startsOn: "2026-10-17" }, 2026, 10)).toEqual([
      "2026-10-23",
      "2026-10-30",
    ]);
    expect(dueDatesInMonth({ rhythm: "WEEKLY", payday: 5, startsOn: "2026-11-01" }, 2026, 10)).toEqual([]);
  });
});

describe("addDays", () => {
  it("crosses month and year ends, and goes back", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });
});
