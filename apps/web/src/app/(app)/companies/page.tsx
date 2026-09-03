import { auth } from '@/auth';
import { AccessDenied } from '@/components/app-shell/AccessDenied';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { hasPermission } from '@/lib/auth/permissions';
import { CompaniesSearchGate } from '@/features/companies/CompaniesSearchGate';

export default async function CompaniesPage() {
  const session = await auth();

  return (
    <PageLayout>
      <PageHeader title="Companies" />
      {hasPermission(session, 'client', 'read') ? (
        <CompaniesSearchGate
          canCreate={hasPermission(session, 'client', 'create')}
          canUpdate={hasPermission(session, 'client', 'update')}
          canDelete={hasPermission(session, 'client', 'delete')}
          // Gates the Specialization cell's "+ Create" — admin/manager always,
          // and consultants once granted (docs/rbac-roles.md §"specialization").
          canCreateSpecialization={hasPermission(session, 'specialization', 'create')}
        />
      ) : (
        <AccessDenied resource="companies" />
      )}
    </PageLayout>
  );
}
