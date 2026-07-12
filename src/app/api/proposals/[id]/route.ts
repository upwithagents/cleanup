import { NextRequest, NextResponse } from "next/server";
import { setProposalStatus } from "@/core/service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "Body must be {status: 'approved'|'rejected'}" },
      { status: 400 },
    );
  }
  const updated = await setProposalStatus([id], status);
  if (updated === 0) {
    return NextResponse.json(
      { error: "Proposal not found or no longer editable" },
      { status: 409 },
    );
  }
  return NextResponse.json({ updated });
}
