import fs from "node:fs/promises";
import path from "node:path";
import type { FileEntry, WalkResult } from "@/core/types";

const IGNORED_DIR_NAMES = new Set([".git", "node_modules", ".Trash"]);

export async function walk(root: string): Promise<WalkResult> {
  const result: WalkResult = { files: [], emptyDirs: [], skipped: [] };
  await walkDir(root, result, false);
  return result;
}

async function walkDir(
  dir: string,
  result: WalkResult,
  markEmptyDirs = true,
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    result.skipped.push(dir);
    return;
  }

  if (entries.length === 0 && markEmptyDirs) {
    result.emptyDirs.push(dir);
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      await walkDir(full, result);
    } else if (entry.isFile()) {
      try {
        const st = await fs.stat(full);
        const rawExt = path.extname(entry.name);
        result.files.push({
          path: full,
          size: st.size,
          mtimeMs: st.mtimeMs,
          ext: rawExt ? rawExt.slice(1).toLowerCase() : "",
        });
      } catch {
        result.skipped.push(full);
      }
    }
    // symlinks and other entry kinds are deliberately ignored: following
    // links could escape the scan root, which the executor must never do
  }
}
