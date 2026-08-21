'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, DollarSign, FileText, Info, Workflow } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ClientCombobox } from '@/components/ClientCombobox';
import { ConsultantMultiSelect } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { PipelineTimeline } from '@/components/PipelineTimeline';
import { SubmissionsCard } from '@/components/SubmissionsCard';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import { useGetClient, useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { useGetLocation } from '@/lib/api/generated/locations/locations';
import {
  getGetJobOrderPipelineTimelineQueryKey,
  getGetJobOrderQueryKey,
  getGetJobOrdersQueryKey,
  useGetJobOrder,
  useGetJobOrderPipelineTimeline,
  useSetJobOrderConsultants,
  useUpdateJobOrder,
} from '@/lib/api/generated/job-orders/job-orders';
import { useCreateJobTitle, useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';
import { contactTypeLabels, type ContactType } from '@/lib/contact-types';
import type { ClientEntity, ConsultantEntity, UpdateJobOrderDto } from '@/lib/api/generated/types';
import {
  type JobOrder,
  type JobOrderQuality,
  type JobOrderStatus,
  jobOrderQualityLabels,
  jobOrderStatusLabels,
  priorityOptions,
  qualityOptions,
  qualityVariant,
  statusOptions,
  statusVariant,
} from './schema';

const textareaClass =
  'min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

export function JobOrderDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error } = useGetJobOrder(id);
  const jobOrder = data?.status === 200 ? data.data : undefined;

  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients = clientsData?.status === 200 ? clientsData.data.data : [];

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

  if (isError || !jobOrder) {
    return (
      <PageLayout>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold">Job order not found</h1>
          <p className="text-sm text-muted-foreground">{error?.message ?? `No job order with ID ${id}.`}</p>
        </div>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/job-orders" />}>
            <ArrowLeft />
            Back to job orders
          </Button>
        </div>
      </PageLayout>
    );
  }

  // key: remount the form when a different job order loads so local state resets.
  return <JobOrderEditForm key={jobOrder.id} jobOrder={jobOrder} clients={clients} consultants={consultants} />;
}

/** Empty strings/inputs become `null` (not omitted) so a cleared field actually saves as cleared. */
function toPatch(values: {
  jobTitleId: string;
  clientId: string;
  quality: JobOrderQuality;
  status: JobOrderStatus;
  priorityLevel: string;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  openings: string;
  description: string;
  requirements: string;
}) {
  return {
    jobTitleId: values.jobTitleId || null,
    clientId: values.clientId,
    quality: values.quality,
    status: values.status,
    priorityLevel: values.priorityLevel === '' ? null : Number(values.priorityLevel),
    salaryMin: values.salaryMin === '' ? null : Number(values.salaryMin),
    salaryMax: values.salaryMax === '' ? null : Number(values.salaryMax),
    salaryCurrency: values.salaryCurrency || null,
    openings: Number(values.openings),
    description: values.description || null,
    requirements: values.requirements || null,
  } as unknown as UpdateJobOrderDto;
}

function JobOrderEditForm({
  jobOrder,
  clients,
  consultants,
}: {
  jobOrder: JobOrder;
  clients: ClientEntity[];
  consultants: ConsultantEntity[];
}) {
  const queryClient = useQueryClient();

  const [jobTitleId, setJobTitleId] = React.useState(jobOrder.jobTitleId ?? '');
  const { data: jobTitleData } = useGetJobTitles({ take: 200 });
  const jobTitles = jobTitleData?.status === 200 ? jobTitleData.data : [];
  const createJobTitle = useCreateJobTitle();
  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add job title');
    return res.data;
  }

  const [clientId, setClientId] = React.useState(jobOrder.clientId);
  const initialConsultantIds = React.useMemo(() => jobOrder.consultants.map((c) => c.id), [jobOrder.consultants]);
  const [consultantIds, setConsultantIds] = React.useState<string[]>(initialConsultantIds);
  const [quality, setQuality] = React.useState<JobOrderQuality>(jobOrder.quality);
  const [status, setStatus] = React.useState<JobOrderStatus>(jobOrder.status);
  const [priorityLevel, setPriorityLevel] = React.useState(
    jobOrder.priorityLevel != null ? String(jobOrder.priorityLevel) : '',
  );
  const [salaryMin, setSalaryMin] = React.useState(jobOrder.salaryMin != null ? String(jobOrder.salaryMin) : '');
  const [salaryMax, setSalaryMax] = React.useState(jobOrder.salaryMax != null ? String(jobOrder.salaryMax) : '');
  const [salaryCurrency, setSalaryCurrency] = React.useState(jobOrder.salaryCurrency ?? '');
  const [openings, setOpenings] = React.useState(String(jobOrder.openings));
  const [description, setDescription] = React.useState(jobOrder.description ?? '');
  const [requirements, setRequirements] = React.useState(jobOrder.requirements ?? '');

  const consultantIdsKey = (ids: string[]) => [...ids].sort().join(',');
  const consultantsDirty = consultantIdsKey(consultantIds) !== consultantIdsKey(initialConsultantIds);

  const isDirty =
    jobTitleId !== (jobOrder.jobTitleId ?? '') ||
    clientId !== jobOrder.clientId ||
    consultantsDirty ||
    quality !== jobOrder.quality ||
    status !== jobOrder.status ||
    priorityLevel !== (jobOrder.priorityLevel != null ? String(jobOrder.priorityLevel) : '') ||
    salaryMin !== (jobOrder.salaryMin != null ? String(jobOrder.salaryMin) : '') ||
    salaryMax !== (jobOrder.salaryMax != null ? String(jobOrder.salaryMax) : '') ||
    salaryCurrency !== (jobOrder.salaryCurrency ?? '') ||
    openings !== String(jobOrder.openings) ||
    description !== (jobOrder.description ?? '') ||
    requirements !== (jobOrder.requirements ?? '');

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  // A job order isn't contacted independently — you contact stakeholders at
  // the client company — so "last contacted" here is just a read of the
  // client's own (org-wide) value. Fetched directly by id rather than found
  // in `clients` above: that list is capped at pageSize 100 for the
  // ClientCombobox picker, and with 1,645 clients this job order's own
  // client routinely falls outside that window — `find` would silently
  // return undefined and blank out this card (and the industry-mismatch
  // warning below) for most job orders.
  const { data: ownClientData } = useGetClient(jobOrder.clientId);
  const client = ownClientData?.status === 200 ? ownClientData.data : undefined;

  // Same capped-list problem for anything else keyed off `clients`: the
  // ClientCombobox's label lookup and the industry check just below both
  // `.find()` in that same 100-row page, so they'd show "Unknown"/null for
  // this exact client too. Merging the directly-fetched `client` in fixes
  // both for the common case (the currently-assigned client) without
  // changing what the picker's search can offer — that's the deeper,
  // pre-existing "can't pick a client past page 1" limitation, unrelated to
  // this bug.
  const clientsWithCurrent = React.useMemo(() => {
    if (!client || clients.some((c) => c.id === client.id)) return clients;
    return [client, ...clients];
  }, [clients, client]);

  // Industry-first: a Job Order has no industry of its own, only via its
  // (possibly just-changed) Client — reacts to the live `clientId` selection,
  // not the original `jobOrder.clientId`.
  const selectedClientIndustryId = clientsWithCurrent.find((c) => c.id === clientId)?.industryId ?? null;

  // The job order's own location's ancestor path — needed to check a
  // candidate consultant's location grants the same way the backend does
  // (`ancestorIds: { hasSome: grantedLocationIds } }`). Only fetched when the
  // job order actually has a location; the picker itself is never restricted
  // by this — it's purely for the out-of-scope warning below.
  const { data: locationData } = useGetLocation(jobOrder.locationId ?? '', {
    query: { enabled: !!jobOrder.locationId },
  });
  const locationAncestorIds = locationData?.status === 200 ? locationData.data.ancestorIds : [];

  // Non-blocking: which of the currently-picked consultants are outside both
  // this job order's industry (via its client) and its location. There's no
  // gate on adding them anyway — see PUT /job-orders/:id/consultants — this
  // is purely informational, the deliberate escape hatch this feature exists
  // for. Grants come back `undefined` when the caller lacks read access on
  // them; treated as "can't tell", not as a match.
  const outOfScopeConsultants = consultantIds
    .map((id) => consultants.find((c) => c.id === id))
    .filter((c): c is ConsultantEntity => c != null)
    .filter((c) => {
      // Can't tell without grant data (omitted when the caller lacks
      // consultant_industry/location:read) — never warn on a guess.
      if (c.industryIds == null && c.locationIds == null) return false;
      const industryMatch = selectedClientIndustryId != null && (c.industryIds?.includes(selectedClientIndustryId) ?? false);
      const locationMatch = c.locationIds?.some((id) => locationAncestorIds.includes(id)) ?? false;
      return !industryMatch && !locationMatch;
    });

  const { data: pipelineData, isLoading: pipelineLoading } = useGetJobOrderPipelineTimeline(jobOrder.id);
  const pipelineEvents = pipelineData?.status === 200 ? pipelineData.data : undefined;

  const { data: candidatesData } = useGetCandidates({ pageSize: 100 });
  const candidates = candidatesData?.status === 200 ? candidatesData.data.data : [];

  const updateJobOrder = useUpdateJobOrder();
  const setConsultants = useSetJobOrderConsultants();
  const isSaving = updateJobOrder.isPending || setConsultants.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await Promise.all([
        updateJobOrder.mutateAsync({
          id: jobOrder.id,
          data: toPatch({
            jobTitleId,
            clientId,
            quality,
            status,
            priorityLevel,
            salaryMin,
            salaryMax,
            salaryCurrency,
            openings,
            description,
            requirements,
          }),
        }),
        // Full-set-replace, only when the picked set actually changed — see
        // PUT /job-orders/:id/consultants (no scope check, deliberately).
        consultantsDirty ? setConsultants.mutateAsync({ id: jobOrder.id, data: { consultantIds } }) : Promise.resolve(),
      ]);
      queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetJobOrderQueryKey(jobOrder.id) });
      toast.success(`Saved changes to ${jobTitles.find((j) => j.id === jobTitleId)?.name ?? 'this job order'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save job order');
    }
  }

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/job-orders" />}
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to Job Orders
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Briefcase className="size-6" />
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">{jobOrder.jobTitle ?? 'Untitled role'}</h1>
                <Badge variant={statusVariant[jobOrder.status]}>{jobOrderStatusLabels[jobOrder.status]}</Badge>
                <Badge variant={qualityVariant[jobOrder.quality]}>
                  {jobOrderQualityLabels[jobOrder.quality]} quality
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{jobOrder.displayId}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !isSaving ? (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button type="submit" form="job-order-form" size="lg" disabled={isSaving || !isDirty}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      <form id="job-order-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="size-4 text-muted-foreground" />
                  Role
                </CardTitle>
                <CardDescription>Position, client and assignment.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="Role" htmlFor="jobTitle" description="The client's own words for the role.">
                  <CreatableCombobox
                    id="jobTitle"
                    value={jobTitleId}
                    onValueChange={setJobTitleId}
                    options={jobTitles}
                    onCreate={handleCreateJobTitle}
                  />
                </FormField>
                <FormField label="Client" htmlFor="clientId">
                  <ClientCombobox id="clientId" value={clientId} onValueChange={setClientId} clients={clientsWithCurrent} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField
                    label="Consultants"
                    htmlFor="consultantIds"
                    description="Several consultants can work this job order concurrently — adding someone outside their usual industry/location is allowed on purpose (see the warning below, not a block)."
                  >
                    <ConsultantMultiSelect
                      id="consultantIds"
                      selected={consultantIds}
                      onChange={setConsultantIds}
                      consultants={consultants}
                    />
                  </FormField>
                  {outOfScopeConsultants.length > 0 ? (
                    <p className="mt-1.5 text-xs text-warning">
                      {outOfScopeConsultants.map((c) => c.fullName).join(', ')}{' '}
                      {outOfScopeConsultants.length === 1 ? "isn't" : "aren't"} tagged for this job order's industry
                      or location — still fine to add.
                    </p>
                  ) : null}
                </div>
                <FormField
                  label="Location"
                  htmlFor="location"
                  description="Read-only for now — location editing isn't wired up here yet."
                >
                  <Input id="location" value={jobOrder.location ?? '—'} disabled />
                </FormField>
                <FormField label="Quality" htmlFor="quality">
                  <EnumSelect
                    id="quality"
                    value={quality}
                    onValueChange={(v) => setQuality(v as JobOrderQuality)}
                    options={qualityOptions}
                  />
                </FormField>
                <FormField label="Status" htmlFor="status">
                  <EnumSelect
                    id="status"
                    value={status}
                    onValueChange={(v) => setStatus(v as JobOrderStatus)}
                    options={statusOptions}
                  />
                </FormField>
                <FormField label="Priority" htmlFor="priorityLevel">
                  <EnumSelect
                    id="priorityLevel"
                    value={priorityLevel}
                    onValueChange={setPriorityLevel}
                    options={priorityOptions}
                    placeholder="Not set"
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="size-4 text-muted-foreground" />
                  Compensation & openings
                </CardTitle>
                <CardDescription>Salary range and headcount.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="Salary min" htmlFor="salaryMin">
                  <Input
                    id="salaryMin"
                    type="number"
                    min={0}
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                  />
                </FormField>
                <FormField label="Salary max" htmlFor="salaryMax">
                  <Input
                    id="salaryMax"
                    type="number"
                    min={0}
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                  />
                </FormField>
                <FormField label="Currency" htmlFor="salaryCurrency">
                  <Input
                    id="salaryCurrency"
                    placeholder="e.g. SGD"
                    value={salaryCurrency}
                    onChange={(e) => setSalaryCurrency(e.target.value)}
                  />
                </FormField>
                <FormField label="Openings" htmlFor="openings">
                  <Input
                    id="openings"
                    type="number"
                    min={1}
                    value={openings}
                    onChange={(e) => setOpenings(e.target.value)}
                  />
                </FormField>
                <FormField label="Filled" htmlFor="filledCount">
                  {/* Derived from actual placements (see PlacementsService), not
                      hand-editable — the two write paths used to be able to
                      drift out of sync. */}
                  <p id="filledCount" className="flex h-9 items-center text-sm text-muted-foreground">
                    {jobOrder.filledCount}
                  </p>
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  Description
                </CardTitle>
                <CardDescription>Job description and requirements.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FormField label="Description" htmlFor="description">
                  <textarea
                    id="description"
                    className={textareaClass}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </FormField>
                <FormField label="Requirements" htmlFor="requirements">
                  <textarea
                    id="requirements"
                    className={textareaClass}
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                  />
                </FormField>
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
                <CardDescription>Candidates submitted to this job order.</CardDescription>
              </CardHeader>
              <CardContent>
                <SubmissionsCard
                  mode="jobOrder"
                  jobOrderId={jobOrder.id}
                  candidates={candidates}
                  clientIndustryId={client?.industryId}
                  jobOrderLocationId={jobOrder.locationId}
                  onChanged={() =>
                    queryClient.invalidateQueries({
                      queryKey: getGetJobOrderPipelineTimelineQueryKey(jobOrder.id),
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
                <CardDescription>Submission and stage changes for every candidate on this job order.</CardDescription>
              </CardHeader>
              <CardContent>
                <PipelineTimeline events={pipelineEvents} isLoading={pipelineLoading} showCandidate />
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" />
                  Client contact
                </CardTitle>
                <CardDescription>
                  A job order isn&apos;t contacted directly — this reflects the client company&apos;s
                  own org-wide last contact.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <span className="text-muted-foreground">Last contacted</span>
                <span>
                  {client?.lastContactedAt ? new Date(client.lastContactedAt).toLocaleString() : '—'}
                </span>
                <span className="text-muted-foreground">Method</span>
                <span>
                  {client?.lastContactType
                    ? (contactTypeLabels[client.lastContactType as ContactType] ?? client.lastContactType)
                    : '—'}
                </span>
                <span className="text-muted-foreground">Contacted by</span>
                <span>{client?.lastContactedBy ?? '—'}</span>
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
                <span className="font-mono text-xs leading-5">{jobOrder.displayId}</span>
                <span className="text-muted-foreground">Received</span>
                <span>{new Date(jobOrder.receivedAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground">Closed</span>
                <span>{jobOrder.closedAt ? new Date(jobOrder.closedAt).toLocaleDateString() : '—'}</span>
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(jobOrder.createdAt).toLocaleDateString()}</span>
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(jobOrder.updatedAt).toLocaleDateString()}</span>
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
              You have unsaved changes to {jobOrder.jobTitle ?? 'this job order'}. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Leave without saving</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
