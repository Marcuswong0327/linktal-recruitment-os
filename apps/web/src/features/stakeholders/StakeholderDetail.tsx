'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Contact, CornerDownLeft, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LogContactSheet, type LogContactValues } from '@/components/LogContactSheet';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { useCreateJobTitle, useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';
import {
  useCreateStakeholderRoleType,
  useGetStakeholderRoleTypes,
} from '@/lib/api/generated/stakeholder-role-types/stakeholder-role-types';
import {
  getGetStakeholderQueryKey,
  getGetStakeholdersQueryKey,
  useAddStakeholderContactHistory,
  useDeleteStakeholder,
  useGetStakeholder,
  useUpdateStakeholder,
} from '@/lib/api/generated/stakeholders/stakeholders';
import type {
  CreateStakeholderContactHistoryDto,
  StakeholderEntity,
  UpdateStakeholderDto,
} from '@/lib/api/generated/types';
import { accuracyOptions, accuracyValue, formatDate, roleTypeStyle } from './columns';
import { stakeholderFullName } from './schema';

function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function StakeholderDetail({
  id,
  canEdit = true,
  canDelete = true,
}: {
  id: string;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { data, isLoading, isError, error } = useGetStakeholder(id);
  const stakeholder = data?.status === 200 ? data.data : undefined;

  if (isLoading) {
    return (
      <PageLayout>
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageLayout>
    );
  }

  if (isError || !stakeholder) {
    return (
      <PageLayout>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold">Stakeholder not found</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : `No stakeholder with ID ${id}.`}
          </p>
        </div>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/stakeholders" />}>
            <ArrowLeft />
            Back to stakeholders
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount when a different stakeholder loads so local form state resets.
  return <StakeholderEditForm key={stakeholder.id} stakeholder={stakeholder} canEdit={canEdit} canDelete={canDelete} />;
}

function StakeholderEditForm({
  stakeholder,
  canEdit,
  canDelete,
}: {
  stakeholder: StakeholderEntity;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = React.useState(stakeholder.firstName ?? '');
  const [lastName, setLastName] = React.useState(stakeholder.lastName ?? '');
  const [jobTitleId, setJobTitleId] = React.useState(stakeholder.jobTitleId ?? '');
  const [roleTypeId, setRoleTypeId] = React.useState(stakeholder.stakeholderRoleTypeId ?? '');
  const [linkedinUrl, setLinkedinUrl] = React.useState(stakeholder.linkedinUrl ?? '');
  const [email, setEmail] = React.useState(stakeholder.email ?? '');
  const [mobile, setMobile] = React.useState(stakeholder.mobile ?? '');
  const [isAccurate, setIsAccurate] = React.useState<boolean | null>(stakeholder.isAccurate);
  const [inaccurateReason, setInaccurateReason] = React.useState(stakeholder.inaccurateReason ?? '');
  const [loggingContact, setLoggingContact] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const isDirty =
    firstName !== (stakeholder.firstName ?? '') ||
    lastName !== (stakeholder.lastName ?? '') ||
    jobTitleId !== (stakeholder.jobTitleId ?? '') ||
    roleTypeId !== (stakeholder.stakeholderRoleTypeId ?? '') ||
    linkedinUrl !== (stakeholder.linkedinUrl ?? '') ||
    email !== (stakeholder.email ?? '') ||
    mobile !== (stakeholder.mobile ?? '') ||
    isAccurate !== stakeholder.isAccurate ||
    inaccurateReason !== (stakeholder.inaccurateReason ?? '');

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty && canEdit);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetStakeholderQueryKey(stakeholder.id) });
    queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
  };

  const { data: jobTitleData } = useGetJobTitles({ take: 200 });
  const jobTitles = jobTitleData?.status === 200 ? jobTitleData.data : [];
  const jobTitleOptions = React.useMemo(() => jobTitles.map((j) => ({ id: j.id, name: j.name })), [jobTitles]);
  const createJobTitle = useCreateJobTitle();
  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add job title');
    queryClient.invalidateQueries({ queryKey: ['/job-titles'] });
    return res.data;
  }

  const { data: roleTypeData } = useGetStakeholderRoleTypes({ take: 200 });
  const roleTypeRows = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const roleTypeOptions = React.useMemo(
    () =>
      roleTypeRows.map((r, i) => ({
        id: r.id,
        name: r.name,
        triggerClassName: roleTypeStyle(i).triggerClassName,
      })),
    [roleTypeRows],
  );
  const createRoleType = useCreateStakeholderRoleType();
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    queryClient.invalidateQueries({ queryKey: ['/stakeholder-role-types'] });
    return res.data;
  }
  const currentRoleTypeIndex = roleTypeRows.findIndex((r) => r.id === stakeholder.stakeholderRoleTypeId);

  const updateStakeholder = useUpdateStakeholder({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Stakeholder updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update stakeholder'),
    },
  });

  const deleteStakeholder = useDeleteStakeholder();

  const addContactHistory = useAddStakeholderContactHistory({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Contact logged');
        setLoggingContact(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to log contact'),
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: UpdateStakeholderDto = {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      jobTitleId: jobTitleId || undefined,
      roleTypeId: roleTypeId || undefined,
      linkedinUrl: linkedinUrl || undefined,
      email: email || undefined,
      mobile: mobile || undefined,
      isAccurate: isAccurate ?? undefined,
      inaccurateReason: inaccurateReason || undefined,
    };
    updateStakeholder.mutate({ id: stakeholder.id, data });
  }

  function handleLogContact(values: LogContactValues) {
    addContactHistory.mutate({
      id: stakeholder.id,
      data: {
        contactType: values.contactType,
        contactedAt: values.contactedAt,
        ...(values.notes ? { notes: values.notes } : {}),
      } as unknown as CreateStakeholderContactHistoryDto,
    });
  }

  function handleDelete() {
    setDeleteConfirmOpen(false);
    const name = stakeholderFullName(stakeholder) || 'this contact';
    // No restore endpoint for Stakeholder — delayed mode: nothing is sent
    // to the server until the undo window elapses, so Undo is exact rather
    // than cosmetic. Navigate away immediately; the delete (or its
    // cancellation) happens in the background regardless of this page.
    deleteWithUndo({
      label: name,
      deleteFn: async () => {
        await deleteStakeholder.mutateAsync({ id: stakeholder.id });
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() }),
    });
    router.push('/stakeholders');
  }

  const currentAccuracy = accuracyOptions.find((o) => o.value === accuracyValue(stakeholder.isAccurate))!;
  const displayName = stakeholderFullName(stakeholder) || 'Unnamed contact';

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/stakeholders" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Stakeholders
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
              {initials(displayName)}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">{displayName}</h1>
                <Badge className={currentAccuracy.triggerClassName}>{currentAccuracy.label}</Badge>
                {stakeholder.roleType ? (
                  <Badge
                    className={
                      currentRoleTypeIndex >= 0 ? roleTypeStyle(currentRoleTypeIndex).triggerClassName : undefined
                    }
                  >
                    {stakeholder.roleType}
                  </Badge>
                ) : null}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {stakeholder.displayId} · {stakeholder.companyName ?? 'No company'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="lg" onClick={() => setLoggingContact(true)}>
              <Phone />
              Log contact
            </Button>
            {canDelete ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 />
                Delete
              </Button>
            ) : null}
            {canEdit ? (
              <div className="flex items-center gap-3">
                {isDirty && !updateStakeholder.isPending ? (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                ) : null}
                <Button type="submit" form="stakeholder-form" size="lg" disabled={updateStakeholder.isPending || !isDirty}>
                  {updateStakeholder.isPending ? (
                    'Saving…'
                  ) : (
                    <>
                      Save changes
                      {isDirty ? (
                        <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">
                          <CornerDownLeft className="size-2.5" />
                        </Kbd>
                      ) : null}
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <form id="stakeholder-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Contact className="size-4 text-muted-foreground" />
                  Contact
                </CardTitle>
                <CardDescription>Who they are and how to reach them.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="First name" htmlFor="firstName">
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Last name" htmlFor="lastName">
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Job title"
                  htmlFor="jobTitle"
                  description="The company's own words for the role."
                >
                  <CreatableCombobox
                    id="jobTitle"
                    value={jobTitleId}
                    onValueChange={setJobTitleId}
                    options={jobTitleOptions}
                    onCreate={handleCreateJobTitle}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Role type"
                  htmlFor="roleType"
                  description="Your classification of the contact's function."
                >
                  <CreatableCombobox
                    id="roleType"
                    value={roleTypeId}
                    onValueChange={setRoleTypeId}
                    options={roleTypeOptions}
                    onCreate={handleCreateRoleType}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Mobile" htmlFor="mobile">
                  <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={!canEdit} />
                </FormField>
                <FormField label="LinkedIn URL" htmlFor="linkedinUrl">
                  <Input
                    id="linkedinUrl"
                    type="url"
                    placeholder="https://…"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle>Details accuracy</CardTitle>
                <CardDescription>Whether this contact's information has been verified.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="Status" htmlFor="isAccurate">
                  <EnumSelect
                    id="isAccurate"
                    value={isAccurate === null ? 'unchecked' : String(isAccurate)}
                    onValueChange={(v) => setIsAccurate(v === 'unchecked' ? null : v === 'true')}
                    options={[
                      { value: 'unchecked', label: 'Unchecked' },
                      { value: 'true', label: 'Accurate' },
                      { value: 'false', label: 'Inaccurate' },
                    ]}
                    disabled={!canEdit}
                  />
                </FormField>
                {isAccurate === false ? (
                  <FormField label="What's wrong" htmlFor="inaccurateReason">
                    <textarea
                      id="inaccurateReason"
                      value={inaccurateReason}
                      onChange={(e) => setInaccurateReason(e.target.value)}
                      disabled={!canEdit}
                      className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                    />
                  </FormField>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Last contact</CardTitle>
                <CardDescription>Most recent logged contact — see "Log contact" to add another.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {stakeholder.lastContactedAt ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">When</span>
                      <span>{formatDate(stakeholder.lastContactedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Method</span>
                      <span>{stakeholder.lastContactType ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">By</span>
                      <span>{stakeholder.lastContactedBy ?? '—'}</span>
                    </div>
                    {stakeholder.lastContactNotes ? (
                      <p className="rounded-md bg-muted/50 p-2 text-muted-foreground">{stakeholder.lastContactNotes}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">No contact logged yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      <LogContactSheet
        open={loggingContact}
        onOpenChange={setLoggingContact}
        subjectLabel={displayName}
        isSaving={addContactHistory.isPending}
        onSave={handleLogContact}
      />

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${displayName}?`}
        description="This removes the stakeholder. You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleDelete}
      />

      <AlertDialog open={promptOpen} onOpenChange={(open) => !open && cancelLeave()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>Leaving now discards your unsaved changes to this stakeholder.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
