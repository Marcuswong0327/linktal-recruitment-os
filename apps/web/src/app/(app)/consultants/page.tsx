import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { ConsultantsTable } from '@/features/consultants/ConsultantsTable';

export default async function ConsultantsPage() {
  const session = await auth();
  // Managing consultants (role + active status) is admin-only IAM — gate on the role directly
  const isAdmin = session?.user?.roleName === 'admin';

  return (
    <PageLayout>
      <PageHeader title="Consultants" description="Manage Recruiters — Roles and Account Status." />
      {isAdmin ? <ConsultantsTable /> : <AccessDenied resource="consultants" />}
    </PageLayout>
  );
}
