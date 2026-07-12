import { NextRequest, NextResponse } from "next/server";
import { generatePlan, getScan } from "@/core/service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (scan.status !== "completed") {
    return NextResponse.json(
      { error: `Scan is ${scan.status}; plan needs a completed scan` },
      { status: 409 },
    );
  }
  return NextResponse.json({ result: await generatePlan(id) });
}
