import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { StakeholderEnrichmentWorkspace } from '@/features/stakeholders/StakeholderEnrichmentWorkspace';

export default async function StakeholderEnrichmentPage({
  searchParams,
}: {
  searchParams: Promise<{ clientIds?: string; from?: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, 'stakeholder', 'read')) {
    return (
      <PageLayout>
        <AccessDenied resource="stakeholders" />
      </PageLayout>
    );
  }

  const { clientIds: clientIdsParam } = await searchParams;
  const clientIds = (clientIdsParam ?? '').split(',').filter(Boolean);

  if (clientIds.length === 0) {
    return (
      <PageLayout>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold">No companies selected</h1>
          <p className="text-sm text-muted-foreground">
            Select one or more companies (or Job Research rows) and choose &quot;Enrich Stakeholders&quot; to open
            this workspace.
          </p>
        </div>
      </PageLayout>
    );
  }

  return (
    <StakeholderEnrichmentWorkspace
      clientIds={clientIds}
      canUpdate={hasPermission(session, 'stakeholder', 'update')}
    />
  );
}
