import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { StakeholderDetail } from '@/features/stakeholders/StakeholderDetail';

export default async function StakeholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, 'stakeholder', 'read')) {
    return (
      <PageLayout>
        <AccessDenied resource="stakeholders" />
      </PageLayout>
    );
  }

  const { id } = await params;
  const canEdit = hasPermission(session, 'stakeholder', 'update');
  const canDelete = hasPermission(session, 'stakeholder', 'delete');
  return <StakeholderDetail id={id} canEdit={canEdit} canDelete={canDelete} />;
}
