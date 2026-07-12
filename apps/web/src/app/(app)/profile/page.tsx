import { User } from 'lucide-react';
import { auth } from '@/auth';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user;
  const name = user?.name ?? 'Unknown';
  const email = user?.email ?? '—';

  return (
    <PageLayout>
      <PageHeader icon={User} title="Profile" description="Your account details." />

      <Card className="max-w-xl">
        <CardHeader className="flex-row items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={user?.image ?? undefined} alt={name} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5">
            <CardTitle>{name}</CardTitle>
            <CardDescription>{email}</CardDescription>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex flex-col gap-4">
          <Field label="Role">
            {user?.roleName ? (
              <Badge className="capitalize">{user.roleName}</Badge>
            ) : (
              <Badge variant="muted">No role assigned</Badge>
            )}
          </Field>
          <Field label="Consultant ID">
            <span className="font-mono text-sm">{user?.consultantId ?? '—'}</span>
          </Field>
        </CardContent>
      </Card>
    </PageLayout>
  );
}
