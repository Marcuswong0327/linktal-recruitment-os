import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { NewJobOrderForm } from '@/features/job-orders/NewJobOrderForm';

export default async function NewJobOrderPage() {
  const session = await auth();
  if (!hasPermission(session, 'job_order', 'create')) {
    return (
      <PageLayout>
        <AccessDenied resource="job orders" />
      </PageLayout>
    );
  }

  return <NewJobOrderForm />;
}
