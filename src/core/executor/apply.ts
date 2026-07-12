import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { backupsDirFor, resolveWithinRoot } from "@/core/executor/paths";

export type ApplyResult = {
  batchId: string;
  applied: number;
  failed: number;
  error?: string;
};

export type UndoResult = { undone: number; failed: number; error?: string };

/**
 * Execute all approved proposals of a scan. Safety rules:
 * - sources must resolve inside the scan root; move/archive destinations too
 * - trash never deletes: it moves into backups/<scanId>/ preserving the
 *   source's path relative to the scan root
 * - every mutation gets an Operation journal row before the fs is touched
 * - first failure stops the batch; remaining proposals stay approved
 */
export async function applyApproved(scanId: string): Promise<ApplyResult> {
  const scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
  const proposals = await db.proposal.findMany({
    where: { scanId, status: "approved" },
    orderBy: { createdAt: "asc" },
  });

  const batchId = randomUUID();
  const result: ApplyResult = { batchId, applied: 0, failed: 0 };

  for (const proposal of proposals) {
    const source = resolveWithinRoot(scan.targetPath, proposal.sourcePath);
    let dest: string | null = null;
    let action = "move";

    if (proposal.kind === "trash") {
      action = "trash";
      if (source) {
        const rel = path.relative(scan.targetPath, source);
        dest = path.join(backupsDirFor(scanId), rel);
      }
    } else {
      dest = proposal.destPath
        ? resolveWithinRoot(scan.targetPath, proposal.destPath)
        : null;
    }

    if (!source || !dest) {
      await db.proposal.update({
        where: { id: proposal.id },
        data: { status: "failed" },
      });
      result.failed += 1;
      result.error = `Proposal ${proposal.id}: path resolves outside the scan root`;
      break;
    }

    const op = await db.operation.create({
      data: {
        proposalId: proposal.id,
        batchId,
        action,
        sourcePath: source,
        destPath: dest,
      },
    });

    try {
      await movePath(source, dest);
      await db.operation.update({
        where: { id: op.id },
        data: { status: "done", completedAt: new Date() },
      });
      await db.proposal.update({
        where: { id: proposal.id },
        data: { status: "applied" },
      });
      result.applied += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.operation.update({
        where: { id: op.id },
        data: { status: "failed", error: message, completedAt: new Date() },
      });
      await db.proposal.update({
        where: { id: proposal.id },
        data: { status: "failed" },
      });
      result.failed += 1;
      result.error = `Proposal ${proposal.id}: ${message}`;
      break;
    }
  }

  return result;
}

/** Reverse a batch's completed operations, newest first. */
export async function undoBatch(batchId: string): Promise<UndoResult> {
  const ops = await db.operation.findMany({
    where: { batchId, status: "done" },
    orderBy: { createdAt: "desc" },
  });

  const result: UndoResult = { undone: 0, failed: 0 };
  for (const op of ops) {
    try {
      await movePath(op.destPath, op.sourcePath);
      await db.operation.update({
        where: { id: op.id },
        data: { status: "undone", completedAt: new Date() },
      });
      await db.proposal.update({
        where: { id: op.proposalId },
        data: { status: "undone" },
      });
      result.undone += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.operation.update({
        where: { id: op.id },
        data: { error: message },
      });
      result.failed += 1;
      result.error = `Operation ${op.id}: ${message}`;
      break;
    }
  }
  return result;
}

async function movePath(source: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(source, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    // cross-device: copy + remove (files only; dirs stay same-device in MVP)
    await fs.copyFile(source, dest);
    await fs.rm(source);
  }
}
