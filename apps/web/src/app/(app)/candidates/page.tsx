import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CandidateSearchGate } from '@/features/candidates/CandidateSearchGate';

export default async function CandidatesPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Candidates" description="Every candidate in scope — filter, sort and manage the pipeline." />
      {hasPermission(session, 'candidate', 'read') ? (
        <CandidateSearchGate
          canCreate={hasPermission(session, 'candidate', 'create')}
          canDelete={hasPermission(session, 'candidate', 'delete')}
          canUpdate={hasPermission(session, 'candidate', 'update')}
        />
      ) : (
        <AccessDenied resource="candidates" />
      )}
    </PageLayout>
  );
}
