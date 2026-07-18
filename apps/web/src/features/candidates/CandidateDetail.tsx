'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Briefcase,
  FileText,
  History,
  Info,
  Phone,
  Tag,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

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
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { FormField } from '@/components/FormField';
import { LogContactSheet, type LogContactValues } from '@/components/LogContactSheet';
import { PageHeader, PageLayout } from '@/components/app-shell/PageLayout';
import {
  useGetCandidate,
  useUpdateCandidate,
  useAddCandidateContactHistory,
  getGetCandidatesQueryKey,
  getGetCandidateQueryKey,
} from '@/lib/api/generated/candidates/candidates';
import {
  getGetCandidateRoleTypesQueryKey,
  useCreateCandidateRoleType,
  useGetCandidateRoleTypes,
} from '@/lib/api/generated/candidate-role-types/candidate-role-types';
import { getGetIndustriesQueryKey, useCreateIndustry, useGetIndustries } from '@/lib/api/generated/industries/industries';
import {
  getGetSpecializationsQueryKey,
  useCreateSpecialization,
  useGetSpecializations,
} from '@/lib/api/generated/specializations/specializations';
import type { CreateCandidateContactHistoryDto, UpdateCandidateDto } from '@/lib/api/generated/types';
import { contactTypeLabels, type ContactType } from '@/lib/contact-types';
import {
  type Candidate,
  candidateStatusLabels,
  candidateStatusVariants,
} from './schema';

function initials(name: string) {
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

  const { register, handleSubmit, formState } =
    useForm<UpdateCandidateDto>({
      defaultValues: {
        fullName: candidate.fullName,
        givenName: candidate.givenName ?? '',
        familyName: candidate.familyName ?? '',
        email: candidate.email ?? '',
        mobile: candidate.mobile ?? '',
        country: candidate.country ?? '',
        city: candidate.city ?? '',
        currentPosition: candidate.currentPosition ?? '',
        currentCompany: candidate.currentCompany ?? '',
        yearsExperience: candidate.yearsExperience ?? undefined,
        salaryExpectation: candidate.salaryExpectation ?? '',
        linkedinUrl: candidate.linkedinUrl ?? '',
        resumeUrl: candidate.resumeUrl ?? '',
      },
    });

  // Industry/role type/specializations are reference-table pickers, not
  // plain registered inputs — tracked as their own state (like
  // CompanyDetail's industryId/specializationId) and merged into the patch
  // on submit, since RHF's dirty-tracking doesn't see them.
  const [industryId, setIndustryId] = React.useState(candidate.industryId ?? '');
  const [roleTypeId, setRoleTypeId] = React.useState(candidate.roleTypeId ?? '');
  const [specializationIds, setSpecializationIds] = React.useState(candidate.specializationIds);

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const { data: roleTypeData } = useGetCandidateRoleTypes();
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
  const createRoleType = useCreateCandidateRoleType({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCandidateRoleTypesQueryKey() }),
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
    const res = await createSpecialization.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  const isDirty =
    formState.isDirty ||
    industryId !== (candidate.industryId ?? '') ||
    roleTypeId !== (candidate.roleTypeId ?? '') ||
    !sameIds(specializationIds, candidate.specializationIds);

  const updateCandidate = useUpdateCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetCandidateQueryKey(candidate.id),
        });
        toast.success(`Saved changes to ${candidate.fullName}`);
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
        roleTypeId: roleTypeId || null,
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
              {initials(candidate.fullName)}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {candidate.fullName}
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
                <FormField label="Full name" htmlFor="fullName">
                  <Input id="fullName" {...register('fullName')} />
                </FormField>
                <div aria-hidden className="hidden sm:block" />
                <FormField label="Given name" htmlFor="givenName">
                  <Input id="givenName" {...register('givenName')} />
                </FormField>
                <FormField label="Family name" htmlFor="familyName">
                  <Input id="familyName" {...register('familyName')} />
                </FormField>
                <FormField label="Email" htmlFor="email">
                  <Input id="email" type="email" {...register('email')} />
                </FormField>
                <FormField label="Mobile" htmlFor="mobile">
                  <Input id="mobile" {...register('mobile')} />
                </FormField>
                <FormField label="Country" htmlFor="country">
                  <Input id="country" {...register('country')} />
                </FormField>
                <FormField label="City" htmlFor="city">
                  <Input id="city" {...register('city')} />
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
                <FormField label="Current title" htmlFor="currentPosition">
                  <Input id="currentPosition" {...register('currentPosition')} />
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
                <FormField label="Years of experience" htmlFor="yearsExperience">
                  <Input
                    id="yearsExperience"
                    type="number"
                    min={0}
                    {...register('yearsExperience', { valueAsNumber: true })}
                  />
                </FormField>
                <FormField label="Expected salary" htmlFor="salaryExpectation">
                  <Input id="salaryExpectation" {...register('salaryExpectation')} />
                </FormField>
                <FormField label="LinkedIn URL" htmlFor="linkedinUrl">
                  <Input id="linkedinUrl" {...register('linkedinUrl')} />
                </FormField>
                <FormField label="Resume URL" htmlFor="resumeUrl">
                  <Input id="resumeUrl" {...register('resumeUrl')} />
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
              <CardContent>
                {candidate.notes?.length ? (
                  <ul className="flex flex-col gap-3">
                    {[...candidate.notes].reverse().map((raw, i) => {
                      const note = raw as { content?: string; timestamp?: string };
                      return (
                        <li key={i} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                          <p className="text-sm whitespace-pre-wrap">{note.content ?? '—'}</p>
                          {note.timestamp ? (
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.timestamp).toLocaleString()}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
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
        subjectLabel={candidate.fullName}
        isSaving={addContactHistory.isPending}
        onSave={handleLogContact}
      />
    </PageLayout>
  );
}
