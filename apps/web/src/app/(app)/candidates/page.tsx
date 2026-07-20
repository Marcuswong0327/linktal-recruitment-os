import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CandidateSearchGate } from '@/features/candidates/CandidateSearchGate';

export default async function CandidatesPage() {
  const session = await auth();

  return (
    <PageLayout>
      {hasPermission(session, 'candidate', 'read') ? (
        <CandidateSearchGate
          canCreate={hasPermission(session, 'candidate', 'create')}
          canDelete={hasPermission(session, 'candidate', 'delete')}
        />
      ) : (
        <AccessDenied resource="candidates" />
      )}
    </PageLayout>
  );
}
