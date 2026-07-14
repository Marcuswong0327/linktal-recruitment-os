import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { JobOrderDetail } from '@/features/job-orders/JobOrderDetail';

export default async function JobOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, 'job_order', 'read')) {
    return (
      <PageLayout>
        <AccessDenied resource="job orders" />
      </PageLayout>
    );
  }

  const { id } = await params;
  return <JobOrderDetail id={id} />;
}
