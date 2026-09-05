'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Briefcase, CornerDownLeft, FileText } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClientCombobox } from '@/components/ClientCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { ContactIconRow, JobOrderPipelineCard } from '@/components/JobOrderPipelineCard';
import { FileUploadField } from '@/components/FileUploadField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useGetClient } from '@/lib/api/generated/clients/clients';
import {
  getGetJobOrderQueryKey,
  getGetJobOrdersQueryKey,
  useGetJobOrder,
  useUpdateJobOrder,
} from '@/lib/api/generated/job-orders/job-orders';
import { useCreateJobTitle } from '@/lib/api/generated/job-titles/job-titles';
import { useJobTitleOptions } from '@/hooks/use-catalog-options';
import { useUploadJobOrderFile } from '@/lib/api/generated/uploads/uploads';
import type { UpdateJobOrderDto } from '@/lib/api/generated/types';
import {
  type JobOrder,
  type JobOrderQuality,
  type JobOrderStatus,
  qualityOptions,
  statusOptions,
} from './schema';

const textareaClass =
  'min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function formatSalary(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return '—';
  const cur = currency ? `${currency} ` : '';
  if (min != null && max != null) return `${cur}${min.toLocaleString()} – ${max.toLocaleString()}`;
  return `${cur}${(min ?? max)!.toLocaleString()}`;
}

export function JobOrderDetail({ id }: { id: string }) {
  const { data, isLoading, isError, error } = useGetJobOrder(id);
  const jobOrder = data?.status === 200 ? data.data : undefined;

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

  // key: remount when a different job order loads so local state resets.
  return <JobOrderDetailView key={jobOrder.id} jobOrder={jobOrder} />;
}

function JobOrderDetailView({ jobOrder }: { jobOrder: JobOrder }) {
  const queryClient = useQueryClient();


  // Only fetched for its industryId (not otherwise on JobOrderEntity, which
  // strips it back out — see job-orders.service.ts's toEntity) — feeds the
  // pipeline table's non-blocking industry-mismatch warning on submit.
  const { data: clientData } = useGetClient(jobOrder.clientId);
  const client = clientData?.status === 200 ? clientData.data : undefined;


  // Server-searched: the catalog is far larger than one page, so a pre-fetched
  // slice can't offer most of it (see useJobTitleOptions).
  const jobTitleSearch = useJobTitleOptions();
  const createJobTitle = useCreateJobTitle();
  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add job title');
    return res.data;
  }

  const [description, setDescription] = React.useState(jobOrder.description ?? '');
  const [jdFileUrl, setJdFileUrl] = React.useState(jobOrder.jdFileUrl ?? '');
  const [clientAdsUrl, setClientAdsUrl] = React.useState(jobOrder.clientAdsUrl ?? '');
  const [otherDocumentsUrl, setOtherDocumentsUrl] = React.useState(jobOrder.otherDocumentsUrl ?? '');
  const [jobTitleId, setJobTitleId] = React.useState(jobOrder.jobTitleId ?? '');

  // The selected title usually isn't in the current result page — there's no
  // single-by-id job title endpoint to reuse, so the resolved name already on
  // the entity is what the trigger falls back to.
  const selectedJobTitleLabel =
    jobTitleSearch.options.find((jt) => jt.id === jobTitleId)?.name ??
    (jobTitleId === jobOrder.jobTitleId ? (jobOrder.jobTitle ?? undefined) : undefined);
  const [clientId, setClientId] = React.useState(jobOrder.clientId);
  const [status, setStatus] = React.useState<JobOrderStatus>(jobOrder.status);
  const [quality, setQuality] = React.useState<JobOrderQuality>(jobOrder.quality);

  const isDirty =
    description !== (jobOrder.description ?? '') ||
    jdFileUrl !== (jobOrder.jdFileUrl ?? '') ||
    clientAdsUrl !== (jobOrder.clientAdsUrl ?? '') ||
    otherDocumentsUrl !== (jobOrder.otherDocumentsUrl ?? '') ||
    jobTitleId !== (jobOrder.jobTitleId ?? '') ||
    clientId !== jobOrder.clientId ||
    status !== jobOrder.status ||
    quality !== jobOrder.quality;

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  const updateJobOrder = useUpdateJobOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetJobOrderQueryKey(jobOrder.id) });
        toast.success(`Saved changes to ${jobOrder.jobTitle ?? 'this job order'}`);
      },
      onError: (err) => toast.error(err.message || 'Failed to save job order'),
    },
  });

  const uploadJobOrderFile = useUploadJobOrderFile();
  async function handleUploadFile(file: File) {
    // customFetch throws on any non-2xx response, so a resolved call is
    // always the 201 envelope — this guard is just for TypeScript's
    // discriminated-union narrowing (same as ImportDialog's `upload` prop).
    const res = await uploadJobOrderFile.mutateAsync({ data: { file } });
    if (res.status !== 201) throw new Error('Upload failed');
    return res.data;
  }

  // Live label for the header — reflects an in-progress edit before it's saved.
  const selectedJobTitle = selectedJobTitleLabel ?? 'Untitled role';

  // Suffixed with the field name ("Medium quality") the way the old static
  // quality badge already read. Values and colors still come from the shared
  // option list in schema.ts; only the label text differs.
  const qualityPillOptions = React.useMemo(
    () => qualityOptions.map((o) => ({ ...o, label: `${o.label} quality` })),
    [],
  );

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(() => formRef.current?.requestSubmit(), isDirty && !updateJobOrder.isPending);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: UpdateJobOrderDto = {
      clientId,
      jobTitleId: jobTitleId || undefined,
      description: description || undefined,
      jdFileUrl: jdFileUrl || undefined,
      clientAdsUrl: clientAdsUrl || undefined,
      otherDocumentsUrl: otherDocumentsUrl || undefined,
      status,
      quality,
    };
    updateJobOrder.mutate({ id: jobOrder.id, data });
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
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{selectedJobTitle}</h1>
              {/* Click-to-edit pills, on the subheading line beside the
                  displayId rather than crowding the title. Like
                  `selectedJobTitle` above, they show the in-progress value and
                  are committed by "Save changes" with everything else on the
                  page — deliberately not save-on-select, so one page doesn't
                  mix two save models and the unsaved-changes guard stays
                  honest. flex-wrap: three pills plus the id overflow a narrow
                  viewport, and this row shouldn't push the Save button off. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{jobOrder.displayId}</span>
                <EnumSelect
                  value={status}
                  onValueChange={(v) => setStatus(v as JobOrderStatus)}
                  options={statusOptions}
                  disabled={updateJobOrder.isPending}
                  size="badge"
                  className="w-fit"
                />
                <EnumSelect
                  value={quality}
                  onValueChange={(v) => setQuality(v as JobOrderQuality)}
                  options={qualityPillOptions}
                  disabled={updateJobOrder.isPending}
                  size="badge"
                  className="w-fit"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !updateJobOrder.isPending ? (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button type="submit" form="job-order-form" size="lg" disabled={updateJobOrder.isPending || !isDirty}>
              {updateJobOrder.isPending ? (
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
        </div>
      </div>

      <form
        id="job-order-form"
        ref={formRef}
        onSubmit={handleSubmit}
        onKeyDown={blockImplicitEnterSubmit}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <JobOrderPipelineCard
              jobOrder={jobOrder}
              clientIndustryId={client?.industryId}
              clientIndustry={client?.industry}
            />
          </div>

          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Information
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <FormField label="Role" htmlFor="jobTitle" orientation="horizontal">
                <CreatableCombobox
                  id="jobTitle"
                  value={jobTitleId}
                  onValueChange={setJobTitleId}
                  options={jobTitleSearch.options}
                  onQueryChange={jobTitleSearch.onQueryChange}
                  isFetching={jobTitleSearch.isFetching}
                  selectedLabel={selectedJobTitleLabel}
                  onCreate={handleCreateJobTitle}
                  placeholder="e.g. Production Manager"
                  disabled={updateJobOrder.isPending}
                />
              </FormField>
              <FormField label="Company" htmlFor="clientId" required orientation="horizontal">
                <div className="flex items-center gap-1.5">
                  <ClientCombobox
                    id="clientId"
                    value={clientId}
                    onValueChange={setClientId}
                    selectedLabel={client?.companyName}
                    disabled={updateJobOrder.isPending}
                    className="flex-1"
                  />
                  <Link
                    href={`/companies/${jobOrder.clientId}?from=job-order&jobOrderId=${jobOrder.id}&jobOrderTitle=${encodeURIComponent(jobOrder.jobTitle ?? '')}`}
                    aria-label="View company page"
                    title="View company page"
                    className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </FormField>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Salary</span>
                <span className="font-medium">
                  {formatSalary(jobOrder.salaryMin, jobOrder.salaryMax, jobOrder.salaryCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Opening</span>
                <span className="font-medium">
                  {jobOrder.openings}
                  <span className="ml-1 text-xs text-muted-foreground">({jobOrder.filledCount} filled)</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Key Stakeholder</span>
                {jobOrder.keyStakeholderId ? (
                  <Link
                    href={`/stakeholders/${jobOrder.keyStakeholderId}`}
                    className="font-medium underline hover:font-semibold"
                  >
                    {jobOrder.keyStakeholderName}
                  </Link>
                ) : (
                  <span className="font-medium text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Stakeholder Contact</span>
                <ContactIconRow
                  email={jobOrder.keyStakeholderEmail}
                  mobile={jobOrder.keyStakeholderMobile}
                  linkedinUrl={jobOrder.keyStakeholderLinkedinUrl}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Created Date</span>
                <span className="font-medium">{shortDateFormatter.format(new Date(jobOrder.createdAt))}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                id="description"
                aria-label="Description"
                className={textareaClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">Files History - e.g. JD Ads Other Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="divide-x divide-border">
                      <TableHead>JD</TableHead>
                      <TableHead>Client Ads</TableHead>
                      <TableHead>Other Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="divide-x divide-border">
                      <TableCell>
                        <FileUploadField
                          id="jdFileUrl"
                          value={jdFileUrl}
                          onChange={(url) => setJdFileUrl(url ?? '')}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                      <TableCell>
                        <FileUploadField
                          id="clientAdsUrl"
                          value={clientAdsUrl}
                          onChange={(url) => setClientAdsUrl(url ?? '')}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                      <TableCell>
                        <FileUploadField
                          id="otherDocumentsUrl"
                          value={otherDocumentsUrl}
                          onChange={(url) => setOtherDocumentsUrl(url ?? '')}
                          upload={handleUploadFile}
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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
