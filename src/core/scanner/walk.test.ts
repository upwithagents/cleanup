import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { walk } from "@/core/scanner/walk";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-walk-"));
});

afterEach(() => {
  fs.chmodSync(path.join(root, "locked"), 0o755);
  fs.rmSync(root, { recursive: true, force: true });
});

function seed() {
  fs.writeFileSync(path.join(root, "a.txt"), "hello");
  fs.mkdirSync(path.join(root, "sub"));
  fs.writeFileSync(path.join(root, "sub", "photo.JPG"), "xx");
  fs.writeFileSync(path.join(root, "sub", "noext"), "y");
  fs.mkdirSync(path.join(root, "empty"));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "node_modules", "ignored.js"), "zzz");
  fs.mkdirSync(path.join(root, "locked"));
  fs.writeFileSync(path.join(root, "locked", "secret.txt"), "s");
  fs.chmodSync(path.join(root, "locked"), 0o000);
}

describe("walk", () => {
  it("finds nested files with size, mtime and lowercased ext", async () => {
    seed();
    const result = await walk(root);
    const byName = Object.fromEntries(
      result.files.map((f) => [path.relative(root, f.path), f]),
    );
    expect(byName["a.txt"]).toMatchObject({ size: 5, ext: "txt" });
    expect(byName["sub/photo.JPG"]).toMatchObject({ size: 2, ext: "jpg" });
    expect(byName["sub/noext"]).toMatchObject({ ext: "" });
    expect(byName["a.txt"].mtimeMs).toBeGreaterThan(0);
  });

  it("skips ignored directory names entirely", async () => {
    seed();
    const result = await walk(root);
    const rels = result.files.map((f) => path.relative(root, f.path));
    expect(rels.some((r) => r.startsWith("node_modules"))).toBe(false);
  });

  it("collects empty dirs and records unreadable dirs as skipped", async () => {
    seed();
    const result = await walk(root);
    expect(result.emptyDirs).toEqual([path.join(root, "empty")]);
    expect(result.skipped).toEqual([path.join(root, "locked")]);
  });
});
