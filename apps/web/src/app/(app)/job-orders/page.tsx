import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { JobOrdersTable } from '@/features/job-orders/JobOrdersTable';

export default function JobOrdersPage() {
  return (
    <PageLayout>
      <PageHeader title="Job Orders" description="Live roles — linked to a client and an assigned consultant." />
      <JobOrdersTable />
    </PageLayout>
  );
}
