'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, CornerDownLeft, FileText } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClientCombobox } from '@/components/ClientCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { ContactIconRow, JobOrderPipelineCard } from '@/components/JobOrderPipelineCard';
import { FileUploadField } from '@/components/FileUploadField';
import { TagMultiSelect, type TagOption } from '@/components/TagMultiSelect';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useGetClient } from '@/lib/api/generated/clients/clients';
import {
  getGetJobOrderQueryKey,
  getGetJobOrdersQueryKey,
  setJobOrderKeyStakeholders as setJobOrderKeyStakeholdersRequest,
  useGetJobOrder,
  useUpdateJobOrder,
} from '@/lib/api/generated/job-orders/job-orders';
import { useCreateJobTitle } from '@/lib/api/generated/job-titles/job-titles';
import { useGetStakeholders } from '@/lib/api/generated/stakeholders/stakeholders';
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

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function sameOptionalNumber(a: string, b: number | null | undefined): boolean {
  const parsed = parseOptionalNumber(a);
  if (parsed === undefined) return b == null;
  return b != null && parsed === b;
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
  const [salaryMin, setSalaryMin] = React.useState(
    jobOrder.salaryMin != null ? String(jobOrder.salaryMin) : '',
  );
  const [salaryMax, setSalaryMax] = React.useState(
    jobOrder.salaryMax != null ? String(jobOrder.salaryMax) : '',
  );
  const [salaryCurrency, setSalaryCurrency] = React.useState(jobOrder.salaryCurrency ?? '');
  const [openings, setOpenings] = React.useState(String(jobOrder.openings));
  const [keyStakeholderIds, setKeyStakeholderIds] = React.useState(
    () => (jobOrder.keyStakeholders ?? []).map((s) => s.id),
  );
  const [saving, setSaving] = React.useState(false);

  const { data: stakeholdersData } = useGetStakeholders(
    { clientId, pageSize: 100 },
    { query: { enabled: Boolean(clientId) } },
  );
  const clientStakeholders = stakeholdersData?.status === 200 ? stakeholdersData.data.data : [];
  const stakeholderOptions: TagOption[] = clientStakeholders.map((s) => ({
    value: s.id,
    label: [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed contact',
  }));
  // Labels for already-selected ids that aren't in the (re)loaded client list
  // yet — e.g. right after a company change before the new query settles, or
  // a soft-deleted contact still hanging on the join until Save prunes it.
  const selectedStakeholderMeta = React.useMemo(() => {
    const fromEntity = new Map(
      (jobOrder.keyStakeholders ?? []).map((s) => [s.id, s] as const),
    );
    const fromClient = new Map(
      clientStakeholders.map((s) => [
        s.id,
        {
          id: s.id,
          name: [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed contact',
          email: s.email,
          mobile: s.mobile,
          linkedinUrl: s.linkedinUrl,
        },
      ] as const),
    );
    return keyStakeholderIds.map((id) => {
      const live = fromClient.get(id);
      if (live) return live;
      const stale = fromEntity.get(id);
      if (stale) return stale;
      return { id, name: id, email: null, mobile: null, linkedinUrl: null };
    });
  }, [keyStakeholderIds, clientStakeholders, jobOrder.keyStakeholders]);

  // Drop picks that aren't on the newly selected company once its stakeholder
  // list has loaded — same outcome the API enforces on Save. Only when the
  // company actually changed; don't prune the original selection just because
  // the list page misses a soft-deleted or off-page contact.
  React.useEffect(() => {
    if (clientId === jobOrder.clientId) return;
    if (stakeholdersData?.status !== 200) return;
    const allowed = new Set(stakeholdersData.data.data.map((s) => s.id));
    setKeyStakeholderIds((prev) => {
      const next = prev.filter((id) => allowed.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [clientId, jobOrder.clientId, stakeholdersData]);

  const initialStakeholderIds = (jobOrder.keyStakeholders ?? []).map((s) => s.id);
  const stakeholdersDirty =
    keyStakeholderIds.length !== initialStakeholderIds.length ||
    keyStakeholderIds.some((id) => !initialStakeholderIds.includes(id));

  const isDirty =
    description !== (jobOrder.description ?? '') ||
    jdFileUrl !== (jobOrder.jdFileUrl ?? '') ||
    clientAdsUrl !== (jobOrder.clientAdsUrl ?? '') ||
    otherDocumentsUrl !== (jobOrder.otherDocumentsUrl ?? '') ||
    jobTitleId !== (jobOrder.jobTitleId ?? '') ||
    clientId !== jobOrder.clientId ||
    status !== jobOrder.status ||
    quality !== jobOrder.quality ||
    !sameOptionalNumber(salaryMin, jobOrder.salaryMin) ||
    !sameOptionalNumber(salaryMax, jobOrder.salaryMax) ||
    salaryCurrency !== (jobOrder.salaryCurrency ?? '') ||
    !sameOptionalNumber(openings, jobOrder.openings) ||
    stakeholdersDirty;

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);

  const updateJobOrder = useUpdateJobOrder({
    mutation: {
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

  // Suffixed with the field name ("Medium quality") the way the old static
  // quality badge already read. Values and colors still come from the shared
  // option list in schema.ts; only the label text differs.
  const qualityPillOptions = React.useMemo(
    () => qualityOptions.map((o) => ({ ...o, label: `${o.label} quality` })),
    [],
  );

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(() => formRef.current?.requestSubmit(), isDirty && !saving);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const openingsValue = parseOptionalNumber(openings);
    if (openingsValue == null || openingsValue < 1) {
      toast.error('Openings must be at least 1');
      return;
    }

    const data: UpdateJobOrderDto = {
      clientId,
      jobTitleId: jobTitleId || undefined,
      description: description || undefined,
      jdFileUrl: jdFileUrl || undefined,
      clientAdsUrl: clientAdsUrl || undefined,
      otherDocumentsUrl: otherDocumentsUrl || undefined,
      status,
      quality,
      salaryMin: parseOptionalNumber(salaryMin),
      salaryMax: parseOptionalNumber(salaryMax),
      salaryCurrency: salaryCurrency.trim() || undefined,
      openings: openingsValue,
    };

    setSaving(true);
    try {
      await updateJobOrder.mutateAsync({ id: jobOrder.id, data });
      if (stakeholdersDirty || clientId !== jobOrder.clientId) {
        await setJobOrderKeyStakeholdersRequest(jobOrder.id, {
          stakeholderIds: keyStakeholderIds,
        });
      }
      queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetJobOrderQueryKey(jobOrder.id) });
      toast.success(`Saved changes to ${jobOrder.jobTitle ?? 'this job order'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save job order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout className="overflow-auto">
      <div className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
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
          <div className="flex items-center gap-3">
            {isDirty && !saving ? (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button type="submit" form="job-order-form" size="lg" disabled={saving || !isDirty}>
              {saving ? (
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
            <JobOrderPipelineCard jobOrder={jobOrder} />          </div>

          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                Information
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <FormField label="Company" htmlFor="clientId" required orientation="horizontal">
                <div className="flex items-center gap-1.5">
                  <ClientCombobox
                    id="clientId"
                    value={clientId}
                    onValueChange={setClientId}
                    selectedLabel={clientId === jobOrder.clientId ? client?.companyName : undefined}
                    disabled={saving}
                    className="flex-1"
                  />
                  <Link
                    href={`/companies/${clientId}?from=job-order&jobOrderId=${jobOrder.id}&jobOrderTitle=${encodeURIComponent(jobOrder.jobTitle ?? '')}`}
                    aria-label="View company page"
                    title="View company page"
                    className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </FormField>
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
                  disabled={saving}
                />
              </FormField>
              <FormField label="Role Status" htmlFor="status" orientation="horizontal">
                <EnumSelect
                  id="status"
                  value={status}
                  onValueChange={(v) => setStatus(v as JobOrderStatus)}
                  options={statusOptions}
                  disabled={saving}
                  size="badge"
                  className="w-fit"
                />
              </FormField>
              <FormField label="Quality" htmlFor="quality" orientation="horizontal">
                <EnumSelect
                  id="quality"
                  value={quality}
                  onValueChange={(v) => setQuality(v as JobOrderQuality)}
                  options={qualityPillOptions}
                  disabled={saving}
                  size="badge"
                  className="w-fit"
                />
              </FormField>
              <FormField label="Salary" htmlFor="salaryMin" orientation="horizontal">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    id="salaryMin"
                    type="number"
                    inputMode="decimal"
                    placeholder="Min"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    disabled={saving}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    id="salaryMax"
                    type="number"
                    inputMode="decimal"
                    placeholder="Max"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                    disabled={saving}
                    className="w-24"
                    aria-label="Salary max"
                  />
                  <Input
                    id="salaryCurrency"
                    placeholder="AUD"
                    value={salaryCurrency}
                    onChange={(e) => setSalaryCurrency(e.target.value)}
                    disabled={saving}
                    className="w-16"
                    aria-label="Salary currency"
                  />
                </div>
              </FormField>
              <FormField label="Opening" htmlFor="openings" orientation="horizontal">
                <div className="flex items-center gap-2">
                  <Input
                    id="openings"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={openings}
                    onChange={(e) => setOpenings(e.target.value)}
                    disabled={saving}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">({jobOrder.filledCount} filled)</span>
                </div>
              </FormField>
              <FormField label="Key Stakeholders" htmlFor="keyStakeholders" orientation="horizontal">
                <div className="flex w-full flex-col gap-2">
                  <TagMultiSelect
                    title="Key Stakeholders"
                    options={stakeholderOptions}
                    selected={keyStakeholderIds}
                    onChange={setKeyStakeholderIds}
                    disabled={saving || !clientId}
                    fullCellHitArea={false}
                  />
                  {selectedStakeholderMeta.length > 0 ? (
                    <ul className="flex flex-col gap-1.5" id="keyStakeholders">
                      {selectedStakeholderMeta.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2">
                          <Link
                            href={`/stakeholders/${s.id}`}
                            className="truncate font-medium underline hover:font-semibold"
                          >
                            {s.name}
                          </Link>
                          <ContactIconRow
                            email={s.email}
                            mobile={s.mobile}
                            linkedinUrl={s.linkedinUrl}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </FormField>              <div className="flex items-center justify-between gap-2">
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
