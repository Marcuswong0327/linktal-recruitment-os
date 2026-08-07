import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CompaniesTable } from '@/features/companies/CompaniesTable';

export default async function CompaniesPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Companies" description="Every client company — filter, sort and manage the relationship." />
      {hasPermission(session, 'client', 'read') ? (
        <CompaniesTable
          canCreate={hasPermission(session, 'client', 'create')}
          canUpdate={hasPermission(session, 'client', 'update')}
          canDelete={hasPermission(session, 'client', 'delete')}
        />
      ) : (
        <AccessDenied resource="companies" />
      )}
    </PageLayout>
  );
}
