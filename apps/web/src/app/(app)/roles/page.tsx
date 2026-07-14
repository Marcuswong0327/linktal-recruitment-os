import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { RolesTable } from '@/features/roles/RolesTable';

export default async function RolesPage() {
  const session = await auth();
  // Roles + permissions are admin-only IAM.
  const isAdmin = session?.user?.roleName === 'admin';

  return (
    <PageLayout>
      <PageHeader
        title="Roles"
        description="Define roles and the permissions they grant. Changes apply to everyone with the role."
      />
      {isAdmin ? <RolesTable /> : <AccessDenied resource="roles" />}
    </PageLayout>
  );
}
