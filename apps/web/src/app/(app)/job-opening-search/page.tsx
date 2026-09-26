import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { JobResearchSearchGate } from '@/features/job-research/JobResearchSearchGate';

export default async function JobOpeningSearchPage() {
  const session = await auth();

  return (
    <PageLayout>
      {hasPermission(session, 'job_research', 'read') ? (
        <JobResearchSearchGate canCreate={hasPermission(session, 'job_research', 'create')} />
      ) : (
        <AccessDenied resource="job opening search" />
      )}
    </PageLayout>
  );
}
