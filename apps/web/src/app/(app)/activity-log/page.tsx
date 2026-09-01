import { Suspense } from 'react';

import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { ActivityTable } from '@/features/audit/ActivityTable';

export default async function ActivityLogPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Activity Log" />
      {hasPermission(session, 'audit', 'read') ? (
        // Suspense boundary: ActivityTable seeds its filters from the query
        // string via useSearchParams, which Next requires be suspended so the
        // rest of the page can still be prerendered around it.
        <Suspense fallback={null}>
          <ActivityTable currentConsultantId={session?.user?.consultantId} />
        </Suspense>
      ) : (
        <AccessDenied resource="the activity log" />
      )}
    </PageLayout>
  );
}
