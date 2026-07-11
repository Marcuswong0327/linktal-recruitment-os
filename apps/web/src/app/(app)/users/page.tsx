import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { UsersTable } from '@/features/users/UsersTable';

export default function UsersPage() {
  return (
    <PageLayout>
      <PageHeader title="Users" description="Manage different users inside the workspace" />
      <UsersTable />
    </PageLayout>
  );
}
