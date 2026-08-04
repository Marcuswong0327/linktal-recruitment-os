import { auth } from '@/auth';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { ProfileCard } from '@/features/profile/ProfileCard';

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user;

  return (
    <PageLayout>
      <PageHeader title="Profile" description="Your user account details." />

      <ProfileCard
        avatar={user?.image ?? undefined}
        fallbackName={user?.name ?? 'Unknown'}
        fallbackEmail={user?.email ?? '—'}
        fallbackRoleName={user?.roleName}
      />
    </PageLayout>
  );
}
