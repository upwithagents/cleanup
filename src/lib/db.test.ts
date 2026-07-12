import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("db client", () => {
  it("creates and reads a Scan with defaults", async () => {
    const scan = await db.scan.create({
      data: { targetPath: "/tmp/example" },
    });
    const found = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(found.targetPath).toBe("/tmp/example");
    expect(found.status).toBe("running");
    expect(found.fileCount).toBe(0);
    expect(JSON.parse(found.skipped)).toEqual([]);
  });
});
