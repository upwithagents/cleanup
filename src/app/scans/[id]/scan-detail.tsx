"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Finding = { id: string; kind: string; payload: Record<string, unknown> };
type Proposal = {
  id: string;
  kind: string;
  sourcePath: string;
  destPath: string | null;
  rationale: string;
  origin: string;
  status: string;
};
type Scan = {
  id: string;
  targetPath: string;
  status: string;
  fileCount: number;
  totalBytes: number;
  skipped: string[];
  error: string | null;
  findings: Finding[];
  proposals: Proposal[];
};
type PlanInfo = { heuristic: number; llm: number; dropped: number; llmError?: string };
type ApplyInfo = { batchId: string; applied: number; failed: number; error?: string };

const FINDING_LABELS: Record<string, string> = {
  duplicate_set: "Duplicates",
  huge_file: "Huge files",
  stale_file: "Stale files (untouched > 1 year)",
  type_mess: "Loose files by type",
  empty_dir: "Empty directories",
};

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function ScanDetail({ scanId }: { scanId: string }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [applyInfo, setApplyInfo] = useState<ApplyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch(`/api/scans/${scanId}`);
    if (!response.ok) {
      setError("Scan not found");
      return;
    }
    const data = await response.json();
    setScan(data.scan);
  }, [scanId]);

  useEffect(() => {
    // state updates happen only after the fetch resolves, never synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  useEffect(() => {
    if (scan?.status !== "running") return;
    const timer = setInterval(() => void reload(), 2000);
    return () => clearInterval(timer);
  }, [scan?.status, reload]);

  async function act(input: RequestInfo, init?: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(input, init);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Request failed");
        return null;
      }
      return data;
    } catch {
      setError("Could not reach the CleanUp server");
      return null;
    } finally {
      setBusy(false);
      void reload();
    }
  }

  async function generatePlan() {
    const data = await act(`/api/scans/${scanId}/plan`, { method: "POST" });
    if (data) setPlanInfo(data.result);
  }

  async function setStatus(ids: string[], status: "approved" | "rejected") {
    await act("/api/proposals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
  }

  async function apply() {
    const approved = scan?.proposals.filter((p) => p.status === "approved") ?? [];
    if (
      !window.confirm(
        `Apply ${approved.length} approved proposal(s)? Files are moved or ` +
          "backed up — never deleted — and every change can be undone.",
      )
    )
      return;
    const data = await act(`/api/scans/${scanId}/apply`, { method: "POST" });
    if (data) setApplyInfo(data.result);
  }

  async function undo() {
    const data = await act(`/api/scans/${scanId}/undo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(applyInfo ? { batchId: applyInfo.batchId } : {}),
    });
    if (data) setApplyInfo(null);
  }

  if (!scan) return <p className="muted">{error ?? "Loading…"}</p>;

  const proposals = scan.proposals;
  const approvedCount = proposals.filter((p) => p.status === "approved").length;
  const appliedCount = proposals.filter((p) => p.status === "applied").length;
  const grouped = Object.entries(
    scan.findings.reduce<Record<string, Finding[]>>((acc, f) => {
      (acc[f.kind] ??= []).push(f);
      return acc;
    }, {}),
  );

  return (
    <>
      <p>
        <Link href="/">← All scans</Link>
      </p>
      <h1>
        <code>{scan.targetPath}</code>
      </h1>
      <p className="muted">
        {scan.status === "running" && "Scanning… (refreshes automatically)"}
        {scan.status === "completed" &&
          `${scan.fileCount} files, ${formatBytes(scan.totalBytes)}` +
            (scan.skipped.length > 0
              ? ` — ${scan.skipped.length} unreadable path(s) skipped`
              : "")}
        {scan.status === "failed" && `Scan failed: ${scan.error}`}
      </p>
      {error && <p className="error">{error}</p>}

      {scan.status === "completed" && (
        <>
          <h2>Findings</h2>
          {grouped.length === 0 && (
            <p className="muted">Nothing noteworthy — this folder looks tidy.</p>
          )}
          {grouped.map(([kind, findings]) => (
            <details key={kind} open={kind === "duplicate_set"}>
              <summary>
                {FINDING_LABELS[kind] ?? kind} ({findings.length})
              </summary>
              <ul>
                {findings.map((f) => (
                  <li key={f.id}>
                    <FindingView kind={kind} payload={f.payload} />
                  </li>
                ))}
              </ul>
            </details>
          ))}

          <h2>Proposals</h2>
          <p>
            <button onClick={generatePlan} disabled={busy}>
              {proposals.length > 0 ? "Regenerate plan" : "Generate plan"}
            </button>{" "}
            {planInfo && (
              <span className="muted">
                {planInfo.heuristic} heuristic + {planInfo.llm} LLM proposals
                {planInfo.dropped > 0 && `, ${planInfo.dropped} invalid dropped`}
              </span>
            )}
          </p>
          {planInfo?.llmError && (
            <p className="error">
              LLM plan failed ({planInfo.llmError}) — heuristic proposals are
              still available below.
            </p>
          )}

          {proposals.length > 0 && (
            <>
              <p>
                <button
                  onClick={() =>
                    setStatus(
                      proposals
                        .filter((p) => p.status === "proposed")
                        .map((p) => p.id),
                      "approved",
                    )
                  }
                  disabled={busy || proposals.every((p) => p.status !== "proposed")}
                >
                  Approve all pending
                </button>{" "}
                <button
                  className="primary"
                  onClick={apply}
                  disabled={busy || approvedCount === 0}
                >
                  Apply {approvedCount} approved
                </button>{" "}
                {(applyInfo || appliedCount > 0) && (
                  <button className="danger" onClick={undo} disabled={busy}>
                    Undo last apply
                  </button>
                )}
              </p>
              {applyInfo && (
                <p className={applyInfo.failed > 0 ? "error" : "muted"}>
                  Applied {applyInfo.applied}, failed {applyInfo.failed}
                  {applyInfo.error && ` — ${applyInfo.error}`}
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>File</th>
                    <th>Why</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.kind}
                        {p.destPath && (
                          <>
                            {" → "}
                            <code>{p.destPath}</code>
                          </>
                        )}
                      </td>
                      <td>
                        <code>{p.sourcePath}</code>
                      </td>
                      <td>
                        {p.rationale}{" "}
                        <span className={`badge ${p.origin}`}>{p.origin}</span>
                      </td>
                      <td>{p.status}</td>
                      <td>
                        {(p.status === "proposed" || p.status === "rejected") && (
                          <button
                            onClick={() => setStatus([p.id], "approved")}
                            disabled={busy}
                          >
                            Approve
                          </button>
                        )}{" "}
                        {(p.status === "proposed" || p.status === "approved") && (
                          <button
                            onClick={() => setStatus([p.id], "rejected")}
                            disabled={busy}
                          >
                            Reject
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}

function FindingView({
  kind,
  payload,
}: {
  kind: string;
  payload: Record<string, unknown>;
}) {
  if (kind === "duplicate_set") {
    const paths = payload.paths as string[];
    return (
      <span>
        {paths.length}× identical ({formatBytes(payload.size as number)}):{" "}
        <code>{paths.join(", ")}</code>
      </span>
    );
  }
  if (kind === "huge_file") {
    return (
      <span>
        <code>{payload.path as string}</code> (
        {formatBytes(payload.size as number)})
      </span>
    );
  }
  if (kind === "stale_file") {
    const files = payload.files as { path: string }[];
    return (
      <span>
        {files.length} file(s), e.g.{" "}
        <code>
          {files
            .slice(0, 3)
            .map((f) => f.path)
            .join(", ")}
        </code>
      </span>
    );
  }
  if (kind === "type_mess") {
    const paths = payload.paths as string[];
    return (
      <span>
        {paths.length} loose {payload.category as string} in the folder root
      </span>
    );
  }
  if (kind === "empty_dir") {
    const paths = payload.paths as string[];
    return <code>{paths.join(", ")}</code>;
  }
  return <code>{JSON.stringify(payload)}</code>;
}
