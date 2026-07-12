import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { UsersTable } from '@/features/users/UsersTable';

export default async function UsersPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Users" description="Manage different users inside the workspace" />
      {hasPermission(session, 'user', 'read') ? (
        <UsersTable />
      ) : (
        <AccessDenied resource="users" />
      )}
    </PageLayout>
  );
}
