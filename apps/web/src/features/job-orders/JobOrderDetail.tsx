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
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ClientCombobox } from '@/components/ClientCombobox';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { PipelineTimeline } from '@/components/PipelineTimeline';
import { SubmissionsCard } from '@/components/SubmissionsCard';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import {
  getGetJobOrderPipelineTimelineQueryKey,
  getGetJobOrderQueryKey,
  getGetJobOrdersQueryKey,
  useGetJobOrder,
  useGetJobOrderPipelineTimeline,
  useUpdateJobOrder,
} from '@/lib/api/generated/job-orders/job-orders';
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
  jobTitle: string;
  clientId: string;
  consultantId: string;
  department: string;
  city: string;
  suburb: string;
  quality: JobOrderQuality;
  status: JobOrderStatus;
  priorityLevel: string;
  isReplacement: boolean;
  isCollaborated: boolean;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  openings: string;
  filledCount: string;
  description: string;
  requirements: string;
}) {
  return {
    jobTitle: values.jobTitle,
    clientId: values.clientId,
    consultantId: values.consultantId || null,
    department: values.department || null,
    city: values.city || null,
    suburb: values.suburb || null,
    quality: values.quality,
    status: values.status,
    priorityLevel: values.priorityLevel === '' ? null : Number(values.priorityLevel),
    isReplacement: values.isReplacement,
    isCollaborated: values.isCollaborated,
    salaryMin: values.salaryMin === '' ? null : Number(values.salaryMin),
    salaryMax: values.salaryMax === '' ? null : Number(values.salaryMax),
    salaryCurrency: values.salaryCurrency || null,
    openings: Number(values.openings),
    filledCount: Number(values.filledCount),
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

  const [jobTitle, setJobTitle] = React.useState(jobOrder.jobTitle);
  const [clientId, setClientId] = React.useState(jobOrder.clientId);
  const [consultantId, setConsultantId] = React.useState(jobOrder.consultantId ?? '');
  const [department, setDepartment] = React.useState(jobOrder.department ?? '');
  const [city, setCity] = React.useState(jobOrder.city ?? '');
  const [suburb, setSuburb] = React.useState(jobOrder.suburb ?? '');
  const [quality, setQuality] = React.useState<JobOrderQuality>(jobOrder.quality);
  const [status, setStatus] = React.useState<JobOrderStatus>(jobOrder.status);
  const [priorityLevel, setPriorityLevel] = React.useState(
    jobOrder.priorityLevel != null ? String(jobOrder.priorityLevel) : '',
  );
  const [isReplacement, setIsReplacement] = React.useState(jobOrder.isReplacement);
  const [isCollaborated, setIsCollaborated] = React.useState(jobOrder.isCollaborated);
  const [salaryMin, setSalaryMin] = React.useState(jobOrder.salaryMin != null ? String(jobOrder.salaryMin) : '');
  const [salaryMax, setSalaryMax] = React.useState(jobOrder.salaryMax != null ? String(jobOrder.salaryMax) : '');
  const [salaryCurrency, setSalaryCurrency] = React.useState(jobOrder.salaryCurrency ?? '');
  const [openings, setOpenings] = React.useState(String(jobOrder.openings));
  const [filledCount, setFilledCount] = React.useState(String(jobOrder.filledCount));
  const [description, setDescription] = React.useState(jobOrder.description ?? '');
  const [requirements, setRequirements] = React.useState(jobOrder.requirements ?? '');

  const isDirty =
    jobTitle !== jobOrder.jobTitle ||
    clientId !== jobOrder.clientId ||
    consultantId !== (jobOrder.consultantId ?? '') ||
    department !== (jobOrder.department ?? '') ||
    city !== (jobOrder.city ?? '') ||
    suburb !== (jobOrder.suburb ?? '') ||
    quality !== jobOrder.quality ||
    status !== jobOrder.status ||
    priorityLevel !== (jobOrder.priorityLevel != null ? String(jobOrder.priorityLevel) : '') ||
    isReplacement !== jobOrder.isReplacement ||
    isCollaborated !== jobOrder.isCollaborated ||
    salaryMin !== (jobOrder.salaryMin != null ? String(jobOrder.salaryMin) : '') ||
    salaryMax !== (jobOrder.salaryMax != null ? String(jobOrder.salaryMax) : '') ||
    salaryCurrency !== (jobOrder.salaryCurrency ?? '') ||
    openings !== String(jobOrder.openings) ||
    filledCount !== String(jobOrder.filledCount) ||
    description !== (jobOrder.description ?? '') ||
    requirements !== (jobOrder.requirements ?? '');

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  // A job order isn't contacted independently — you contact stakeholders at
  // the client company — so "last contacted" here is just a read of the
  // client's own (org-wide) value, already in `clients` from the combobox
  // fetch above; no separate job-order-level tracking.
  const client = clients.find((c) => c.id === jobOrder.clientId);

  const { data: pipelineData, isLoading: pipelineLoading } = useGetJobOrderPipelineTimeline(jobOrder.id);
  const pipelineEvents = pipelineData?.status === 200 ? pipelineData.data : undefined;

  const { data: candidatesData } = useGetCandidates({ pageSize: 100 });
  const candidates = candidatesData?.status === 200 ? candidatesData.data.data : [];

  const updateJobOrder = useUpdateJobOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetJobOrderQueryKey(jobOrder.id) });
        toast.success(`Saved changes to ${jobTitle}`);
      },
      onError: (err) => toast.error(err.message || 'Failed to save job order'),
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateJobOrder.mutate({
      id: jobOrder.id,
      data: toPatch({
        jobTitle,
        clientId,
        consultantId,
        department,
        city,
        suburb,
        quality,
        status,
        priorityLevel,
        isReplacement,
        isCollaborated,
        salaryMin,
        salaryMax,
        salaryCurrency,
        openings,
        filledCount,
        description,
        requirements,
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
                <h1 className="font-heading text-2xl font-semibold tracking-tight">{jobOrder.jobTitle}</h1>
                <Badge variant={statusVariant[jobOrder.status]}>{jobOrderStatusLabels[jobOrder.status]}</Badge>
                <Badge variant={qualityVariant[jobOrder.quality]}>
                  {jobOrderQualityLabels[jobOrder.quality]} quality
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{jobOrder.displayId}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !updateJobOrder.isPending ? (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button type="submit" form="job-order-form" size="lg" disabled={updateJobOrder.isPending || !isDirty}>
              {updateJobOrder.isPending ? 'Saving…' : 'Save changes'}
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
                <FormField label="Role" htmlFor="jobTitle">
                  <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </FormField>
                <FormField label="Client" htmlFor="clientId">
                  <ClientCombobox id="clientId" value={clientId} onValueChange={setClientId} clients={clients} />
                </FormField>
                <FormField label="Consultant" htmlFor="consultantId">
                  <ConsultantCombobox
                    id="consultantId"
                    value={consultantId}
                    onValueChange={setConsultantId}
                    consultants={consultants}
                  />
                </FormField>
                <FormField label="Department" htmlFor="department">
                  <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </FormField>
                <FormField label="City" htmlFor="city">
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </FormField>
                <FormField label="Suburb" htmlFor="suburb">
                  <Input id="suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} />
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
                <label htmlFor="isReplacement" className="flex items-center gap-2 pt-6 text-sm">
                  <Checkbox
                    id="isReplacement"
                    checked={isReplacement}
                    onCheckedChange={(checked) => setIsReplacement(!!checked)}
                  />
                  Replacement job order
                </label>
                <label htmlFor="isCollaborated" className="flex items-center gap-2 pt-6 text-sm">
                  <Checkbox
                    id="isCollaborated"
                    checked={isCollaborated}
                    onCheckedChange={(checked) => setIsCollaborated(!!checked)}
                  />
                  Collaborated (split-desk)
                </label>
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
                  <Input
                    id="filledCount"
                    type="number"
                    min={0}
                    value={filledCount}
                    onChange={(e) => setFilledCount(e.target.value)}
                  />
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
              You have unsaved changes to {jobOrder.jobTitle}. Leaving now will discard them.
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
