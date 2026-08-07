import { auth } from '@/auth';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { CommandPaletteHintBanner } from '@/features/dashboard/CommandPaletteHintBanner';
import { ProfileSummaryCard } from '@/features/dashboard/ProfileSummaryCard';

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? 'there';
  const roleName = session?.user?.roleName;

  return (
    <PageLayout>
      <PageHeader title="Dashboard" description={`Welcome back, ${name} 👋`} />

      <ProfileSummaryCard fallbackName={name} fallbackRoleName={roleName} />

      <div className="flex flex-col gap-3">
        <CommandPaletteHintBanner />
      </div>
    </PageLayout>
  );
}
