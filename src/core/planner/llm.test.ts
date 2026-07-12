import { describe, expect, it } from "vitest";
import type { FindingDraft } from "@/core/types";
import { llmProposals } from "@/core/planner/llm";

const ROOT = "/scan/root";

const findings: FindingDraft[] = [
  {
    kind: "type_mess",
    payload: {
      category: "images",
      paths: [`${ROOT}/shot1.png`, `${ROOT}/shot2.png`],
    },
  },
];

describe("llmProposals", () => {
  it("parses fenced JSON into validated proposals", async () => {
    const complete = async () =>
      '```json\n[{"kind":"move","source":"' +
      `${ROOT}/shot1.png","dest":"${ROOT}/images/shot1.png","rationale":"Group screenshots"}]\n` +
      "```";
    const { proposals, dropped } = await llmProposals(findings, ROOT, complete);
    expect(dropped).toBe(0);
    expect(proposals).toEqual([
      {
        kind: "move",
        sourcePath: `${ROOT}/shot1.png`,
        destPath: `${ROOT}/images/shot1.png`,
        rationale: "Group screenshots",
        origin: "llm",
      },
    ]);
  });

  it("drops items with dest outside root or unknown source", async () => {
    const complete = async () =>
      JSON.stringify([
        {
          kind: "move",
          source: `${ROOT}/shot1.png`,
          dest: "/etc/evil.png",
          rationale: "escape",
        },
        {
          kind: "move",
          source: `${ROOT}/not-in-findings.png`,
          dest: `${ROOT}/images/x.png`,
          rationale: "hallucinated",
        },
        {
          kind: "shred",
          source: `${ROOT}/shot2.png`,
          dest: `${ROOT}/images/y.png`,
          rationale: "bad kind",
        },
      ]);
    const { proposals, dropped } = await llmProposals(findings, ROOT, complete);
    expect(proposals).toEqual([]);
    expect(dropped).toBe(3);
  });

  it("throws a clear error on unparseable output", async () => {
    const complete = async () => "I think you should tidy up a bit!";
    await expect(llmProposals(findings, ROOT, complete)).rejects.toThrow(
      /did not return valid JSON/,
    );
  });
});
