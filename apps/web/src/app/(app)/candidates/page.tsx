import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { CandidatesTable } from '@/features/candidates/CandidatesTable';

export default function CandidatesPage() {
  return (
    <PageLayout>
      <PageHeader title="Candidates" description="Your talent pool — screening status, salary and availability." />
      <CandidatesTable />
    </PageLayout>
  );
}
