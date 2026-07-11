import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { CompaniesTable } from '@/features/companies/CompaniesTable';

export default function CompaniesPage() {
  return (
    <PageLayout>
      <PageHeader title="Companies" description="Client accounts, relationship status and terms of business." />
      <CompaniesTable />
    </PageLayout>
  );
}
