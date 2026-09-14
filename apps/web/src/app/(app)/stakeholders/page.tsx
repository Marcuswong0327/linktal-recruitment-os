import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { StakeholdersSearchGate } from '@/features/stakeholders/StakeholdersSearchGate';

export default async function StakeholdersPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Stakeholders" />
      {hasPermission(session, 'stakeholder', 'read') ? (
        <StakeholdersSearchGate
          canCreate={hasPermission(session, 'stakeholder', 'create')}
          canUpdate={hasPermission(session, 'stakeholder', 'update')}
          canDelete={hasPermission(session, 'stakeholder', 'delete')}
        />
      ) : (
        <AccessDenied resource="stakeholders" />
      )}
    </PageLayout>
  );
}
