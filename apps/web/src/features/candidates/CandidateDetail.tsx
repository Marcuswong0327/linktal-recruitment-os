'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  Check,
  FileText,
  History,
  Info,
  Pencil,
  Phone,
  SendHorizontal,
  Tag,
  Trash2,
  User,
  Workflow,
  X,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useConsultantLookup } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { FormField } from '@/components/FormField';
import { LogContactSheet, type LogContactValues } from '@/components/LogContactSheet';
import { PipelineTimeline } from '@/components/PipelineTimeline';
import { SubmissionsCard } from '@/components/SubmissionsCard';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import {
  useGetCandidate,
  useUpdateCandidate,
  useAddCandidateContactHistory,
  useAddCandidateNote,
  useUpdateCandidateNote,
  useDeleteCandidateNote,
  useGetCandidatePipelineTimeline,
  getGetCandidatesQueryKey,
  getGetCandidateQueryKey,
  getGetCandidatePipelineTimelineQueryKey,
} from '@/lib/api/generated/candidates/candidates';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { useGetJobOrders } from '@/lib/api/generated/job-orders/job-orders';
import {
  getGetJobRoleTypesQueryKey,
  useCreateJobRoleType,
  useGetJobRoleTypes,
} from '@/lib/api/generated/job-role-types/job-role-types';
import { getGetIndustriesQueryKey, useCreateIndustry, useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
  useGetSpecializations,
} from '@/lib/api/generated/specializations/specializations';
import type { CreateCandidateContactHistoryDto, UpdateCandidateDto } from '@/lib/api/generated/types';
import { contactTypeLabels, type ContactType } from '@/lib/contact-types';
import {
  candidateFullName,
  type Candidate,
  candidateStatusLabels,
  candidateStatusVariants,
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
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function CandidateDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error } = useGetCandidate(id);
  const candidate = data?.status === 200 ? data.data : undefined;

  if (isLoading) {
    return (
      <PageLayout>
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageLayout>
    );
  }

  if (isError || !candidate) {
    return (
      <PageLayout>
        <PageHeader
          title="Candidate not found"
          description={error?.message ?? `No candidate with ID ${id}.`}
        />
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/candidates" />}>
            <ArrowLeft />
            Back to candidates
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount the form when a different candidate loads so RHF's
  // defaultValues reset.
  return <CandidateEditForm key={candidate.id} candidate={candidate} />;
}

/** Empty strings become undefined so PATCH omits (not clears) blank fields. */
function cleanPatch(values: UpdateCandidateDto): UpdateCandidateDto {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, v]) => v !== '' && v !== undefined && !(typeof v === 'number' && Number.isNaN(v)),
    ),
  ) as UpdateCandidateDto;
}

/** True when two id arrays hold the same set, ignoring order. */
function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

function CandidateEditForm({ candidate }: { candidate: Candidate }) {
  const queryClient = useQueryClient();

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const { labelFor: consultantLabelFor } = useConsultantLookup(consultants);
  const { data: session } = useSession();
  const { data: pipelineData, isLoading: pipelineLoading } = useGetCandidatePipelineTimeline(candidate.id);
  const pipelineEvents = pipelineData?.status === 200 ? pipelineData.data : undefined;

  const { data: jobOrdersData } = useGetJobOrders({ pageSize: 100 });
  const jobOrders = jobOrdersData?.status === 200 ? jobOrdersData.data.data : [];
  const canModifyNote = (note: { by: string | null }) =>
    note.by === session?.user?.consultantId || session?.user?.roleName === 'admin';

  const { register, handleSubmit, formState } =
    useForm<UpdateCandidateDto>({
      defaultValues: {
        firstName: candidate.firstName ?? '',
        lastName: candidate.lastName ?? '',
        email: candidate.email ?? '',
        mobile: candidate.mobile ?? '',
        currentRole: candidate.currentRole ?? '',
        currentCompany: candidate.currentCompany ?? '',
        linkedinUrl: candidate.linkedinUrl ?? '',
        seekTalentUrl: candidate.seekTalentUrl ?? '',
        rawResumeUrl: candidate.rawResumeUrl ?? '',
        editedResumeUrl: candidate.editedResumeUrl ?? '',
      },
    });

  // Industry/role type/specializations are reference-table pickers, not
  // plain registered inputs — tracked as their own state (like
  // CompanyDetail's industryId/specializationId) and merged into the patch
  // on submit, since RHF's dirty-tracking doesn't see them.
  const [industryId, setIndustryId] = React.useState(candidate.industryId ?? '');
  const [roleTypeId, setRoleTypeId] = React.useState(candidate.jobRoleTypeId ?? '');
  const [specializationIds, setSpecializationIds] = React.useState(candidate.specializationIds);

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const { data: roleTypeData } = useGetJobRoleTypes();
  const roleTypes = roleTypeData?.status === 200 ? roleTypeData.data : [];
  const { data: specializationData } = useGetSpecializations();
  const specializations = specializationData?.status === 200 ? specializationData.data : [];
  const specializationById = React.useMemo(() => new Map(specializations.map((s) => [s.id, s])), [specializations]);

  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  const createRoleType = useCreateJobRoleType({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetJobRoleTypesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add role type'),
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
  async function handleCreateRoleType(name: string) {
    const res = await createRoleType.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add role type');
    return res.data;
  }
  async function handleCreateSpecialization(name: string) {
    // A Specialization belongs to exactly one Industry — can't create one
    // without knowing which.
    if (!industryId) throw new Error('Select an industry first');
    const res = await createSpecialization.mutateAsync({ data: { name, industryId } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  const isDirty =
    formState.isDirty ||
    industryId !== (candidate.industryId ?? '') ||
    roleTypeId !== (candidate.jobRoleTypeId ?? '') ||
    !sameIds(specializationIds, candidate.specializationIds);

  const updateCandidate = useUpdateCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetCandidateQueryKey(candidate.id),
        });
        toast.success(`Saved changes to ${candidateFullName(candidate) || 'candidate'}`);
      },
      onError: (err) => {
        toast.error(err.message || 'Failed to save candidate');
      },
    },
  });

  const onSubmit = handleSubmit((values) => {
    updateCandidate.mutate({
      id: candidate.id,
      data: {
        ...cleanPatch(values),
        industryId: industryId || null,
        jobRoleTypeId: roleTypeId || null,
        specializationIds,
      } as UpdateCandidateDto,
    });
  });

  const [loggingContact, setLoggingContact] = React.useState(false);
  const addContactHistory = useAddCandidateContactHistory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        toast.success('Contact logged');
        setLoggingContact(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to log contact'),
    },
  });

  function handleLogContact(values: LogContactValues) {
    // Generated DTO has `notes` as optional (undefined), not nullable —
    // the sheet emits `null` for "cleared", so build the payload without
    // the key entirely rather than sending an invalid `null`.
    addContactHistory.mutate({
      id: candidate.id,
      data: {
        contactType: values.contactType,
        contactedAt: values.contactedAt,
        ...(values.notes ? { notes: values.notes } : {}),
      } as unknown as CreateCandidateContactHistoryDto,
    });
  }

  const [noteDraft, setNoteDraft] = React.useState('');
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [editingNoteVersion, setEditingNoteVersion] = React.useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = React.useState<string | null>(null);
  const [deletingNoteVersion, setDeletingNoteVersion] = React.useState<string | null>(null);

  const addNote = useAddCandidateNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        setNoteDraft('');
      },
      onError: (err) => toast.error(err.message || 'Failed to add note'),
    },
  });

  function handleAddNote(e: React.SyntheticEvent) {
    e.preventDefault();
    const content = noteDraft.trim();
    if (!content) return;
    addNote.mutate({ id: candidate.id, data: { content } });
  }

  const updateNote = useUpdateCandidateNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        setEditingNoteId(null);
      },
      onError: (err) => {
        if (isConflictError(err)) {
          queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
          setEditingNoteId(null);
          toast.error('This note was changed by someone else. Refreshed with the latest version.');
          return;
        }
        toast.error(err.message || 'Failed to edit note');
      },
    },
  });

  const deleteNote = useDeleteCandidateNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
        setDeletingNoteId(null);
      },
      onError: (err) => {
        if (isConflictError(err)) {
          queryClient.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidate.id) });
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
      id: candidate.id,
      noteId,
      data: { content, expectedVersion: editingNoteVersion ?? undefined },
    });
  }

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/candidates" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Candidates
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
              {initials(candidateFullName(candidate))}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {candidateFullName(candidate) || 'Unnamed candidate'}
                </h1>
                <Badge variant={candidateStatusVariants[candidate.status]}>
                  {candidateStatusLabels[candidate.status]}
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {candidate.displayId}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !updateCandidate.isPending ? (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button type="button" variant="outline" size="lg" onClick={() => setLoggingContact(true)}>
              <Phone />
              Log a contact
            </Button>
            <Button
              type="submit"
              form="candidate-form"
              size="lg"
              disabled={updateCandidate.isPending || !isDirty}
            >
              {updateCandidate.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      <form id="candidate-form" onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  Profile
                </CardTitle>
                <CardDescription>Identity, contact and location.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="First name" htmlFor="firstName">
                  <Input id="firstName" {...register('firstName')} />
                </FormField>
                <FormField label="Last name" htmlFor="lastName">
                  <Input id="lastName" {...register('lastName')} />
                </FormField>
                <FormField label="Email" htmlFor="email">
                  <Input id="email" type="email" {...register('email')} />
                </FormField>
                <FormField label="Mobile" htmlFor="mobile">
                  <Input id="mobile" {...register('mobile')} />
                </FormField>
                <FormField
                  label="Location"
                  htmlFor="location"
                  description="Read-only for now — location editing isn't wired up here yet."
                >
                  <Input id="location" value={candidate.location ?? '—'} disabled />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="size-4 text-muted-foreground" />
                  Work
                </CardTitle>
                <CardDescription>Current role, background and expectations.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="Current title" htmlFor="currentRole">
                  <Input id="currentRole" {...register('currentRole')} />
                </FormField>
                <FormField label="Current company" htmlFor="currentCompany">
                  <Input id="currentCompany" {...register('currentCompany')} />
                </FormField>
                <FormField label="Industry" htmlFor="industry">
                  <CreatableCombobox
                    id="industry"
                    value={industryId}
                    onValueChange={setIndustryId}
                    options={industries}
                    onCreate={handleCreateIndustry}
                    placeholder="Select industry…"
                  />
                </FormField>
                <FormField label="Role type" htmlFor="roleType">
                  <CreatableCombobox
                    id="roleType"
                    value={roleTypeId}
                    onValueChange={setRoleTypeId}
                    options={roleTypes}
                    onCreate={handleCreateRoleType}
                    placeholder="Select role type…"
                  />
                </FormField>
                <FormField label="LinkedIn URL" htmlFor="linkedinUrl">
                  <Input id="linkedinUrl" {...register('linkedinUrl')} />
                </FormField>
                <FormField label="Seek Talent URL" htmlFor="seekTalentUrl">
                  <Input id="seekTalentUrl" {...register('seekTalentUrl')} />
                </FormField>
                <FormField label="Raw resume URL" htmlFor="rawResumeUrl">
                  <Input id="rawResumeUrl" {...register('rawResumeUrl')} />
                </FormField>
                <FormField label="Edited resume URL" htmlFor="editedResumeUrl">
                  <Input id="editedResumeUrl" {...register('editedResumeUrl')} />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  Notes
                </CardTitle>
                <CardDescription>Internal notes — not visible to clients.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
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
                {candidate.notes && candidate.notes.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {[...candidate.notes].reverse().map((note) =>
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
                  <Briefcase className="size-4 text-muted-foreground" />
                  Submissions
                </CardTitle>
                <CardDescription>Job orders this candidate is submitted to.</CardDescription>
              </CardHeader>
              <CardContent>
                <SubmissionsCard
                  mode="candidate"
                  candidateId={candidate.id}
                  jobOrders={jobOrders}
                  onChanged={() =>
                    queryClient.invalidateQueries({
                      queryKey: getGetCandidatePipelineTimelineQueryKey(candidate.id),
                    })
                  }
                />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Workflow className="size-4 text-muted-foreground" />
                  Pipeline history
                </CardTitle>
                <CardDescription>Submission and stage changes across every job order.</CardDescription>
              </CardHeader>
              <CardContent>
                <PipelineTimeline events={pipelineEvents} isLoading={pipelineLoading} showJobOrder />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  Work history
                </CardTitle>
              </CardHeader>
              <CardContent>
                {candidate.workHistory?.length ? (
                  <div className="flex flex-col gap-4 border-l border-border pl-4">
                    {candidate.workHistory.map((raw, i) => {
                      // JSONB in the API; the generated type is an open record.
                      const item = raw as {
                        company?: string;
                        role?: string;
                        startDate?: string;
                        endDate?: string;
                      };
                      const period = [item.startDate, item.endDate].filter(Boolean).join(' – ');
                      return (
                        <div key={i} className="relative flex flex-col text-sm">
                          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary/60" />
                          <span className="font-medium">{item.role ?? '—'}</span>
                          {item.company ? (
                            <span className="text-muted-foreground">{item.company}</span>
                          ) : null}
                          {period ? (
                            <span className="text-xs text-muted-foreground/80">{period}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No work history recorded.</p>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="size-4 text-muted-foreground" />
                  Specializations
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {specializationIds.length > 0 ? (
                    specializationIds.map((id) => (
                      <Badge key={id} variant="muted" className="gap-1">
                        {specializationById.get(id)?.name ?? id}
                        <button
                          type="button"
                          aria-label="Remove specialization"
                          onClick={() => setSpecializationIds((prev) => prev.filter((s) => s !== id))}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No specializations recorded.</p>
                  )}
                </div>
                {/* value is always '' — this is an "add one" picker, not a
                    single-select; onCreate/onValueChange append instead of
                    replacing, and already-selected options are filtered out. */}
                <CreatableCombobox
                  value=""
                  onValueChange={(id) => setSpecializationIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
                  options={specializations.filter((s) => !specializationIds.includes(s.id))}
                  onCreate={handleCreateSpecialization}
                  placeholder="Add a specialization…"
                />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" />
                  Record
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs leading-5">{candidate.displayId}</span>
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(candidate.createdAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(candidate.updatedAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground">Last contacted</span>
                <span>
                  {candidate.lastContactedAt
                    ? new Date(candidate.lastContactedAt).toLocaleString()
                    : '—'}
                </span>
                <span className="text-muted-foreground">Method</span>
                <span>
                  {candidate.lastContactType
                    ? (contactTypeLabels[candidate.lastContactType as ContactType] ?? candidate.lastContactType)
                    : '—'}
                </span>
                <span className="text-muted-foreground">Contacted by</span>
                <span>{candidate.lastContactedBy ?? '—'}</span>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      <LogContactSheet
        open={loggingContact}
        onOpenChange={setLoggingContact}
        subjectLabel={candidateFullName(candidate) || 'this candidate'}
        isSaving={addContactHistory.isPending}
        onSave={handleLogContact}
      />

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
                  id: candidate.id,
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
