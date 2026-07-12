import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CandidateDetail } from '@/features/candidates/CandidateDetail';

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ displayId: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, 'candidate', 'read')) {
    return (
      <PageLayout>
        <AccessDenied resource="candidates" />
      </PageLayout>
    );
  }

  const { displayId } = await params;
  return <CandidateDetail displayId={displayId} />;
}
