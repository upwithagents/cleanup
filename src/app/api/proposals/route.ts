import { NextRequest, NextResponse } from "next/server";
import { setProposalStatus } from "@/core/service";

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const ids = body?.ids;
  const status = body?.status;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    (status !== "approved" && status !== "rejected")
  ) {
    return NextResponse.json(
      { error: "Body must be {ids: string[], status: 'approved'|'rejected'}" },
      { status: 400 },
    );
  }
  const updated = await setProposalStatus(ids.map(String), status);
  return NextResponse.json({ updated });
}
