import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { calendarDate, email, optionalText, parse, requiredText, timeOfDay, uuid } from "@/lib/validation";

describe("validation", () => {
  it("accepts UUIDs and normalizes case; rejects anything else", () => {
    expect(parse(uuid, "3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    for (const bad of ["", "1", "../etc", "3f2504e0-4f89-11d3-9a0c-0305e82c330", "' OR 1=1 --", 42, null]) {
      expect(() => parse(uuid, bad)).toThrow(ValidationError);
    }
  });

  it("validates real calendar dates", () => {
    expect(parse(calendarDate, "2024-02-29")).toBe("2024-02-29");
    for (const bad of ["2023-02-29", "2024-13-01", "2024-1-1", "yesterday", "2024-04-31"]) {
      expect(() => parse(calendarDate, bad)).toThrow(ValidationError);
    }
  });

  it("validates times and normalizes to HH:MM:SS", () => {
    expect(parse(timeOfDay, "07:30")).toBe("07:30:00");
    expect(parse(timeOfDay, "23:59:59")).toBe("23:59:59");
    for (const bad of ["24:00", "7:30", "12:60", "noon"]) expect(() => parse(timeOfDay, bad)).toThrow(ValidationError);
  });

  it("normalizes email addresses", () => {
    expect(parse(email, "  Someone@Example.COM ")).toBe("someone@example.com");
    expect(() => parse(email, "not-an-email")).toThrow(ValidationError);
  });

  it("enforces text lengths", () => {
    expect(optionalText("   ")).toBeNull();
    expect(optionalText(" hi ")).toBe("hi");
    expect(() => optionalText("x".repeat(11), 10)).toThrow(ValidationError);
    expect(() => requiredText("", "Title")).toThrow(/Title is required/);
    expect(requiredText(" Feed ", "Title")).toBe("Feed");
  });
});
