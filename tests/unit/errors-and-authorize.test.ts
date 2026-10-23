import { describe, expect, it } from "vitest";
import { translateDbError } from "@/lib/db";
import {
  ConflictError,
  DatabaseUnavailableError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { assertAdmin, assertSignedIn } from "@/lib/auth/authorize";

describe("translateDbError", () => {
  it.each(["ECONNREFUSED", "ER_ACCESS_DENIED_ERROR", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "ER_BAD_DB_ERROR"])(
    "maps %s to a safe 'database unavailable' error",
    (code) => {
      const e = translateDbError(Object.assign(new Error(`secret detail for ${code}`), { code }));
      expect(e).toBeInstanceOf(DatabaseUnavailableError);
      expect((e as Error).message).not.toContain("secret");
    }
  );

  it("maps duplicates, FK and constraint violations", () => {
    expect(translateDbError({ code: "ER_DUP_ENTRY", message: "x" })).toBeInstanceOf(ConflictError);
    expect(translateDbError({ code: "ER_NO_REFERENCED_ROW_2", message: "x" })).toBeInstanceOf(ValidationError);
    expect(translateDbError({ code: "ER_CONSTRAINT_FAILED", message: "x" })).toBeInstanceOf(ValidationError);
  });

  it("maps a missing configuration to 'database unavailable'", () => {
    const e = Object.assign(new Error("Database is not configured"), { name: "DbConfigError" });
    expect(translateDbError(e)).toBeInstanceOf(DatabaseUnavailableError);
  });
});

describe("authorization assertions", () => {
  const employee = { id: "e", email: "e@x.com", name: "E", role: "employee" as const };
  const admin = { ...employee, id: "a", role: "admin" as const };

  it("requires a signed-in actor", () => {
    expect(() => assertSignedIn(null)).toThrow(UnauthorizedError);
    expect(() => assertSignedIn(employee)).not.toThrow();
  });

  it("requires the admin role from the server-side actor", () => {
    expect(() => assertAdmin(null)).toThrow(UnauthorizedError);
    expect(() => assertAdmin(employee)).toThrow(ForbiddenError);
    expect(() => assertAdmin(admin)).not.toThrow();
  });
});
