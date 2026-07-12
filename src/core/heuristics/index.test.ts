import { describe, expect, it } from "vitest";
import path from "node:path";
import type { FileEntry, WalkResult } from "@/core/types";
import { runHeuristics } from "@/core/heuristics";

const ROOT = "/scan/root";
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function file(rel: string, size: number, ageDays = 0): FileEntry {
  const rawExt = path.extname(rel);
  return {
    path: path.join(ROOT, rel),
    size,
    mtimeMs: NOW - ageDays * DAY,
    ext: rawExt ? rawExt.slice(1).toLowerCase() : "",
  };
}

function walkOf(files: FileEntry[], emptyDirs: string[] = []): WalkResult {
  return { files, emptyDirs, skipped: [] };
}

function run(
  files: FileEntry[],
  hashes = new Map<string, string>(),
  emptyDirs: string[] = [],
) {
  return runHeuristics(walkOf(files, emptyDirs), hashes, {
    root: ROOT,
    now: NOW,
  });
}

describe("duplicate_set", () => {
  it("groups same-size same-hash files, newest first", () => {
    const old = file("copy-old.txt", 10, 30);
    const fresh = file("copy-new.txt", 10, 1);
    const different = file("other.txt", 10, 5);
    const hashes = new Map([
      [old.path, "aaa"],
      [fresh.path, "aaa"],
      [different.path, "bbb"],
    ]);
    const findings = run([old, fresh, different], hashes);
    const dups = findings.filter((f) => f.kind === "duplicate_set");
    expect(dups).toHaveLength(1);
    expect(dups[0].payload).toEqual({
      paths: [fresh.path, old.path],
      size: 10,
      hash: "aaa",
    });
  });
});

describe("huge_file", () => {
  it("flags files at or above the threshold", () => {
    const huge = file("video.mov", 500 * 1024 * 1024);
    const small = file("doc.txt", 500 * 1024 * 1024 - 1);
    const findings = run([huge, small]);
    const hugs = findings.filter((f) => f.kind === "huge_file");
    expect(hugs).toHaveLength(1);
    expect(hugs[0].payload).toEqual({ path: huge.path, size: huge.size });
  });
});

describe("stale_file", () => {
  it("collects files older than 365 days into one finding", () => {
    const stale = file("old-report.pdf", 10, 400);
    const fresh = file("new-report.pdf", 20, 5);
    const findings = run([stale, fresh]);
    const stales = findings.filter((f) => f.kind === "stale_file");
    expect(stales).toHaveLength(1);
    expect(stales[0].payload).toEqual({
      files: [{ path: stale.path, mtimeMs: stale.mtimeMs }],
    });
  });

  it("emits no finding when nothing is stale", () => {
    const findings = run([file("a.txt", 1, 3)]);
    expect(findings.filter((f) => f.kind === "stale_file")).toHaveLength(0);
  });
});

describe("type_mess", () => {
  it("flags a category with >=8 loose files directly in root", () => {
    const screenshots = Array.from({ length: 8 }, (_, i) =>
      file(`Screenshot ${i}.png`, 100 + i),
    );
    const nested = file("sub/photo.png", 50);
    const findings = run([...screenshots, nested]);
    const mess = findings.filter((f) => f.kind === "type_mess");
    expect(mess).toHaveLength(1);
    expect(mess[0].payload).toEqual({
      category: "images",
      paths: screenshots.map((f) => f.path),
    });
  });

  it("does not flag 7 loose files", () => {
    const seven = Array.from({ length: 7 }, (_, i) =>
      file(`img${i}.png`, 100 + i),
    );
    expect(run(seven).filter((f) => f.kind === "type_mess")).toHaveLength(0);
  });
});

describe("empty_dir", () => {
  it("aggregates empty dirs into one finding", () => {
    const dirs = [path.join(ROOT, "empty1"), path.join(ROOT, "empty2")];
    const findings = run([], new Map(), dirs);
    const empties = findings.filter((f) => f.kind === "empty_dir");
    expect(empties).toHaveLength(1);
    expect(empties[0].payload).toEqual({ paths: dirs });
  });
});
