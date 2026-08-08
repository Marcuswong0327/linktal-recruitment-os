'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Contact,
  CornerDownLeft,
  FileText,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import { SpecializationCombobox } from '@/components/SpecializationPicker';
import { UrlField } from '@/components/UrlField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useIsMac } from '@/hooks/use-is-mac';
import { blockImplicitEnterSubmit, useSaveShortcut } from '@/hooks/use-save-shortcut';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import {
  getGetClientQueryKey,
  getGetClientsQueryKey,
  useDeleteClient,
  useGetClient,
  useRestoreClient,
  useUpdateClient,
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
} from '@/lib/api/generated/specializations/specializations';
import { useGetStakeholders } from '@/lib/api/generated/stakeholders/stakeholders';
import { getGetTobsQueryKey, useCreateTob, useGetTobs } from '@/lib/api/generated/tobs/tobs';
import type { ClientEntity, CreateTobDto, UpdateClientDto } from '@/lib/api/generated/types';
import { formatDate, qualityOptions, statusOptions, type ClientQuality, type ClientStatus } from './schema';

function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function CompanyDetail({
  id,
  canEdit = true,
  canDelete = true,
}: {
  id: string;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { data, isLoading, isError, error } = useGetClient(id);
  const company = data?.status === 200 ? data.data : undefined;

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
            {error instanceof Error ? error.message : `No company with ID ${id}.`}
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

  // key: remount when a different company loads so local form state resets.
  return <CompanyEditForm key={company.id} company={company} canEdit={canEdit} canDelete={canDelete} />;
}

function CompanyEditForm({
  company,
  canEdit,
  canDelete,
}: {
  company: ClientEntity;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = React.useState(company.companyName);
  const [industryId, setIndustryId] = React.useState(company.industryId);
  const [specializationId, setSpecializationId] = React.useState(company.specializationId ?? '');
  const [locations, setLocations] = React.useState<LocationOption[]>(() =>
    company.locationIds.map((locId, i) => ({ id: locId, name: company.locations[i] ?? locId })),
  );
  const [addresses, setAddresses] = React.useState((company.addresses ?? []).join('\n'));
  const [suburbsAndPostcodes, setSuburbsAndPostcodes] = React.useState((company.suburbsAndPostcodes ?? []).join('\n'));
  const [website, setWebsite] = React.useState(company.website ?? '');
  const [seekJobMarketUrl, setSeekJobMarketUrl] = React.useState(company.seekJobMarketUrl ?? '');
  const [linkedinJobMarketUrl, setLinkedinJobMarketUrl] = React.useState(company.linkedinJobMarketUrl ?? '');
  const [generalDescription, setGeneralDescription] = React.useState(company.generalDescription ?? '');
  const [status, setStatus] = React.useState<ClientStatus>(company.status);
  const [quality, setQuality] = React.useState<ClientQuality>(company.quality);
  const [consultantId, setConsultantId] = React.useState(company.consultantId ?? '');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [addingTob, setAddingTob] = React.useState(false);

  const locationIdsKey = (ids: string[]) => [...ids].sort().join(',');
  const initialLocationIdsKey = locationIdsKey(company.locationIds);
  const initialAddresses = (company.addresses ?? []).join('\n');
  const initialSuburbs = (company.suburbsAndPostcodes ?? []).join('\n');

  const isDirty =
    companyName !== company.companyName ||
    industryId !== company.industryId ||
    specializationId !== (company.specializationId ?? '') ||
    locationIdsKey(locations.map((l) => l.id)) !== initialLocationIdsKey ||
    addresses !== initialAddresses ||
    suburbsAndPostcodes !== initialSuburbs ||
    website !== (company.website ?? '') ||
    seekJobMarketUrl !== (company.seekJobMarketUrl ?? '') ||
    linkedinJobMarketUrl !== (company.linkedinJobMarketUrl ?? '') ||
    generalDescription !== (company.generalDescription ?? '') ||
    status !== company.status ||
    quality !== company.quality ||
    consultantId !== (company.consultantId ?? '');

  const { promptOpen, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty && canEdit);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(company.id) });
    queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
  };

  const { data: industryData } = useGetIndustries();
  const industries = industryData?.status === 200 ? industryData.data : [];
  const createIndustry = useCreateIndustry({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetIndustriesQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add industry'),
    },
  });
  async function handleCreateIndustry(name: string) {
    const res = await createIndustry.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add industry');
    return res.data;
  }

  const createSpecialization = useCreateSpecialization({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSpecializationsQueryKey() }),
      onError: (err) => toast.error(err.message || 'Failed to add specialization'),
    },
  });
  async function handleCreateSpecialization(name: string) {
    const res = await createSpecialization.mutateAsync({ data: { name, industryId } });
    if (res.status !== 201) throw new Error('Failed to add specialization');
    return res.data;
  }

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const updateCompany = useUpdateClient({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Company updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update company'),
    },
  });

  const deleteCompany = useDeleteClient();
  const restoreCompany = useRestoreClient();

  const formRef = React.useRef<HTMLFormElement>(null);
  const isMac = useIsMac();
  useSaveShortcut(() => formRef.current?.requestSubmit(), canEdit && isDirty && !updateCompany.isPending);

  const { data: stakeholdersData } = useGetStakeholders({ clientId: company.id, pageSize: 50 });
  const stakeholders = stakeholdersData?.status === 200 ? stakeholdersData.data.data : [];

  const { data: tobsData } = useGetTobs({ clientId: company.id, pageSize: 50 });
  const tobs = tobsData?.status === 200 ? tobsData.data.data : [];
  const createTob = useCreateTob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTobsQueryKey() });
        toast.success('Terms of Business added');
        setAddingTob(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to add Terms of Business'),
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: UpdateClientDto = {
      companyName,
      industryId,
      specializationId: specializationId || undefined,
      locationIds: locations.map((l) => l.id),
      addresses: addresses
        ? addresses
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      suburbsAndPostcodes: suburbsAndPostcodes
        ? suburbsAndPostcodes
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      website: website || undefined,
      seekJobMarketUrl: seekJobMarketUrl || undefined,
      linkedinJobMarketUrl: linkedinJobMarketUrl || undefined,
      generalDescription: generalDescription || undefined,
      status,
      quality,
      consultantId: consultantId || undefined,
    };
    updateCompany.mutate({ id: company.id, data });
  }

  function handleDelete() {
    setDeleteConfirmOpen(false);
    const name = company.companyName;
    // Client has a real backend restore endpoint — restore mode: the delete
    // commits right away and Undo calls restoreClient.
    deleteWithUndo({
      label: name,
      deleteFn: async () => {
        await deleteCompany.mutateAsync({ id: company.id });
      },
      restoreFn: async () => {
        await restoreCompany.mutateAsync({ id: company.id });
      },
      onCommitted: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
      onUndo: () => queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
    });
    router.push('/companies');
  }

  const currentStatus = statusOptions.find((o) => o.value === company.status)!;
  const currentQuality = qualityOptions.find((o) => o.value === company.quality)!;

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
                <h1 className="font-heading text-2xl font-semibold tracking-tight">{company.companyName}</h1>
                <Badge className={currentStatus.triggerClassName}>{currentStatus.label}</Badge>
                <Badge className={currentQuality.triggerClassName}>{currentQuality.label}</Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {company.displayId} · {company.industry ?? 'No industry'}
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
                {isDirty && !updateCompany.isPending ? (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                ) : null}
                <Button type="submit" form="company-form" size="lg" disabled={updateCompany.isPending || !isDirty}>
                  {updateCompany.isPending ? (
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
        id="company-form"
        ref={formRef}
        onSubmit={handleSubmit}
        onKeyDown={blockImplicitEnterSubmit}
        className="flex flex-col gap-5"
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  Company
                </CardTitle>
                <CardDescription>Basic identity, industry and relationship status.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="Company name" htmlFor="companyName" required>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Website" htmlFor="website">
                  <UrlField id="website" value={website} onChange={setWebsite} disabled={!canEdit} />
                </FormField>
                <FormField label="Industry" htmlFor="industry" required>
                  <CreatableCombobox
                    id="industry"
                    value={industryId}
                    onValueChange={(id) => {
                      setIndustryId(id);
                      setSpecializationId('');
                    }}
                    options={industries}
                    onCreate={handleCreateIndustry}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField
                  label="Specialization"
                  htmlFor="specialization"
                  description={!industryId ? 'Pick an industry first' : undefined}
                >
                  <SpecializationCombobox
                    id="specialization"
                    value={specializationId}
                    label={company.specialization ?? undefined}
                    onValueChange={setSpecializationId}
                    industryId={industryId || undefined}
                    onCreate={handleCreateSpecialization}
                    disabled={!canEdit || !industryId}
                    clearable
                  />
                </FormField>
                <FormField label="Status" htmlFor="status">
                  <EnumSelect
                    id="status"
                    value={status}
                    onValueChange={(v) => setStatus(v as ClientStatus)}
                    options={statusOptions}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Quality" htmlFor="quality">
                  <EnumSelect
                    id="quality"
                    value={quality}
                    onValueChange={(v) => setQuality(v as ClientQuality)}
                    options={qualityOptions}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Consultant" htmlFor="consultantId" description="Owning consultant.">
                  <ConsultantCombobox
                    id="consultantId"
                    value={consultantId}
                    onValueChange={setConsultantId}
                    consultants={consultants}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="Seek/JobStreet URL" htmlFor="seekJobMarketUrl">
                  <UrlField
                    id="seekJobMarketUrl"
                    value={seekJobMarketUrl}
                    onChange={setSeekJobMarketUrl}
                    disabled={!canEdit}
                  />
                </FormField>
                <FormField label="LinkedIn Job Market URL" htmlFor="linkedinJobMarketUrl">
                  <UrlField
                    id="linkedinJobMarketUrl"
                    value={linkedinJobMarketUrl}
                    onChange={setLinkedinJobMarketUrl}
                    disabled={!canEdit}
                  />
                </FormField>
              </CardContent>
              <CardContent className="grid gap-4 border-t pt-4">
                <FormField label="Description" htmlFor="generalDescription">
                  <textarea
                    id="generalDescription"
                    value={generalDescription}
                    onChange={(e) => setGeneralDescription(e.target.value)}
                    disabled={!canEdit}
                    className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  Market
                </CardTitle>
                <CardDescription>
                  Which places this client hires from — its market, not its office address. A broader pick (a whole
                  state or country) covers everywhere inside it. At least one is required.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LocationMultiSelect selected={locations} onChange={setLocations} disabled={!canEdit} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle>Office addresses</CardTitle>
                <CardDescription>Distinct from Market above — the client's own physical location(s).</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <FormField label="Address(es)" htmlFor="addresses" description="One per line.">
                  <textarea
                    id="addresses"
                    value={addresses}
                    onChange={(e) => setAddresses(e.target.value)}
                    disabled={!canEdit}
                    className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                  />
                </FormField>
                <FormField label="Suburbs / postcodes" htmlFor="suburbsAndPostcodes" description="One per line.">
                  <textarea
                    id="suburbsAndPostcodes"
                    value={suburbsAndPostcodes}
                    onChange={(e) => setSuburbsAndPostcodes(e.target.value)}
                    disabled={!canEdit}
                    className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                  />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    Terms of Business
                  </CardTitle>
                  <CardDescription>Signed agreements on file for this client.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setAddingTob(true)}>
                  <Plus />
                  Add TOB
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {tobs.length > 0 ? (
                  tobs.map((tob) => (
                    <div key={tob.id} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{tob.displayId}</span>
                        <span className="text-xs text-muted-foreground">
                          {tob.guaranteePeriod != null ? `${tob.guaranteePeriod}-day guarantee` : null}
                        </span>
                      </div>
                      {tob.pricing ? <p className="text-muted-foreground">{tob.pricing}</p> : null}
                      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                        {tob.linktalRepresentative ? <span>Linktal rep: {tob.linktalRepresentative}</span> : null}
                        {tob.clientTobRepresentative ? <span>Client rep: {tob.clientTobRepresentative}</span> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No Terms of Business on file yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Last contact</CardTitle>
                <CardDescription>Most recent logged contact, across all stakeholders.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {company.lastContactedAt ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">When</span>
                      <span>{formatDate(company.lastContactedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Method</span>
                      <span>{company.lastContactType ?? '—'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">By</span>
                      <span>{company.lastContactedBy ?? '—'}</span>
                    </div>
                    {company.lastContactNotes ? (
                      <p className="rounded-md bg-muted/50 p-2 text-muted-foreground">{company.lastContactNotes}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-muted-foreground">No contact logged yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Contact className="size-4 text-muted-foreground" />
                    Stakeholders
                  </CardTitle>
                  <CardDescription>Contacts at this company.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/stakeholders?new=1`} />}>
                  <Plus />
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {stakeholders.length > 0 ? (
                  stakeholders.map((s) => (
                    <Link
                      key={s.id}
                      href={`/stakeholders/${s.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <span className="truncate">
                        {[s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed contact'}
                      </span>
                      {s.roleType ? (
                        <Badge variant="muted" className="shrink-0">
                          {s.roleType}
                        </Badge>
                      ) : null}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No stakeholders logged for this company yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={`Delete ${company.companyName}?`}
        description="This removes the company. You can undo this from the toast right after, or it's gone for good."
        onConfirm={handleDelete}
      />

      <AlertDialog open={promptOpen} onOpenChange={(open) => !open && cancelLeave()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>Leaving now discards your unsaved changes to this company.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={addingTob} onOpenChange={setAddingTob}>
        <SheetContent className="w-full sm:max-w-md">
          {addingTob ? (
            <TobForm
              isSaving={createTob.isPending}
              onSave={(values) => createTob.mutate({ data: { ...values, clientId: company.id } })}
              onCancel={() => setAddingTob(false)}
              consultants={consultants}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}

function TobForm({
  isSaving,
  onSave,
  onCancel,
  consultants,
}: {
  isSaving: boolean;
  onSave: (values: Omit<CreateTobDto, 'clientId'>) => void;
  onCancel: () => void;
  consultants: React.ComponentProps<typeof ConsultantCombobox>['consultants'];
}) {
  const [pricing, setPricing] = React.useState('');
  const [guaranteePeriod, setGuaranteePeriod] = React.useState('');
  const [paymentTerm, setPaymentTerm] = React.useState('');
  const [clientTobRepresentative, setClientTobRepresentative] = React.useState('');
  const [linktalRepresentativeId, setLinktalRepresentativeId] = React.useState('');
  const [invoiceContactName, setInvoiceContactName] = React.useState('');
  const [invoiceContactEmail, setInvoiceContactEmail] = React.useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      pricing: pricing || undefined,
      guaranteePeriod: guaranteePeriod ? Number(guaranteePeriod) : undefined,
      paymentTerm: paymentTerm || undefined,
      clientTobRepresentative: clientTobRepresentative || undefined,
      linktalRepresentativeId: linktalRepresentativeId || undefined,
      invoiceContactName: invoiceContactName || undefined,
      invoiceContactEmail: invoiceContactEmail || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Add Terms of Business</SheetTitle>
        <SheetDescription>Record a signed agreement for this client.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Pricing" htmlFor="tob-pricing" description="Free text — real values are tiered.">
          <Input id="tob-pricing" value={pricing} onChange={(e) => setPricing(e.target.value)} />
        </FormField>
        <FormField label="Guarantee period (days)" htmlFor="tob-guarantee">
          <Input
            id="tob-guarantee"
            type="number"
            min={0}
            max={3650}
            value={guaranteePeriod}
            onChange={(e) => setGuaranteePeriod(e.target.value)}
          />
        </FormField>
        <FormField label="Payment term" htmlFor="tob-payment-term">
          <Input id="tob-payment-term" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} />
        </FormField>
        <FormField label="Client representative" htmlFor="tob-client-rep">
          <Input
            id="tob-client-rep"
            value={clientTobRepresentative}
            onChange={(e) => setClientTobRepresentative(e.target.value)}
          />
        </FormField>
        <FormField label="Linktal representative" htmlFor="tob-linktal-rep">
          <ConsultantCombobox
            id="tob-linktal-rep"
            value={linktalRepresentativeId}
            onValueChange={setLinktalRepresentativeId}
            consultants={consultants}
          />
        </FormField>
        <FormField label="Invoice contact name" htmlFor="tob-invoice-name">
          <Input
            id="tob-invoice-name"
            value={invoiceContactName}
            onChange={(e) => setInvoiceContactName(e.target.value)}
          />
        </FormField>
        <FormField label="Invoice contact email" htmlFor="tob-invoice-email">
          <Input
            id="tob-invoice-email"
            type="email"
            value={invoiceContactEmail}
            onChange={(e) => setInvoiceContactEmail(e.target.value)}
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </SheetFooter>
    </form>
  );
}
