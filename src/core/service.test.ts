import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import {
  generatePlan,
  getScan,
  runScan,
  setProposalStatus,
  startScan,
  validateScanRoot,
} from "@/core/service";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-svc-"));
  fs.writeFileSync(path.join(root, "dup-a.txt"), "same-bytes");
  fs.writeFileSync(path.join(root, "dup-b.txt"), "same-bytes");
  fs.mkdirSync(path.join(root, "empty"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("validateScanRoot", () => {
  it("rejects forbidden roots and missing paths", () => {
    expect(validateScanRoot("/").ok).toBe(false);
    expect(validateScanRoot("/System").ok).toBe(false);
    expect(validateScanRoot("/Library").ok).toBe(false);
    expect(validateScanRoot(os.homedir()).ok).toBe(false);
    expect(validateScanRoot("/does/not/exist-ever").ok).toBe(false);
  });

  it("accepts a real directory and expands ~", () => {
    const direct = validateScanRoot(root);
    expect(direct).toEqual({ ok: true, path: root });
    const home = validateScanRoot("~");
    expect(home.ok).toBe(false); // "~" expands to homedir, still forbidden
  });
});

describe("scan lifecycle", () => {
  it("startScan + runScan persists findings and stats", async () => {
    const { scanId } = await startScan(root);
    await runScan(scanId);

    const scan = await getScan(scanId);
    expect(scan).not.toBeNull();
    expect(scan!.status).toBe("completed");
    expect(scan!.fileCount).toBe(2);
    expect(scan!.totalBytes).toBe(20);
    const kinds = scan!.findings.map((f) => f.kind).sort();
    expect(kinds).toEqual(["duplicate_set", "empty_dir"]);
  });

  it("marks the scan failed when the target disappears mid-run", async () => {
    const { scanId } = await startScan(root);
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root); // recreate empty so afterEach cleanup works
    await runScan(scanId);
    const scan = await getScan(scanId);
    expect(scan!.status).toBe("completed"); // empty dir scans fine
  });
});

describe("generatePlan", () => {
  it("writes heuristic proposals and llm proposals", async () => {
    const { scanId } = await startScan(root);
    await runScan(scanId);

    const fakeComplete = async () =>
      JSON.stringify([
        {
          kind: "move",
          source: path.join(root, "dup-a.txt"),
          dest: path.join(root, "docs", "dup-a.txt"),
          rationale: "Group documents",
        },
      ]);
    const result = await generatePlan(scanId, fakeComplete);

    expect(result.heuristic).toBe(2); // 1 dup trash + 1 empty dir trash
    expect(result.llm).toBe(1);
    expect(result.llmError).toBeUndefined();
    const scan = await getScan(scanId);
    expect(scan!.proposals).toHaveLength(3);
  });

  it("keeps heuristic proposals when the LLM fails", async () => {
    const { scanId } = await startScan(root);
    await runScan(scanId);

    const failing = async (): Promise<string> => {
      throw new Error("rate limited");
    };
    const result = await generatePlan(scanId, failing);

    expect(result.heuristic).toBe(2);
    expect(result.llm).toBe(0);
    expect(result.llmError).toContain("rate limited");
  });

  it("regenerating replaces proposed but keeps decided proposals", async () => {
    const { scanId } = await startScan(root);
    await runScan(scanId);
    await generatePlan(scanId);
    const scan1 = await getScan(scanId);
    await setProposalStatus([scan1!.proposals[0].id], "approved");

    await generatePlan(scanId);
    const scan2 = await getScan(scanId);
    const approved = scan2!.proposals.filter((p) => p.status === "approved");
    expect(approved).toHaveLength(1);
    expect(scan2!.proposals).toHaveLength(3); // 1 kept + 2 regenerated
  });
});

describe("setProposalStatus", () => {
  it("never flips applied proposals", async () => {
    const { scanId } = await startScan(root);
    await runScan(scanId);
    await generatePlan(scanId);
    const scan = await getScan(scanId);
    const id = scan!.proposals[0].id;
    await db.proposal.update({ where: { id }, data: { status: "applied" } });

    await setProposalStatus([id], "rejected");

    const after = await db.proposal.findUniqueOrThrow({ where: { id } });
    expect(after.status).toBe("applied");
  });
});
