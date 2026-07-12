import type { FindingDraft, ProposalDraft } from "@/core/types";
import { resolveWithinRoot } from "@/core/executor/paths";

export type LlmComplete = (prompt: string) => Promise<string>;

/** Calls the Anthropic Messages API with the user-supplied key. */
export const anthropicComplete: LlmComplete = async (prompt) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLEANUP_MODEL || "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Anthropic API error ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    content: { type: string; text?: string }[];
  };
  const text = data.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Anthropic API returned no text content");
  return text;
};

export async function llmProposals(
  findings: FindingDraft[],
  root: string,
  complete: LlmComplete,
): Promise<{ proposals: ProposalDraft[]; dropped: number }> {
  const raw = await complete(buildPrompt(findings, root));
  const items = parseJsonArray(raw);

  const knownPaths = collectPaths(findings);
  const proposals: ProposalDraft[] = [];
  let dropped = 0;

  for (const item of items) {
    const draft = validateItem(item, root, knownPaths);
    if (draft) proposals.push(draft);
    else dropped += 1;
  }
  return { proposals, dropped };
}

function buildPrompt(findings: FindingDraft[], root: string): string {
  return [
    "You are a file-organization assistant. Based on the scan findings",
    `below for the folder ${root}, propose a reorganization plan.`,
    "",
    `Findings (paths and stats only): ${JSON.stringify(findings)}`,
    "",
    "Respond with ONLY a JSON array (no prose, no markdown) of items:",
    '{"kind": "move" | "archive", "source": "<absolute path from the findings>",',
    '"dest": "<absolute destination path>", "rationale": "<one short sentence>"}',
    "",
    `Rules: dest must stay under ${root} — use ${root}/_archive/ for archive`,
    "items. Only reference source paths that appear in the findings. Group",
    "loose files into sensibly named subfolders. Do not propose deletions.",
  ].join("\n");
}

function parseJsonArray(raw: string): unknown[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error("LLM did not return valid JSON — plan pass aborted");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("LLM did not return valid JSON array — plan pass aborted");
  }
  return parsed;
}

function collectPaths(findings: FindingDraft[]): Set<string> {
  const paths = new Set<string>();
  for (const f of findings) {
    const payload = f.payload as Record<string, unknown>;
    if (Array.isArray(payload.paths)) {
      for (const p of payload.paths) paths.add(String(p));
    }
    if (typeof payload.path === "string") paths.add(payload.path);
    if (Array.isArray(payload.files)) {
      for (const entry of payload.files) {
        const p = (entry as Record<string, unknown>).path;
        if (typeof p === "string") paths.add(p);
      }
    }
  }
  return paths;
}

function validateItem(
  item: unknown,
  root: string,
  knownPaths: Set<string>,
): ProposalDraft | null {
  if (typeof item !== "object" || item === null) return null;
  const { kind, source, dest, rationale } = item as Record<string, unknown>;
  if (kind !== "move" && kind !== "archive") return null;
  if (typeof source !== "string" || !knownPaths.has(source)) return null;
  if (typeof dest !== "string" || !resolveWithinRoot(root, dest)) return null;
  if (typeof rationale !== "string" || rationale.length === 0) return null;
  return {
    kind,
    sourcePath: source,
    destPath: dest,
    rationale,
    origin: "llm",
  };
}
