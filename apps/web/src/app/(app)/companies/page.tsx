import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CompaniesTable } from '@/features/companies/CompaniesTable';

export default async function CompaniesPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Companies" description="Client accounts, relationship status and terms of business." />
      {hasPermission(session, 'client', 'read') ? (
        <CompaniesTable canCreate={hasPermission(session, 'client', 'create')} />
      ) : (
        <AccessDenied resource="companies" />
      )}
    </PageLayout>
  );
}
