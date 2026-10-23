import { describe, expect, it } from "vitest";
import { formatPayday } from "@/lib/schedule-format";

describe("formatPayday", () => {
  it("names the weekday for weekly and fortnightly schedules", () => {
    expect(formatPayday("WEEKLY", 1)).toBe("Every Monday");
    expect(formatPayday("WEEKLY", 7)).toBe("Every Sunday");
    expect(formatPayday("FORTNIGHTLY", 5)).toBe("Every second Friday");
  });

  it("uses ordinals for monthly schedules", () => {
    expect(formatPayday("MONTHLY", 1)).toBe("1st of the month");
    expect(formatPayday("MONTHLY", 2)).toBe("2nd of the month");
    expect(formatPayday("MONTHLY", 3)).toBe("3rd of the month");
    expect(formatPayday("MONTHLY", 11)).toBe("11th of the month");
    expect(formatPayday("MONTHLY", 22)).toBe("22nd of the month");
    expect(formatPayday("MONTHLY", 25)).toBe("25th of the month");
  });

  it("explains days that short months don't have", () => {
    expect(formatPayday("MONTHLY", 29)).toBe("29th, or the month's last day");
    expect(formatPayday("MONTHLY", 30)).toBe("30th, or the month's last day");
    expect(formatPayday("MONTHLY", 31)).toBe("Last day of the month");
  });
});
