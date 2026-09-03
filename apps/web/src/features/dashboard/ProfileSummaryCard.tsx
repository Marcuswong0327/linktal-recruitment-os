'use client';

import { Briefcase, MapPin, Tag, User } from 'lucide-react';
import { useGetMe } from '@/lib/api/generated/consultants/consultants';
import { Eyebrow, ProfileField, joinScopeNames } from '@/components/ProfileField';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export function ProfileSummaryCard({
  fallbackName,
  fallbackRoleName,
}: {
  fallbackName: string;
  fallbackRoleName?: string | null;
}) {
  const { data: response } = useGetMe();
  const consultant = response?.status === 200 ? response.data : undefined;

  const name = consultant?.fullName ?? fallbackName;
  const roleName = consultant?.role?.name ?? fallbackRoleName;

  return (
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
        <ProfileField icon={Briefcase} label="Industry" value={joinScopeNames(consultant?.industries)} />
        <Separator orientation="vertical" />
        <ProfileField icon={Tag} label="Specialization" value={joinScopeNames(consultant?.specializations)} />
        <Separator orientation="vertical" />
        <ProfileField icon={MapPin} label="City Coverage" value={joinScopeNames(consultant?.locations)} />
      </CardContent>
    </Card>
  );
}
