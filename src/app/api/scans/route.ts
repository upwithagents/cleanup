import { NextRequest, NextResponse } from "next/server";
import {
  listScans,
  startScan,
  startScanInBackground,
  validateScanRoot,
} from "@/core/service";

export async function GET() {
  return NextResponse.json({ scans: await listScans() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const targetPath = body?.targetPath;
  if (typeof targetPath !== "string" || targetPath.length === 0) {
    return NextResponse.json({ error: "targetPath is required" }, { status: 400 });
  }
  const validated = validateScanRoot(targetPath);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { scanId } = await startScan(validated.path);
  startScanInBackground(scanId);
  return NextResponse.json({ scanId }, { status: 201 });
}
