import path from "node:path";

/**
 * Resolve `p` and require it to live inside `root`.
 * Returns the resolved absolute path, or null if it escapes.
 */
export function resolveWithinRoot(root: string, p: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(p);
  if (resolved === resolvedRoot) return resolved;
  if (resolved.startsWith(resolvedRoot + path.sep)) return resolved;
  return null;
}

export function backupsBaseDir(): string {
  return process.env.CLEANUP_BACKUPS_DIR || path.resolve("backups");
}

export function backupsDirFor(scanId: string): string {
  return path.join(backupsBaseDir(), scanId);
}
