import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CompanyDetail } from '@/features/companies/CompanyDetail';

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!hasPermission(session, 'client', 'read')) {
    return (
      <PageLayout>
        <AccessDenied resource="companies" />
      </PageLayout>
    );
  }

  const { id } = await params;
  return <CompanyDetail id={id} />;
}
