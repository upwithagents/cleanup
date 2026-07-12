"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ScanForm() {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetPath: path }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Scan failed to start");
        return;
      }
      router.push(`/scans/${data.scanId}`);
    } catch {
      setError("Could not reach the CleanUp server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem" }}>
      <input
        type="text"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="~/Downloads"
        aria-label="Folder to scan"
      />
      <button className="primary" disabled={busy || path.length === 0}>
        {busy ? "Starting…" : "Scan folder"}
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}
