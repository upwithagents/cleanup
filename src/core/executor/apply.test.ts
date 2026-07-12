import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { applyApproved, undoBatch } from "@/core/executor/apply";
import { resolveWithinRoot } from "@/core/executor/paths";

let root: string;
let backups: string;
let scanId: string;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-exec-"));
  backups = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-backups-"));
  process.env.CLEANUP_BACKUPS_DIR = backups;
  const scan = await db.scan.create({
    data: { targetPath: root, status: "completed" },
  });
  scanId = scan.id;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(backups, { recursive: true, force: true });
  delete process.env.CLEANUP_BACKUPS_DIR;
});

function seedFile(rel: string, content = "x"): string {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

function proposal(data: {
  kind: string;
  sourcePath: string;
  destPath?: string | null;
  status?: string;
}) {
  return db.proposal.create({
    data: {
      scanId,
      kind: data.kind,
      sourcePath: data.sourcePath,
      destPath: data.destPath ?? null,
      rationale: "test",
      origin: "heuristic",
      status: data.status ?? "approved",
    },
  });
}

describe("resolveWithinRoot", () => {
  it("accepts inside paths and rejects escapes", () => {
    expect(resolveWithinRoot("/a/b", "/a/b/c.txt")).toBe("/a/b/c.txt");
    expect(resolveWithinRoot("/a/b", "/a/b/../evil")).toBeNull();
    expect(resolveWithinRoot("/a/b", "/elsewhere")).toBeNull();
    expect(resolveWithinRoot("/a/b", "/a/bad")).toBeNull();
  });
});

describe("applyApproved", () => {
  it("moves a file and journals the operation", async () => {
    const src = seedFile("loose.png");
    const dest = path.join(root, "images", "loose.png");
    const p = await proposal({ kind: "move", sourcePath: src, destPath: dest });

    const result = await applyApproved(scanId);

    expect(result.applied).toBe(1);
    expect(fs.existsSync(src)).toBe(false);
    expect(fs.readFileSync(dest, "utf8")).toBe("x");
    const op = await db.operation.findFirstOrThrow({
      where: { proposalId: p.id },
    });
    expect(op.status).toBe("done");
    expect(op.batchId).toBe(result.batchId);
    const updated = await db.proposal.findUniqueOrThrow({ where: { id: p.id } });
    expect(updated.status).toBe("applied");
  });

  it("trashes into backups/<scanId>/ preserving relative path", async () => {
    const src = seedFile("sub/dup.txt", "dup");
    await proposal({ kind: "trash", sourcePath: src });

    const result = await applyApproved(scanId);

    expect(result.applied).toBe(1);
    expect(fs.existsSync(src)).toBe(false);
    const backup = path.join(backups, scanId, "sub", "dup.txt");
    expect(fs.readFileSync(backup, "utf8")).toBe("dup");
  });

  it("rejects proposals resolving outside the scan root", async () => {
    seedFile("ok.txt");
    const outside = path.join(os.tmpdir(), "cleanup-outside-victim.txt");
    fs.writeFileSync(outside, "safe");
    const p = await proposal({ kind: "trash", sourcePath: outside });

    const result = await applyApproved(scanId);

    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(fs.existsSync(outside)).toBe(true);
    const updated = await db.proposal.findUniqueOrThrow({ where: { id: p.id } });
    expect(updated.status).toBe("failed");
    fs.rmSync(outside);
  });

  it("stops the batch on mid-batch failure, leaving the rest approved", async () => {
    const first = seedFile("one.txt");
    const missing = path.join(root, "never-existed.txt");
    const third = seedFile("three.txt");
    await proposal({ kind: "trash", sourcePath: first });
    const bad = await proposal({ kind: "trash", sourcePath: missing });
    const last = await proposal({ kind: "trash", sourcePath: third });

    const result = await applyApproved(scanId);

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
    expect(
      (await db.proposal.findUniqueOrThrow({ where: { id: bad.id } })).status,
    ).toBe("failed");
    expect(
      (await db.proposal.findUniqueOrThrow({ where: { id: last.id } })).status,
    ).toBe("approved");
    expect(fs.existsSync(third)).toBe(true);
  });

  it("never touches rejected or proposed proposals", async () => {
    const a = seedFile("keep-a.txt");
    const b = seedFile("keep-b.txt");
    await proposal({ kind: "trash", sourcePath: a, status: "rejected" });
    await proposal({ kind: "trash", sourcePath: b, status: "proposed" });

    const result = await applyApproved(scanId);

    expect(result.applied).toBe(0);
    expect(fs.existsSync(a)).toBe(true);
    expect(fs.existsSync(b)).toBe(true);
  });
});

describe("undoBatch", () => {
  it("restores moved and trashed files in reverse order", async () => {
    const moved = seedFile("m.txt", "m");
    const trashed = seedFile("t.txt", "t");
    await proposal({
      kind: "move",
      sourcePath: moved,
      destPath: path.join(root, "dest", "m.txt"),
    });
    await proposal({ kind: "trash", sourcePath: trashed });
    const { batchId } = await applyApproved(scanId);

    const result = await undoBatch(batchId);

    expect(result.undone).toBe(2);
    expect(fs.readFileSync(moved, "utf8")).toBe("m");
    expect(fs.readFileSync(trashed, "utf8")).toBe("t");
    const proposals = await db.proposal.findMany({ where: { scanId } });
    expect(proposals.map((p) => p.status).sort()).toEqual(["undone", "undone"]);
  });
});
