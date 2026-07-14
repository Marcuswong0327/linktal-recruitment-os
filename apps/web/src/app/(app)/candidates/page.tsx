import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CandidatesTable } from '@/features/candidates/CandidatesTable';

export default async function CandidatesPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Candidates" description="Your talent pool — screening status, salary and availability." />
      {hasPermission(session, 'candidate', 'read') ? (
        <CandidatesTable
          canCreate={hasPermission(session, 'candidate', 'create')}
          canDelete={hasPermission(session, 'candidate', 'delete')}
        />
      ) : (
        <AccessDenied resource="candidates" />
      )}
    </PageLayout>
  );
}
