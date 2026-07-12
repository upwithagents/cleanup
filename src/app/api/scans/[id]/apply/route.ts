import { NextRequest, NextResponse } from "next/server";
import { applyApproved } from "@/core/executor/apply";
import { getScan } from "@/core/service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ result: await applyApproved(id) });
}
