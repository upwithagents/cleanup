import { describe, expect, it } from "vitest";
import type { FindingDraft } from "@/core/types";
import { heuristicProposals } from "@/core/planner/heuristic";

const ROOT = "/scan/root";

describe("heuristicProposals", () => {
  it("trashes all but the newest duplicate", () => {
    const findings: FindingDraft[] = [
      {
        kind: "duplicate_set",
        payload: {
          paths: [`${ROOT}/new.txt`, `${ROOT}/old.txt`, `${ROOT}/older.txt`],
          size: 10,
          hash: "abc",
        },
      },
    ];
    const proposals = heuristicProposals(findings, ROOT);
    expect(proposals).toHaveLength(2);
    expect(proposals.map((p) => p.sourcePath)).toEqual([
      `${ROOT}/old.txt`,
      `${ROOT}/older.txt`,
    ]);
    for (const p of proposals) {
      expect(p.kind).toBe("trash");
      expect(p.destPath).toBeNull();
      expect(p.origin).toBe("heuristic");
      expect(p.rationale).toContain("new.txt");
    }
  });

  it("trashes empty directories", () => {
    const findings: FindingDraft[] = [
      { kind: "empty_dir", payload: { paths: [`${ROOT}/empty`] } },
    ];
    const proposals = heuristicProposals(findings, ROOT);
    expect(proposals).toEqual([
      {
        kind: "trash",
        sourcePath: `${ROOT}/empty`,
        destPath: null,
        rationale: "Empty directory",
        origin: "heuristic",
      },
    ]);
  });

  it("produces nothing for insight-only findings", () => {
    const findings: FindingDraft[] = [
      { kind: "huge_file", payload: { path: `${ROOT}/big.mov`, size: 1 } },
      { kind: "stale_file", payload: { files: [] } },
      { kind: "type_mess", payload: { category: "images", paths: [] } },
    ];
    expect(heuristicProposals(findings, ROOT)).toEqual([]);
  });
});
