import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "@/lib/db";
import { walk } from "@/core/scanner/walk";
import { hashDuplicateCandidates } from "@/core/scanner/hash";
import { runHeuristics } from "@/core/heuristics";
import { heuristicProposals } from "@/core/planner/heuristic";
import {
  anthropicComplete,
  llmProposals,
  type LlmComplete,
} from "@/core/planner/llm";

const FORBIDDEN_ROOTS = () => [
  "/",
  "/System",
  "/Library",
  os.homedir(),
];

export type ValidatedRoot =
  | { ok: true; path: string }
  | { ok: false; error: string };

export function validateScanRoot(input: string): ValidatedRoot {
  const expanded = input.startsWith("~")
    ? path.join(os.homedir(), input.slice(1))
    : input;
  const resolved = path.resolve(expanded);

  if (FORBIDDEN_ROOTS().includes(resolved)) {
    return {
      ok: false,
      error: `Refusing to scan ${resolved} — pick a specific subfolder (e.g. ~/Downloads)`,
    };
  }
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, error: `Path does not exist: ${resolved}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `Not a directory: ${resolved}` };
  }
  return { ok: true, path: resolved };
}

export async function startScan(
  targetPath: string,
): Promise<{ scanId: string }> {
  const scan = await db.scan.create({ data: { targetPath } });
  return { scanId: scan.id };
}

/** The actual scan work; called fire-and-forget by the API route. */
export async function runScan(scanId: string): Promise<void> {
  const scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
  try {
    const walkResult = await walk(scan.targetPath);
    const hashes = await hashDuplicateCandidates(walkResult.files);
    const findings = runHeuristics(walkResult, hashes, {
      root: scan.targetPath,
    });

    await db.finding.createMany({
      data: findings.map((f) => ({
        scanId,
        kind: f.kind,
        payload: JSON.stringify(f.payload),
      })),
    });
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "completed",
        fileCount: walkResult.files.length,
        totalBytes: BigInt(
          walkResult.files.reduce((sum, f) => sum + f.size, 0),
        ),
        skipped: JSON.stringify(walkResult.skipped),
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
  }
}

export function startScanInBackground(scanId: string): void {
  void runScan(scanId).catch(async (err) => {
    await db.scan.update({
      where: { id: scanId },
      data: {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
  });
}

export type PlanResult = {
  heuristic: number;
  llm: number;
  dropped: number;
  llmError?: string;
};

export async function generatePlan(
  scanId: string,
  complete?: LlmComplete,
): Promise<PlanResult> {
  const scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
  const findingRows = await db.finding.findMany({ where: { scanId } });
  const findings = findingRows.map((f) => ({
    kind: f.kind as import("@/core/types").FindingKind,
    payload: JSON.parse(f.payload),
  }));

  // regenerate: undecided proposals are replaced, decided ones are kept
  await db.proposal.deleteMany({ where: { scanId, status: "proposed" } });

  const heuristics = heuristicProposals(findings);
  const result: PlanResult = { heuristic: 0, llm: 0, dropped: 0 };

  const llm = complete ?? (process.env.ANTHROPIC_API_KEY ? anthropicComplete : null);
  let llmDrafts: typeof heuristics = [];
  if (llm) {
    try {
      const llmResult = await llmProposals(findings, scan.targetPath, llm);
      llmDrafts = llmResult.proposals;
      result.dropped = llmResult.dropped;
    } catch (err) {
      result.llmError = err instanceof Error ? err.message : String(err);
    }
  }

  const drafts = [...heuristics, ...llmDrafts];
  for (const draft of drafts) {
    await db.proposal.create({
      data: {
        scanId,
        kind: draft.kind,
        sourcePath: draft.sourcePath,
        destPath: draft.destPath,
        rationale: draft.rationale,
        origin: draft.origin,
      },
    });
  }
  result.heuristic = heuristics.length;
  result.llm = llmDrafts.length;
  return result;
}

export async function getScan(scanId: string) {
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    include: {
      findings: true,
      proposals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!scan) return null;
  return {
    ...scan,
    totalBytes: Number(scan.totalBytes),
    skipped: JSON.parse(scan.skipped) as string[],
    findings: scan.findings.map((f) => ({
      ...f,
      payload: JSON.parse(f.payload) as unknown,
    })),
  };
}

export async function listScans() {
  const scans = await db.scan.findMany({ orderBy: { createdAt: "desc" } });
  return scans.map((s) => ({ ...s, totalBytes: Number(s.totalBytes) }));
}

/** Approve/reject. Applied/undone/failed proposals are immutable. */
export async function setProposalStatus(
  ids: string[],
  status: "approved" | "rejected",
): Promise<number> {
  const result = await db.proposal.updateMany({
    where: {
      id: { in: ids },
      status: { in: ["proposed", "approved", "rejected"] },
    },
    data: { status },
  });
  return result.count;
}

export async function latestBatchId(scanId: string): Promise<string | null> {
  const op = await db.operation.findFirst({
    where: { proposal: { scanId } },
    orderBy: { createdAt: "desc" },
  });
  return op?.batchId ?? null;
}
