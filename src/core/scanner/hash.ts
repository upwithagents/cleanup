import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { FileEntry } from "@/core/types";

/**
 * sha256 for files that share a size with at least one other file —
 * the only candidates that can be duplicates. Unique sizes are never read.
 */
export async function hashDuplicateCandidates(
  files: FileEntry[],
): Promise<Map<string, string>> {
  const bySize = new Map<number, FileEntry[]>();
  for (const f of files) {
    const group = bySize.get(f.size);
    if (group) group.push(f);
    else bySize.set(f.size, [f]);
  }

  const hashes = new Map<string, string>();
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    for (const f of group) {
      try {
        hashes.set(f.path, await sha256(f.path));
      } catch {
        // unreadable file: leave it unhashed; it simply won't join a dup set
      }
    }
  }
  return hashes;
}

function sha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
