'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  CornerDownLeft,
  FileText,
  Mail,
  Phone,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Collapsible } from '@base-ui/react/collapsible';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LinkedinIcon } from '@/components/BrandIcons';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { useConsultantLookup } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import { LogContactRow, type LogContactValues } from '@/components/LogContactRow';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { cn } from '@/lib/utils';
import { useGetClientContactHistory } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { useCreateJobTitle } from '@/lib/api/generated/job-titles/job-titles';
import { useJobTitleOptions } from '@/hooks/use-catalog-options';
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
import {
  roleTypeStyle,
  stakeholderFullName,
  stakeholderStatusOptions,
  type StakeholderStatus,
} from './columns';

const contactDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Every contact logged against this stakeholder's client, across all of that
// client's stakeholders — capped at the API's max page size and filtered down
// to this one stakeholder client-side, since there's no per-stakeholder
// history endpoint (only the per-client aggregate CompanyDetail also reads).
const CONTACT_HISTORY_LIMIT = 200;

function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// The "Back" button normally returns to the Stakeholders list, but a
// stakeholder can also be reached from its Company's own Stakeholders card
// — in that case Back should return there instead of a list the visitor
// never opened. Origin comes in as `?from=company` on the link that brought
// them here, not browser history, so a page refresh or a bookmark keeps
// behaving the same way. Mirrors CompanyDetail's own useBackTarget.
function useBackTarget(stakeholder?: Pick<StakeholderEntity, 'clientId' | 'companyName'>) {
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  if (from === 'company' && stakeholder?.clientId) {
    return { href: `/companies/${stakeholder.clientId}`, label: stakeholder.companyName ?? 'Company' };
  }
  return { href: '/stakeholders', label: 'Stakeholders' };
}

/** One icon per contact method (Email/Mobile/LinkedIn) — click opens it (Mobile copies instead, see ContactCopyButton). A method with no value on file renders greyed-out and inert rather than being hidden, so the icon row's position doesn't shift. Mirrors CompanyDetail's LinkIconButton for its Website field. */
function ContactIconButton({
  icon: Icon,
  href,
  label,
  activeClassName = 'text-muted-foreground hover:text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  href?: string | null;
  label: string;
  activeClassName?: string;
}) {
  const disabled = !href;
  return (
    <a
      href={href ?? undefined}
      target={href && !href.startsWith('mailto:') ? '_blank' : undefined}
      rel="noopener noreferrer"
      aria-disabled={disabled}
      onClick={disabled ? (e) => e.preventDefault() : undefined}
      title={disabled ? `No ${label.toLowerCase()} on file` : label}
      aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Open ${label.toLowerCase()}`}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'cursor-not-allowed text-muted-foreground'
          : cn(activeClassName, 'hover:bg-accent'),
      )}
    >
      <Icon className={cn('size-4', disabled && 'opacity-30 grayscale')} />
    </a>
  );
}

function copyValue(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Couldn't copy ${label.toLowerCase()}`),
  );
}

/** Same look as ContactIconButton, but copies to the clipboard instead of navigating — for Mobile, which has no useful direct-interact link (no tel: dialer on desktop). */
function ContactCopyButton({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string | null;
  label: string;
}) {
  const disabled = !value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => value && copyValue(value, label)}
      title={disabled ? `No ${label.toLowerCase()} on file` : `Copy ${label.toLowerCase()}`}
      aria-label={disabled ? `No ${label.toLowerCase()} on file` : `Copy ${label.toLowerCase()}`}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        disabled ? 'cursor-not-allowed' : 'hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className={cn('size-4', disabled && 'opacity-30 grayscale')} />
    </button>
  );
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
  const backTarget = useBackTarget(stakeholder);

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
          <Button variant="outline" nativeButton={false} render={<Link href={backTarget.href} />}>
            <ArrowLeft />
            Back to {backTarget.label.toLowerCase()}
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount when a different stakeholder loads so local form state resets.
  return (
    <StakeholderEditForm
      key={stakeholder.id}
      stakeholder={stakeholder}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
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
  const backTarget = useBackTarget(stakeholder);

  const [firstName, setFirstName] = React.useState(stakeholder.firstName ?? '');
  const [lastName, setLastName] = React.useState(stakeholder.lastName ?? '');
  const [jobTitleId, setJobTitleId] = React.useState(stakeholder.jobTitleId ?? '');
  const [roleTypeId, setRoleTypeId] = React.useState(stakeholder.stakeholderRoleTypeId ?? '');
  const [linkedinUrl, setLinkedinUrl] = React.useState(stakeholder.linkedinUrl ?? '');
  const [email, setEmail] = React.useState(stakeholder.email ?? '');
  const [mobile, setMobile] = React.useState(stakeholder.mobile ?? '');
  const [status, setStatus] = React.useState<StakeholderStatus>(stakeholder.status);
  const [generalDescription, setGeneralDescription] = React.useState(
    stakeholder.generalDescription ?? '',
  );
  // Purely a display toggle for the Contact row below — not part of isDirty.
  const [editingContact, setEditingContact] = React.useState(false);
  // Seeded by zipping the two parallel arrays the entity returns — `coverage`
  // (resolved names) and `coverageLocationIds` (the ids backing them) are
  // guaranteed same-order same-length by the backend (see
  // stakeholders.service.ts). `level` is unknown until this session re-picks
  // it via search — see LocationMultiSelect's own doc comment.
  const [coverage, setCoverage] = React.useState<LocationOption[]>(() =>
    stakeholder.coverageLocationIds.map((id, i) => ({ id, name: stakeholder.coverage[i] ?? id })),
  );
  const [loggingContact, setLoggingContact] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  const coverageIdsKey = (ids: string[]) => [...ids].sort().join(',');
  const initialCoverageKey = coverageIdsKey(stakeholder.coverageLocationIds);

  const isDirty =
    firstName !== (stakeholder.firstName ?? '') ||
    lastName !== (stakeholder.lastName ?? '') ||
    jobTitleId !== (stakeholder.jobTitleId ?? '') ||
    roleTypeId !== (stakeholder.stakeholderRoleTypeId ?? '') ||
    linkedinUrl !== (stakeholder.linkedinUrl ?? '') ||
    email !== (stakeholder.email ?? '') ||
    mobile !== (stakeholder.mobile ?? '') ||
    status !== stakeholder.status ||
    generalDescription !== (stakeholder.generalDescription ?? '') ||
    coverageIdsKey(coverage.map((c) => c.id)) !== initialCoverageKey;

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty && canEdit);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetStakeholderQueryKey(stakeholder.id) });
    queryClient.invalidateQueries({ queryKey: getGetStakeholdersQueryKey() });
  };

  // Server-searched — the catalog is far larger than one page (see
  // useJobTitleOptions).
  const jobTitleSearch = useJobTitleOptions();
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
  const currentRoleTypeIndex = roleTypeRows.findIndex(
    (r) => r.id === stakeholder.stakeholderRoleTypeId,
  );

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants);

  const { data: contactHistoryData } = useGetClientContactHistory(stakeholder.clientId, {
    limit: CONTACT_HISTORY_LIMIT,
  });
  const contactHistory = (contactHistoryData?.status === 200 ? contactHistoryData.data : []).filter(
    (row) => row.stakeholderId === stakeholder.id,
  );

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

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(
    () => formRef.current?.requestSubmit(),
    canEdit && isDirty && !updateStakeholder.isPending,
  );

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
      status,
      generalDescription: generalDescription || undefined,
      coverageLocationIds: coverage.map((c) => c.id),
    };
    updateStakeholder.mutate({ id: stakeholder.id, data });
    setEditingContact(false);
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
    router.push(backTarget.href);
  }

  const currentStatus = stakeholderStatusOptions.find((o) => o.value === stakeholder.status)!;
  const displayName = stakeholderFullName(stakeholder) || 'Unnamed contact';

  const contactActionsMenu = (
    <div className="flex items-center gap-1">
      <ContactIconButton icon={Mail} href={email ? `mailto:${email}` : null} label="Email" />
      <ContactCopyButton icon={Phone} value={mobile} label="Mobile" />
      <ContactIconButton
        icon={LinkedinIcon}
        href={linkedinUrl}
        label="LinkedIn"
        activeClassName="text-[#0A66C2]"
      />
    </div>
  );

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={backTarget.href} />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to {backTarget.label}
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
              {initials(displayName)}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {displayName}
                </h1>
                <Badge className={currentStatus.triggerClassName}>{currentStatus.label}</Badge>
                {stakeholder.roleType ? (
                  <Badge
                    className={
                      currentRoleTypeIndex >= 0
                        ? roleTypeStyle(currentRoleTypeIndex).triggerClassName
                        : undefined
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
                <Button
                  type="submit"
                  form="stakeholder-form"
                  size="lg"
                  disabled={updateStakeholder.isPending || !isDirty}
                >
                  {updateStakeholder.isPending ? (
                    'Saving…'
                  ) : (
                    <>
                      Save changes
                      {isDirty ? (
                        <span className="flex items-center gap-0.5">
                          <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">
                            {isMac ? '⌘' : 'Ctrl'}
                          </Kbd>
                          <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">
                            <CornerDownLeft className="size-2.5" />
                          </Kbd>
                        </span>
                      ) : null}
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <form
        id="stakeholder-form"
        ref={formRef}
        onSubmit={handleSubmit}
        onKeyDown={blockImplicitEnterSubmit}
        className="grid gap-5 lg:grid-cols-3"
      >
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader className="flex border-b flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Contact Histories
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLoggingContact(true)}
              >
                <Phone />
                Log Contact
              </Button>
            </CardHeader>
            <CardContent>
              {contactHistory.length === 0 && !canEdit ? (
                <p className="text-sm text-muted-foreground">No contacts logged yet.</p>
              ) : (
                <div className="max-h-96 overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="divide-x divide-border">
                        <TableHead>Content</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactHistory.map((row) => (
                        <TableRow key={row.id} className="divide-x divide-border">
                          <TableCell className="max-w-md whitespace-normal break-words">
                            {row.notes ? (
                              <p className="whitespace-pre-wrap">{row.notes}</p>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {contactDateFormatter.format(new Date(row.contactedAt))}
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {row.contactedById ? consultantLabelFor(row.contactedById) : 'Imported'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {canEdit ? (
                        <LogContactRow
                          colSpan={3}
                          open={loggingContact}
                          onOpenChange={setLoggingContact}
                          isSaving={addContactHistory.isPending}
                          onSave={handleLogContact}
                        />
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General Description About This Stakeholder</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                id="generalDescription"
                value={generalDescription}
                onChange={(e) => setGeneralDescription(e.target.value)}
                disabled={!canEdit}
                className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <FormField
                label="Job title"
                htmlFor="jobTitle"
                description="The company's own words for the role."
                orientation="horizontal"
              >
                <CreatableCombobox
                  id="jobTitle"
                  value={jobTitleId}
                  onValueChange={setJobTitleId}
                  options={jobTitleSearch.options}
                  onQueryChange={jobTitleSearch.onQueryChange}
                  isFetching={jobTitleSearch.isFetching}
                  selectedLabel={stakeholder.jobTitle ?? undefined}
                  onCreate={handleCreateJobTitle}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField
                label="Role type"
                htmlFor="roleType"
                description="Your classification of the contact's function."
                orientation="horizontal"
              >
                <CreatableCombobox
                  id="roleType"
                  value={roleTypeId}
                  onValueChange={setRoleTypeId}
                  options={roleTypeOptions}
                  onCreate={handleCreateRoleType}
                  disabled={!canEdit}
                  clearable
                  title="Role type"
                />
              </FormField>

              <Collapsible.Root
                open={editingContact}
                onOpenChange={setEditingContact}
                className="group/contact flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Contact</span>
                  <div className="flex items-center gap-1">
                    {contactActionsMenu}
                    {canEdit ? (
                      <Collapsible.Trigger
                        render={
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label={
                              editingContact ? 'Collapse contact fields' : 'Expand contact fields'
                            }
                          >
                            <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[panel-open]/contact:rotate-180" />
                          </button>
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <Collapsible.Panel className="flex flex-col gap-3 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
                  <FormField label="Email" htmlFor="email" orientation="horizontal">
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="Mobile" htmlFor="mobile" orientation="horizontal">
                    <Input
                      id="mobile"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="LinkedIn URL" htmlFor="linkedinUrl" orientation="horizontal">
                    <Input
                      id="linkedinUrl"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                </Collapsible.Panel>
              </Collapsible.Root>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4">
              <FormField label="Status" htmlFor="status" orientation="horizontal">
                <EnumSelect
                  id="status"
                  value={status}
                  onValueChange={(v) => setStatus(v as StakeholderStatus)}
                  options={stakeholderStatusOptions}
                  disabled={!canEdit}
                />
              </FormField>
              <FormField
                label="City Coverage"
                htmlFor="coverage"
                description="Which places this contact covers. A country pick automatically covers every City Coverage value inside it."
                orientation="horizontal"
              >
                <LocationMultiSelect
                  id="coverage"
                  selected={coverage}
                  onChange={setCoverage}
                  disabled={!canEdit}
                />
              </FormField>
            </CardContent>
          </Card>
        </div>
      </form>

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
            <AlertDialogDescription>
              Leaving now discards your unsaved changes to this stakeholder.
            </AlertDialogDescription>
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
