import path from "node:path";
import type { FindingDraft, ProposalDraft } from "@/core/types";

/** Deterministic proposals derived straight from findings — no LLM. */
export function heuristicProposals(
  findings: FindingDraft[],
  _root: string,
): ProposalDraft[] {
  const proposals: ProposalDraft[] = [];

  for (const finding of findings) {
    if (finding.kind === "duplicate_set") {
      const { paths } = finding.payload as { paths: string[] };
      const [keep, ...rest] = paths; // newest first per heuristics contract
      for (const dup of rest) {
        proposals.push({
          kind: "trash",
          sourcePath: dup,
          destPath: null,
          rationale: `Exact duplicate of ${path.basename(keep)} (kept)`,
          origin: "heuristic",
        });
      }
    } else if (finding.kind === "empty_dir") {
      const { paths } = finding.payload as { paths: string[] };
      for (const dir of paths) {
        proposals.push({
          kind: "trash",
          sourcePath: dir,
          destPath: null,
          rationale: "Empty directory",
          origin: "heuristic",
        });
      }
    }
    // huge_file / stale_file / type_mess are insight-only here:
    // what to do with them is a judgment call left to the LLM pass
  }

  return proposals;
}
