/**
 * Builds a playground folder at scans/fixture/ (gitignored) exercising every
 * heuristic: duplicate pair, huge (sparse) file, stale file, loose
 * screenshots, and an empty directory. Safe to re-run — recreates from
 * scratch.
 *
 * Run: npx tsx scripts/make-fixture.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "scans", "fixture");

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

// duplicate pair (one nested)
fs.writeFileSync(path.join(root, "report-final.pdf"), "identical-bytes");
fs.mkdirSync(path.join(root, "old-stuff"));
fs.writeFileSync(
  path.join(root, "old-stuff", "report-final copy.pdf"),
  "identical-bytes",
);

// huge file: sparse, so it doesn't actually consume 600 MB of disk
const huge = path.join(root, "raw-footage.mov");
const fd = fs.openSync(huge, "w");
fs.ftruncateSync(fd, 600 * 1024 * 1024);
fs.closeSync(fd);

// stale file: last touched two years ago
const stale = path.join(root, "meeting-notes-2024.txt");
fs.writeFileSync(stale, "old notes");
const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
fs.utimesSync(stale, twoYearsAgo, twoYearsAgo);

// ten loose screenshots in the root
for (let i = 1; i <= 10; i++) {
  fs.writeFileSync(path.join(root, `Screenshot ${i}.png`), `png-${i}`);
}

// empty directory
fs.mkdirSync(path.join(root, "empty-project"));

console.log(`Fixture ready at ${root}`);
