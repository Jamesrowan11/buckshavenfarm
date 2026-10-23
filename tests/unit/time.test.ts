import { afterEach, describe, expect, it } from "vitest";
import { addDays, appTimeZone, localDate, nextMonday, startOfLocalDayUtc, weekDates } from "@/lib/time";

afterEach(() => {
  delete process.env.APP_TIME_ZONE;
});

describe("time helpers", () => {
  it("uses the farm time zone for 'today', not UTC", () => {
    // 01:30 UTC on Oct 15 is still Oct 14 in Maryland.
    const at = new Date("2026-10-15T01:30:00Z");
    expect(localDate(at, "America/New_York")).toBe("2026-10-14");
    expect(localDate(at, "UTC")).toBe("2026-10-15");
  });

  it("defaults to America/New_York and ignores invalid zones", () => {
    expect(appTimeZone()).toBe("America/New_York");
    process.env.APP_TIME_ZONE = "Not/AZone";
    expect(appTimeZone()).toBe("America/New_York");
    process.env.APP_TIME_ZONE = "Europe/London";
    expect(appTimeZone()).toBe("Europe/London");
  });

  it("computes Monday-based weeks", () => {
    expect(weekDates("2026-10-15")).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
    expect(weekDates("2026-10-18")[0]).toBe("2026-10-12"); // Sunday belongs to the week before
    expect(nextMonday("2026-10-15")).toBe("2026-10-19");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("finds local midnight in UTC across DST", () => {
    expect(startOfLocalDayUtc("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfLocalDayUtc("2026-01-15", "America/New_York").toISOString()).toBe("2026-01-15T05:00:00.000Z");
    // DST starts 2026-03-08: midnight is still EST.
    expect(startOfLocalDayUtc("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfLocalDayUtc("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });
});
