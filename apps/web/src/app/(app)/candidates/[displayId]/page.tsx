import { CandidateDetail } from '@/features/candidates/CandidateDetail';

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ displayId: string }>;
}) {
  const { displayId } = await params;
  return <CandidateDetail displayId={displayId} />;
}
