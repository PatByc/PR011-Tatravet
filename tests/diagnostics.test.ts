import { describe, expect, it } from "vitest";
import { safeErrorDetails } from "../lib/diagnostics";
import { spawnSync } from "node:child_process";
describe("safe deployment diagnostics", () => {
  it("keeps database codes and excludes messages, queries and credentials", () => {
    const details = safeErrorDetails({
      name: "PrismaClientKnownRequestError",
      code: "P2010",
      message: "private query",
      meta: {
        code: "42P01",
        message: "postgresql://user:secret@db",
        query: "private transcript",
      },
      cause: { code: "ECONNREFUSED" },
    });
    expect(details).toEqual({
      name: "PrismaClientKnownRequestError",
      code: "P2010",
      databaseCode: "42P01",
      causeCode: "ECONNREFUSED",
    });
    expect(JSON.stringify(details)).not.toMatch(/secret|private|postgresql/);
  });
  it("fails startup when runtime variables are absent", () => {
    const result = spawnSync(process.execPath, ["scripts/check-runtime.mjs"], {
      env: { ...process.env, PUBLIC_URL: "", DATABASE_URL: "" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PUBLIC_URL, DATABASE_URL");
  });
  it("logs the effective public origin without database secrets", () => {
    const result = spawnSync(process.execPath, ["scripts/check-runtime.mjs"], {
      env: {
        ...process.env,
        PUBLIC_URL: "https://clinic.example",
        DATABASE_URL: "postgresql://user:private-password@db:5432/clinic",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("https://clinic.example");
    expect(result.stdout + result.stderr).not.toContain("private-password");
  });
});
