import Link from "next/link";
import { listScans } from "@/core/service";
import { ScanForm } from "@/app/scan-form";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export default async function Home() {
  const scans = await listScans();
  return (
    <>
      <p className="muted">
        Scan a folder, review the proposed cleanup, apply it with backups —
        and undo if you change your mind.
      </p>
      <ScanForm />
      <h2>Scans</h2>
      {scans.length === 0 ? (
        <p className="muted">No scans yet. Point CleanUp at a folder above.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Folder</th>
              <th>Status</th>
              <th>Files</th>
              <th>Size</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={scan.id}>
                <td>
                  <Link href={`/scans/${scan.id}`}>
                    <code>{scan.targetPath}</code>
                  </Link>
                </td>
                <td>{scan.status}</td>
                <td>{scan.fileCount}</td>
                <td>{formatBytes(scan.totalBytes)}</td>
                <td>{new Date(scan.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
