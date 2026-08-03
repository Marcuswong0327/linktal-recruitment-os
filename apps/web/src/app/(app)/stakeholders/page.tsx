import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { StakeholdersTable } from '@/features/stakeholders/StakeholdersTable';

export default async function StakeholdersPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader
        title="Stakeholders"
        description="Every contact across your client companies — filter, sort and log outreach."
      />
      {hasPermission(session, 'stakeholder', 'read') ? (
        <StakeholdersTable
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
