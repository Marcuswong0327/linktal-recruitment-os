import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { ActivityTable } from '@/features/audit/ActivityTable';

export default async function ActivityLogPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader
        title="Activity Log"
        description="Who did what, and when — every create, update and delete across the system."
      />
      {hasPermission(session, 'audit', 'read') ? (
        <ActivityTable />
      ) : (
        <AccessDenied resource="the activity log" />
      )}
    </PageLayout>
  );
}
