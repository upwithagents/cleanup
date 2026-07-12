import path from "node:path";
import type { FileEntry, FindingDraft, WalkResult } from "@/core/types";

export type HeuristicOpts = {
  root: string;
  hugeBytes?: number;
  staleDays?: number;
  typeMessMin?: number;
  now?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HUGE_BYTES = 500 * 1024 * 1024;
const DEFAULT_STALE_DAYS = 365;
const DEFAULT_TYPE_MESS_MIN = 8;
const STALE_CAP = 500;

const CATEGORY_EXTS: Record<string, Set<string>> = {
  images: new Set(["png", "jpg", "jpeg", "gif", "heic", "webp", "svg"]),
  installers: new Set(["dmg", "pkg", "app"]),
  archives: new Set(["zip", "tar", "gz", "rar", "7z"]),
  documents: new Set(["pdf", "doc", "docx", "txt", "csv", "xls", "xlsx"]),
};

export function runHeuristics(
  walk: WalkResult,
  hashes: Map<string, string>,
  opts: HeuristicOpts,
): FindingDraft[] {
  const now = opts.now ?? Date.now();
  return [
    ...detectDuplicates(walk.files, hashes),
    ...detectHugeFiles(walk.files, opts.hugeBytes ?? DEFAULT_HUGE_BYTES),
    ...detectStaleFiles(walk.files, now, opts.staleDays ?? DEFAULT_STALE_DAYS),
    ...detectTypeMess(
      walk.files,
      opts.root,
      opts.typeMessMin ?? DEFAULT_TYPE_MESS_MIN,
    ),
    ...detectEmptyDirs(walk.emptyDirs),
  ];
}

function detectDuplicates(
  files: FileEntry[],
  hashes: Map<string, string>,
): FindingDraft[] {
  const byHash = new Map<string, FileEntry[]>();
  for (const f of files) {
    const hash = hashes.get(f.path);
    if (!hash) continue;
    const key = `${f.size}:${hash}`;
    const group = byHash.get(key);
    if (group) group.push(f);
    else byHash.set(key, [f]);
  }
  const findings: FindingDraft[] = [];
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const newestFirst = [...group].sort((a, b) => b.mtimeMs - a.mtimeMs);
    findings.push({
      kind: "duplicate_set",
      payload: {
        paths: newestFirst.map((f) => f.path),
        size: group[0].size,
        hash: hashes.get(group[0].path),
      },
    });
  }
  return findings;
}

function detectHugeFiles(files: FileEntry[], hugeBytes: number): FindingDraft[] {
  return files
    .filter((f) => f.size >= hugeBytes)
    .map((f) => ({
      kind: "huge_file" as const,
      payload: { path: f.path, size: f.size },
    }));
}

function detectStaleFiles(
  files: FileEntry[],
  now: number,
  staleDays: number,
): FindingDraft[] {
  const cutoff = now - staleDays * DAY_MS;
  const stale = files
    .filter((f) => f.mtimeMs < cutoff)
    .slice(0, STALE_CAP)
    .map((f) => ({ path: f.path, mtimeMs: f.mtimeMs }));
  if (stale.length === 0) return [];
  return [{ kind: "stale_file", payload: { files: stale } }];
}

function detectTypeMess(
  files: FileEntry[],
  root: string,
  min: number,
): FindingDraft[] {
  const loose = files.filter((f) => path.dirname(f.path) === root);
  const findings: FindingDraft[] = [];
  for (const [category, exts] of Object.entries(CATEGORY_EXTS)) {
    const matches = loose.filter((f) => exts.has(f.ext));
    if (matches.length >= min) {
      findings.push({
        kind: "type_mess",
        payload: { category, paths: matches.map((f) => f.path) },
      });
    }
  }
  return findings;
}

function detectEmptyDirs(emptyDirs: string[]): FindingDraft[] {
  if (emptyDirs.length === 0) return [];
  return [{ kind: "empty_dir", payload: { paths: emptyDirs } }];
}
