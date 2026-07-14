import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { ConsultantsTable } from '@/features/consultants/ConsultantsTable';

export default async function ConsultantsPage() {
  const session = await auth();
  // Managing consultants (role + active status) is admin-only IAM — gate on the
  // role directly now that the dedicated `user` permission has been retired.
  const isAdmin = session?.user?.roleName === 'admin';

  return (
    <PageLayout>
      <PageHeader title="Consultants" description="Manage recruiters — roles and account status." />
      {isAdmin ? <ConsultantsTable /> : <AccessDenied resource="consultants" />}
    </PageLayout>
  );
}
