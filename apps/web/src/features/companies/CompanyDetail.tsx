'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Check,
  CornerDownLeft,
  FileText,
  Handshake,
  Info,
  Pencil,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
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
import { ConsultantCombobox, useConsultantLookup } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import {
  getGetClientQueryKey,
  getGetClientsQueryKey,
  useAddClientNote,
  useDeleteClientNote,
  useGetClient,
  useUpdateClient,
  useUpdateClientNote,
} from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  getGetIndustriesQueryKey,
  useCreateIndustry,
  useGetIndustries,
} from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
  useGetSpecializations,
} from '@/lib/api/generated/specializations/specializations';
import type { ConsultantEntity, UpdateClientDto } from '@/lib/api/generated/types';
import { qualityOptions, qualityVariant, statusOptions, statusVariant, tobOptions } from './columns';
import {
  type ClientQuality,
  type ClientStatus,
  type Company,
  clientQualityLabels,
  clientStatusLabels,
} from './schema';

const textareaClass =
  'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

const noteDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** A note's own last-modified marker — mirrors the API's noteVersion, used for the optimistic-concurrency check on edit/delete. */
function noteVersion(note: { editedAt: string | null; timestamp: string }) {
  return note.editedAt ?? note.timestamp;
}

function isConflictError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { statusCode?: number }).statusCode === 409
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Field-level validators — mirror the API's own rules (create-client.dto.ts) so a bad edit is caught before Save instead of bouncing back as a raw server error. */
function validateCompanyName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Company name is required.';
  if (trimmed.length > 200) return 'Must be 200 characters or fewer.';
  return undefined;
}

function validateWebsite(value: string): string | undefined {
  if (!value.trim()) return undefined; // optional
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
  } catch {
    return 'Enter a full URL, e.g. https://acme.com.';
  }
  return undefined;
}

function validateFeePercentage(value: string): string | undefined {
  if (value === '') return undefined; // optional
  const n = Number(value);
  if (Number.isNaN(n)) return 'Must be a number.';
  if (n < 0 || n > 100) return 'Must be between 0 and 100.';
  return undefined;
}

// guaranteePeriod is NOT NULL in the database (defaults to 90) — unlike the
// other fields here, clearing this one can't be saved as null, so it's
// validated as required rather than optional.
function validateGuaranteePeriod(value: string): string | undefined {
  if (value === '') return 'Guarantee period is required.';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 'Must be a whole number of days, 0 or more.';
  return undefined;
}

export function CompanyDetail({ id, canEdit = true }: { id: string; canEdit?: boolean }) {
  const { data, isLoading, isError, error } = useGetClient(id);
  const company = data?.status === 200 ? data.data : undefined;

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  if (isLoading) {
    return (
      <PageLayout>
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageLayout>
    );
  }

  if (isError || !company) {
    return (
      <PageLayout>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold">Company not found</h1>
          <p className="text-sm text-muted-foreground">
            {error?.message ?? `No company with ID ${id}.`}
          </p>
        </div>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/companies" />}>
            <ArrowLeft />
            Back to companies
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount the form when a different company loads so local state resets.
  return (
    <CompanyEditForm key={company.id} company={company} consultants={consultants} canEdit={canEdit} />
  );
}

/** Empty strings/inputs become `null` (not omitted) so a cleared field actually saves as cleared. */
function toPatch(values: {
  companyName: string;
  industryId: string;
  specializationId: string;
  city: string;
  country: string;
  website: string;
  status: ClientStatus;
  quality: ClientQuality;
  tobSigned: boolean;
  feePercentage: string;
  guaranteePeriod: string;
  consultantId: string;
}) {
  return {
    companyName: values.companyName,
    industryId: values.industryId || null,
    specializationId: values.specializationId || null,
    city: values.city || null,
    country: values.country || null,
    website: values.website || null,
    status: values.status,
    quality: values.quality,
    tobSigned: values.tobSigned,
    feePercentage: values.feePercentage === '' ? null : Number(values.feePercentage),
    // Not nullable in the DB — validated as required before this ever runs.
    guaranteePeriod: Number(values.guaranteePeriod),
    consultantId: values.consultantId || null,
  } as unknown as UpdateClientDto;
}

function CompanyEditForm({
  company,
  consultants,
  canEdit,
}: {
  company: Company;
  consultants: ConsultantEntity[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const { data: specializationData } = useGetSpecializations();
  const specializations = specializationData?.status === 200 ? specializationData.data : [];

  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  const createSpecialization = useCreateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add specialization'),
    },
  });
  async function handleCreateIndustry(name: string) {
    const res = await createIndustry.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    return res.data;
  }
  async function handleCreateSpecialization(name: string) {
    const res = await createSpecialization.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  const [companyName, setCompanyName] = React.useState(company.companyName);
  const [industryId, setIndustryId] = React.useState(company.industryId ?? '');
  const [specializationId, setSpecializationId] = React.useState(company.specializationId ?? '');
  const [city, setCity] = React.useState(company.city ?? '');
  const [country, setCountry] = React.useState(company.country ?? '');
  const [website, setWebsite] = React.useState(company.website ?? '');
  const [status, setStatus] = React.useState<ClientStatus>(company.status);
  const [quality, setQuality] = React.useState<ClientQuality>(company.quality);
  const [tobSigned, setTobSigned] = React.useState(company.tobSigned);
  const [feePercentage, setFeePercentage] = React.useState(
    company.feePercentage != null ? String(company.feePercentage) : '',
  );
  const [guaranteePeriod, setGuaranteePeriod] = React.useState(String(company.guaranteePeriod));
  const [consultantId, setConsultantId] = React.useState(company.consultantId ?? '');

  const { data: session } = useSession();
  // GET /consultants is admin/manager only (rbac-roles.md §2) — every other
  // role's `consultants` fetch comes back empty, so without this, a company
  // assigned to the logged-in user would show "Unknown" instead of their own
  // name. See useConsultantLookup's doc for the merge/label logic.
  const currentUser = session?.user?.consultantId
    ? { id: session.user.consultantId, fullName: session.user.name ?? 'You' }
    : null;
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants, currentUser);
  const canModifyNote = (note: { by: string | null }) =>
    canEdit && (note.by === session?.user?.consultantId || session?.user?.roleName === 'admin');
  const [noteDraft, setNoteDraft] = React.useState('');
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [editingNoteVersion, setEditingNoteVersion] = React.useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = React.useState<string | null>(null);
  const [deletingNoteVersion, setDeletingNoteVersion] = React.useState<string | null>(null);

  // Errors are always computed live, but only shown for a field once the user
  // has left it (or tried to Save) — otherwise pre-existing legacy data
  // (e.g. an imported website that isn't quite a valid URL) would show as an
  // error the instant the page loads, before anyone's touched anything.
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const fieldErrors = {
    companyName: validateCompanyName(companyName),
    website: validateWebsite(website),
    feePercentage: validateFeePercentage(feePercentage),
    guaranteePeriod: validateGuaranteePeriod(guaranteePeriod),
  };
  const hasErrors = Object.values(fieldErrors).some(Boolean);

  const isDirty =
    companyName !== company.companyName ||
    industryId !== (company.industryId ?? '') ||
    specializationId !== (company.specializationId ?? '') ||
    city !== (company.city ?? '') ||
    country !== (company.country ?? '') ||
    website !== (company.website ?? '') ||
    status !== company.status ||
    quality !== company.quality ||
    tobSigned !== company.tobSigned ||
    feePercentage !== (company.feePercentage != null ? String(company.feePercentage) : '') ||
    guaranteePeriod !== String(company.guaranteePeriod) ||
    consultantId !== (company.consultantId ?? '');

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  const updateClient = useUpdateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
        toast.success(`Saved changes to ${companyName}`);
      },
      onError: (err) => toast.error(err.message || 'Failed to save company'),
    },
  });

  const addNote = useAddClientNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
        setNoteDraft('');
      },
      onError: (err) => toast.error(err.message || 'Failed to add note'),
    },
  });

  function handleAddNote(e: React.SyntheticEvent) {
    e.preventDefault();
    const content = noteDraft.trim();
    if (!content) return;
    addNote.mutate({ id: company.id, data: { content } });
  }

  const updateNote = useUpdateClientNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
        setEditingNoteId(null);
      },
      onError: (err) => {
        if (isConflictError(err)) {
          // Someone else changed this note first — refresh so the edit box
          // (if still open) reflects reality instead of overwriting it.
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
          setEditingNoteId(null);
          toast.error('This note was changed by someone else. Refreshed with the latest version.');
          return;
        }
        toast.error(err.message || 'Failed to edit note');
      },
    },
  });

  const deleteNote = useDeleteClientNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
        setDeletingNoteId(null);
      },
      onError: (err) => {
        if (isConflictError(err)) {
          queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
          setDeletingNoteId(null);
          toast.error('This note was changed by someone else. Refreshed with the latest version.');
          return;
        }
        toast.error(err.message || 'Failed to delete note');
      },
    },
  });

  function startEditingNote(note: {
    id: string;
    content: string;
    editedAt: string | null;
    timestamp: string;
  }) {
    setEditingNoteId(note.id);
    setEditDraft(note.content);
    setEditingNoteVersion(noteVersion(note));
  }

  function handleSaveNoteEdit(e: React.SyntheticEvent, noteId: string) {
    e.preventDefault();
    const content = editDraft.trim();
    if (!content) return;
    updateNote.mutate({
      id: company.id,
      noteId,
      data: { content, expectedVersion: editingNoteVersion ?? undefined },
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      // Reveal every error at once (not just touched ones) so a blocked Save
      // attempt always explains itself instead of silently doing nothing.
      setTouched((prev) => ({
        ...prev,
        companyName: true,
        website: true,
        feePercentage: true,
        guaranteePeriod: true,
      }));
      return;
    }
    updateClient.mutate({
      id: company.id,
      data: toPatch({
        companyName,
        industryId,
        specializationId,
        city,
        country,
        website,
        status,
        quality,
        tobSigned,
        feePercentage,
        guaranteePeriod,
        consultantId,
      }),
    });
  }

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/companies" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Companies
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
              {initials(company.companyName)}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {company.companyName}
                </h1>
                <Badge variant={statusVariant[company.status]}>
                  {clientStatusLabels[company.status]}
                </Badge>
                <Badge variant={qualityVariant[company.quality]}>
                  {clientQualityLabels[company.quality]} quality
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{company.displayId}</span>
            </div>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-3">
              {hasErrors && Object.keys(touched).length > 0 ? (
                <span className="text-xs text-destructive">Fix the highlighted fields to save</span>
              ) : isDirty && !updateClient.isPending ? (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              ) : null}
              <Button
                type="submit"
                form="company-form"
                size="lg"
                disabled={updateClient.isPending || !isDirty}
              >
                {updateClient.isPending ? (
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

      <form id="company-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  Company
                </CardTitle>
                <CardDescription>Identity, industry and location.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Company Name"
                  htmlFor="companyName"
                  required
                  error={touched.companyName ? fieldErrors.companyName : undefined}
                >
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    onBlur={() => markTouched('companyName')}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Industry"
                  htmlFor="industry"
                  description="The company's primary industry or sector."
                >
                  <CreatableCombobox
                    id="industry"
                    value={industryId}
                    onValueChange={setIndustryId}
                    options={industries}
                    onCreate={handleCreateIndustry}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Specialization"
                  htmlFor="specialization"
                  description="Niche within the industry, e.g. Heavy Machinery."
                >
                  <CreatableCombobox
                    id="specialization"
                    value={specializationId}
                    onValueChange={setSpecializationId}
                    options={specializations}
                    onCreate={handleCreateSpecialization}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="City" htmlFor="city">
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Country" htmlFor="country">
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Website"
                  htmlFor="website"
                  description="Include the protocol, e.g. https://acme.com."
                  error={touched.website ? fieldErrors.website : undefined}
                >
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://…"
                    value={website}
                    disabled={!canEdit}
                    onChange={(e) => setWebsite(e.target.value)}
                    onBlur={() => markTouched('website')}
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Handshake className="size-4 text-muted-foreground" />
                  Business
                </CardTitle>
                <CardDescription>Relationship, terms and fee.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Relationship"
                  htmlFor="status"
                  tooltip="Cold = No Contact Yet. Warm = In Active Conversation. Traded = Placed at least One Candidate."
                >
                  <EnumSelect
                    id="status"
                    value={status}
                    onValueChange={(v) => setStatus(v as ClientStatus)}
                    options={statusOptions}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Quality"
                  htmlFor="quality"
                  tooltip="A recruiter's subjective read on how good a prospect this client is."
                >
                  <EnumSelect
                    id="quality"
                    value={quality}
                    onValueChange={(v) => setQuality(v as ClientQuality)}
                    options={qualityOptions}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Terms of Business"
                  htmlFor="tobSigned"
                  tooltip="Whether this client has signed your Terms of Business agreement."
                >
                  <EnumSelect
                    id="tobSigned"
                    value={String(tobSigned)}
                    onValueChange={(v) => setTobSigned(v === 'true')}
                    options={tobOptions}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Fee %"
                  htmlFor="feePercentage"
                  description="Percentage of the candidate's total package charged as placement fee."
                  error={touched.feePercentage ? fieldErrors.feePercentage : undefined}
                >
                  <Input
                    id="feePercentage"
                    type="number"
                    min={0}
                    max={100}
                    value={feePercentage}
                    onChange={(e) => setFeePercentage(e.target.value)}
                    onBlur={() => markTouched('feePercentage')}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Guarantee period (days)"
                  htmlFor="guaranteePeriod"
                  required
                  description="Replacement window from the candidate's start date. Defaults to 90."
                  error={touched.guaranteePeriod ? fieldErrors.guaranteePeriod : undefined}
                >
                  <Input
                    id="guaranteePeriod"
                    type="number"
                    min={0}
                    value={guaranteePeriod}
                    onChange={(e) => setGuaranteePeriod(e.target.value)}
                    onBlur={() => markTouched('guaranteePeriod')}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Consultant"
                  htmlFor="consultantId"
                  description={
                    !industryId
                      ? 'Tag an industry before assigning a consultant'
                      : 'The consultant who owns this client relationship.'
                  }
                >
                  <ConsultantCombobox
                    id="consultantId"
                    value={consultantId}
                    onValueChange={setConsultantId}
                    consultants={
                      !industryId
                        ? []
                        : consultants.filter((c) => c.industryIds === undefined || c.industryIds.includes(industryId))
                    }
                    currentUser={currentUser}
                    allowUnassign={session?.user?.roleName !== 'consultant'}
                    disabled={!canEdit || !industryId}
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  Notes
                </CardTitle>
                <CardDescription>Internal notes — not visible to the client.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {canEdit ? (
                  <div className="flex items-start gap-2">
                    <textarea
                      id="notes"
                      aria-label="Add a note"
                      placeholder="Add a note…"
                      className={textareaClass}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote(e);
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      disabled={addNote.isPending || !noteDraft.trim()}
                      onClick={handleAddNote}
                      aria-label="Add note"
                    >
                      <SendHorizontal />
                    </Button>
                  </div>
                ) : null}
                {company.notes && company.notes.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {[...company.notes].reverse().map((note) =>
                      editingNoteId === note.id ? (
                        <li
                          key={note.id}
                          className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <textarea
                            aria-label="Edit note"
                            className={textareaClass}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            autoFocus
                          />
                          <div className="flex items-center gap-2 self-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditingNoteId(null)}
                              aria-label="Cancel edit"
                            >
                              <X />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              disabled={updateNote.isPending || !editDraft.trim()}
                              onClick={(e) => handleSaveNoteEdit(e, note.id)}
                              aria-label="Save edit"
                            >
                              <Check />
                            </Button>
                          </div>
                        </li>
                      ) : (
                        <li
                          key={note.id}
                          className="group flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                            {canModifyNote(note) ? (
                              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => startEditingNote(note)}
                                  aria-label="Edit note"
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setDeletingNoteId(note.id);
                                    setDeletingNoteVersion(noteVersion(note));
                                  }}
                                  aria-label="Delete note"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {note.by ? consultantLabelFor(note.by) : 'Imported'} ·{' '}
                            {noteDateFormatter.format(new Date(note.timestamp))}
                            {note.editedAt ? (
                              <>
                                {' '}
                                · edited by{' '}
                                {note.editedBy
                                  ? consultantLabelFor(note.editedBy)
                                  : 'Imported'} ·{' '}
                                {noteDateFormatter.format(new Date(note.editedAt))}
                              </>
                            ) : null}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" />
                  Record
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs leading-5">{company.displayId}</span>
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(company.createdAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(company.updatedAt).toLocaleDateString()}</span>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      <AlertDialog open={promptOpen} onOpenChange={(open) => !open && cancelLeave()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to {company.companyName}. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Leave without saving</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deletingNoteId !== null}
        onOpenChange={(open) => !open && setDeletingNoteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deletingNoteId) return;
                deleteNote.mutate({
                  id: company.id,
                  noteId: deletingNoteId,
                  params: { expectedVersion: deletingNoteVersion ?? undefined },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
