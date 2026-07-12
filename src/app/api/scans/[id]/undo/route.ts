import { NextRequest, NextResponse } from "next/server";
import { undoBatch } from "@/core/executor/apply";
import { getScan, latestBatchId } from "@/core/service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const batchId = body?.batchId ?? (await latestBatchId(id));
  if (!batchId) {
    return NextResponse.json(
      { error: "Nothing to undo for this scan" },
      { status: 409 },
    );
  }
  return NextResponse.json({ result: await undoBatch(batchId) });
}
