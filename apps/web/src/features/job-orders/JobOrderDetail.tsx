'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Briefcase, CornerDownLeft, FileText } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactIconRow, JobOrderPipelineCard } from '@/components/JobOrderPipelineCard';
import { FileUploadField } from '@/components/FileUploadField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useGetCandidates } from '@/lib/api/generated/candidates/candidates';
import { useGetClient } from '@/lib/api/generated/clients/clients';
import {
  getGetJobOrderQueryKey,
  getGetJobOrdersQueryKey,
  useGetJobOrder,
  useUpdateJobOrder,
} from '@/lib/api/generated/job-orders/job-orders';
import { useUploadJobOrderFile } from '@/lib/api/generated/uploads/uploads';
import type { UpdateJobOrderDto } from '@/lib/api/generated/types';
import { type JobOrder, jobOrderQualityLabels, jobOrderStatusLabels, qualityVariant, statusVariant } from './schema';

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

  const { data: candidatesData } = useGetCandidates({ pageSize: 100 });
  const candidates = candidatesData?.status === 200 ? candidatesData.data.data : [];

  // Only fetched for its industryId (not otherwise on JobOrderEntity, which
  // strips it back out — see job-orders.service.ts's toEntity) — feeds the
  // pipeline table's non-blocking industry-mismatch warning on submit.
  const { data: clientData } = useGetClient(jobOrder.clientId);
  const client = clientData?.status === 200 ? clientData.data : undefined;

  const [description, setDescription] = React.useState(jobOrder.description ?? '');
  const [jdFileUrl, setJdFileUrl] = React.useState(jobOrder.jdFileUrl ?? '');
  const [clientAdsUrl, setClientAdsUrl] = React.useState(jobOrder.clientAdsUrl ?? '');
  const [otherDocumentsUrl, setOtherDocumentsUrl] = React.useState(jobOrder.otherDocumentsUrl ?? '');

  const isDirty =
    description !== (jobOrder.description ?? '') ||
    jdFileUrl !== (jobOrder.jdFileUrl ?? '') ||
    clientAdsUrl !== (jobOrder.clientAdsUrl ?? '') ||
    otherDocumentsUrl !== (jobOrder.otherDocumentsUrl ?? '');

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

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(() => formRef.current?.requestSubmit(), isDirty && !updateJobOrder.isPending);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: UpdateJobOrderDto = {
      description: description || undefined,
      jdFileUrl: jdFileUrl || undefined,
      clientAdsUrl: clientAdsUrl || undefined,
      otherDocumentsUrl: otherDocumentsUrl || undefined,
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
              <div className="flex items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {jobOrder.jobTitle ?? 'Untitled role'}
                </h1>
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
            <JobOrderPipelineCard jobOrder={jobOrder} candidates={candidates} clientIndustryId={client?.industryId} />
          </div>

          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Information
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Company</span>
                <Link href={`/companies/${jobOrder.clientId}`} className="font-medium hover:underline">
                  {jobOrder.clientName ?? 'Unknown company'}
                </Link>
              </div>
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
