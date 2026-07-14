import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { JobOrdersTable } from '@/features/job-orders/JobOrdersTable';

export default async function JobOrdersPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Job Orders" description="Live roles — linked to a client and an assigned consultant." />
      {hasPermission(session, 'job_order', 'read') ? (
        <JobOrdersTable
          canCreate={hasPermission(session, 'job_order', 'create')}
          canDelete={hasPermission(session, 'job_order', 'delete')}
        />
      ) : (
        <AccessDenied resource="job orders" />
      )}
    </PageLayout>
  );
}
