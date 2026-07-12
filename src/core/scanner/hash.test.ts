import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FileEntry } from "@/core/types";
import { hashDuplicateCandidates } from "@/core/scanner/hash";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-hash-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function entry(name: string, content: string): FileEntry {
  const p = path.join(root, name);
  fs.writeFileSync(p, content);
  const st = fs.statSync(p);
  return { path: p, size: st.size, mtimeMs: st.mtimeMs, ext: "" };
}

describe("hashDuplicateCandidates", () => {
  it("hashes only files sharing a size, identical content shares hash", async () => {
    const a = entry("a", "same-content");
    const b = entry("b", "same-content");
    const c = entry("c", "diff-content"); // same size as a and b
    const unique = entry("d", "totally different length here");

    const hashes = await hashDuplicateCandidates([a, b, c, unique]);

    expect(hashes.get(a.path)).toBeDefined();
    expect(hashes.get(a.path)).toBe(hashes.get(b.path));
    expect(hashes.get(c.path)).toBeDefined();
    expect(hashes.get(c.path)).not.toBe(hashes.get(a.path));
    expect(hashes.has(unique.path)).toBe(false);
  });
});
