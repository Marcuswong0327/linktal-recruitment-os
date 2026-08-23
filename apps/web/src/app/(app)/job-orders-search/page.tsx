import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { JobResearchSearchGate } from '@/features/job-research/JobResearchSearchGate';

export default async function JobOrdersSearchPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Job Orders Search" description="Market research — job ads found online, filter and log the ones worth chasing." />
      {hasPermission(session, 'job_research', 'read') ? (
        <JobResearchSearchGate canCreate={hasPermission(session, 'job_research', 'create')} />
      ) : (
        <AccessDenied resource="job orders search" />
      )}
    </PageLayout>
  );
}
