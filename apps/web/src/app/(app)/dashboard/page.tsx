import { Briefcase, Globe, MapPin, Tag, User } from 'lucide-react';
import { auth } from '@/auth';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { CommandPaletteHintBanner } from '@/features/dashboard/CommandPaletteHintBanner';
import { Eyebrow, ProfileField } from '@/components/ProfileField';
import { mockProfile } from '@/config/mock-profile';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name ?? 'there';
  const roleName = session?.user?.roleName;

  return (
    <PageLayout>
      <PageHeader title="Dashboard" description={`Welcome back, ${name} 👋`} />

      <Card>
        <CardHeader className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-5" />
          </span>
          <CardTitle>Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="flex flex-1 flex-col gap-1.5">
            <Eyebrow>Name & Role</Eyebrow>
            <p className="text-xl font-bold text-foreground">{name}</p>
            {roleName ? (
              <Badge className="w-fit capitalize" variant="secondary">
                {roleName}
              </Badge>
            ) : null}
          </div>
          <Separator orientation="vertical" />
          <ProfileField icon={Globe} label="Country" value={mockProfile.country} />
          <Separator orientation="vertical" />
          <ProfileField icon={Briefcase} label="Industry" value={mockProfile.industry} />
          <Separator orientation="vertical" />
          <ProfileField icon={Tag} label="Specialization" value={mockProfile.specialization} />
          <Separator orientation="vertical" />
          <ProfileField icon={MapPin} label="City" value={mockProfile.city} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <CommandPaletteHintBanner />
      </div>
    </PageLayout>
  );
}
