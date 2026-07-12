import { ScanDetail } from "@/app/scans/[id]/scan-detail";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ScanDetail scanId={id} />;
}
