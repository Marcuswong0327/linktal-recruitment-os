'use client';

import * as React from 'react';
import { Briefcase, Globe, MapPin, Tag, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMeQueryKey,
  useGetMe,
  useUpdateMe,
} from '@/lib/api/generated/consultants/consultants';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Eyebrow, ProfileField } from '@/components/ProfileField';
import { mockProfile } from '@/config/mock-profile';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileCard({
  avatar,
  fallbackName,
  fallbackEmail,
  fallbackRoleName,
}: {
  avatar?: string;
  fallbackName: string;
  fallbackEmail: string;
  fallbackRoleName?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: response } = useGetMe();
  const consultant = response?.status === 200 ? response.data : undefined;

  const name = consultant?.fullName ?? fallbackName;
  const email = consultant?.email ?? fallbackEmail;
  const roleName = consultant?.role?.name ?? fallbackRoleName;

  // Kept in sync with `name` (via the effect below) so the field always
  // reflects the latest fetched/saved value, but stays independently
  // editable while the user is typing.
  const [nameDraft, setNameDraft] = React.useState(name);
  React.useEffect(() => {
    setNameDraft(name);
  }, [name]);

  const updateMe = useUpdateMe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast.success('Name updated');
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to update name');
        setNameDraft(name);
      },
    },
  });

  const isDirty = nameDraft.trim() !== '' && nameDraft.trim() !== name;
  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setNameDraft(name);
      return;
    }
    updateMe.mutate({ data: { fullName: trimmed } });
  }

  return (
    <>
      <Card className="relative max-w-3xl">
        {roleName ? (
          <Badge className="absolute top-5 right-5 capitalize">{roleName}</Badge>
        ) : (
          <Badge variant="muted" className="absolute top-5 right-5">
            No role assigned
          </Badge>
        )}

        <CardHeader className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-1 pr-24">
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveName();
                    e.currentTarget.blur();
                  }
                  if (e.key === 'Escape') {
                    setNameDraft(name);
                    e.currentTarget.blur();
                  }
                }}
                disabled={updateMe.isPending}
                aria-label="Your name"
                className={`-mx-1.5 rounded-md border bg-transparent px-1.5 py-0.5 font-heading text-base font-semibold text-foreground outline-none transition-colors hover:border-border focus:border-primary focus:bg-input/50 focus:ring-3 focus:ring-primary/25 disabled:opacity-50 ${
                  isDirty ? 'border-warning/50 bg-warning/5' : 'border-transparent'
                }`}
              />
              {isDirty && (
                <Badge variant="warning" title="Press Enter to save, Escape to discard">
                  <TriangleAlert />
                  Unsaved
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex flex-wrap items-center gap-6">
          <ProfileField icon={Globe} label="Country" value={mockProfile.country} />
          <Separator orientation="vertical" />
          <ProfileField icon={Briefcase} label="Industry" value={mockProfile.industry} />
          <Separator orientation="vertical" />
          <ProfileField icon={Tag} label="Specialization" value={mockProfile.specialization} />
          <Separator orientation="vertical" />
          <ProfileField icon={MapPin} label="City" value={mockProfile.city} />
        </CardContent>

        <Separator />

        <CardContent className="flex flex-wrap items-center gap-6 text-center">
          <div className="flex flex-1 flex-col">
            <Eyebrow>Consultant ID</Eyebrow>
            <p className="mt-1 font-mono text-sm text-foreground">{consultant?.displayId ?? '—'}</p>
          </div>
          <Separator orientation="vertical" />
          <div className="flex flex-1 flex-col">
            <Eyebrow>Status</Eyebrow>
            <div className="mt-1">
              {consultant ? (
                <Badge variant={consultant.isActive ? 'success' : 'muted'}>
                  {consultant.isActive ? 'Active' : 'Inactive'}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
          <Separator orientation="vertical" />
          <div className="flex flex-1 flex-col">
            <Eyebrow>Member Since</Eyebrow>
            <p className="mt-1 text-sm text-foreground">
              {consultant ? new Date(consultant.createdAt).toLocaleDateString() : '—'}
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={promptOpen} onOpenChange={(open) => !open && cancelLeave()}>
        <AlertDialogContent>
          <AlertDialogHeader icon={TriangleAlert} iconVariant="warning">
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved name change. Leaving now will discard it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
