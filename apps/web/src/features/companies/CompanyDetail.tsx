'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, CornerDownLeft, FileText, Handshake, Info } from 'lucide-react';
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
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import {
  getGetClientQueryKey,
  getGetClientsQueryKey,
  useGetClient,
  useUpdateClient,
} from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import type { ConsultantEntity, UpdateClientDto } from '@/lib/api/generated/types';
import { statusOptions, statusVariant, tobOptions } from './columns';
import { type ClientStatus, type Company, clientStatusLabels } from './schema';

const textareaClass =
  'min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function CompanyDetail({ id }: { id: string }) {
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
          <p className="text-sm text-muted-foreground">{error?.message ?? `No company with ID ${id}.`}</p>
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
  return <CompanyEditForm key={company.id} company={company} consultants={consultants} />;
}

/** Empty strings/inputs become `null` (not omitted) so a cleared field actually saves as cleared. */
function toPatch(values: {
  companyName: string;
  industry: string;
  specialization: string;
  city: string;
  country: string;
  website: string;
  status: ClientStatus;
  tobSigned: boolean;
  feePercentage: string;
  guaranteePeriod: string;
  consultantId: string;
  notes: string;
}) {
  return {
    companyName: values.companyName,
    industry: values.industry || null,
    specialization: values.specialization || null,
    city: values.city || null,
    country: values.country || null,
    website: values.website || null,
    status: values.status,
    tobSigned: values.tobSigned,
    feePercentage: values.feePercentage === '' ? null : Number(values.feePercentage),
    guaranteePeriod: values.guaranteePeriod === '' ? null : Number(values.guaranteePeriod),
    consultantId: values.consultantId || null,
    notes: values.notes || null,
  } as unknown as UpdateClientDto;
}

function CompanyEditForm({ company, consultants }: { company: Company; consultants: ConsultantEntity[] }) {
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = React.useState(company.companyName);
  const [industry, setIndustry] = React.useState(company.industry ?? '');
  const [specialization, setSpecialization] = React.useState(company.specialization ?? '');
  const [city, setCity] = React.useState(company.city ?? '');
  const [country, setCountry] = React.useState(company.country ?? '');
  const [website, setWebsite] = React.useState(company.website ?? '');
  const [status, setStatus] = React.useState<ClientStatus>(company.status);
  const [tobSigned, setTobSigned] = React.useState(company.tobSigned);
  const [feePercentage, setFeePercentage] = React.useState(
    company.feePercentage != null ? String(company.feePercentage) : '',
  );
  const [guaranteePeriod, setGuaranteePeriod] = React.useState(String(company.guaranteePeriod));
  const [consultantId, setConsultantId] = React.useState(company.consultantId ?? '');
  const [notes, setNotes] = React.useState(company.notes ?? '');

  const isDirty =
    companyName !== company.companyName ||
    industry !== (company.industry ?? '') ||
    specialization !== (company.specialization ?? '') ||
    city !== (company.city ?? '') ||
    country !== (company.country ?? '') ||
    website !== (company.website ?? '') ||
    status !== company.status ||
    tobSigned !== company.tobSigned ||
    feePercentage !== (company.feePercentage != null ? String(company.feePercentage) : '') ||
    guaranteePeriod !== String(company.guaranteePeriod) ||
    consultantId !== (company.consultantId ?? '') ||
    notes !== (company.notes ?? '');

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateClient.mutate({
      id: company.id,
      data: toPatch({
        companyName,
        industry,
        specialization,
        city,
        country,
        website,
        status,
        tobSigned,
        feePercentage,
        guaranteePeriod,
        consultantId,
        notes,
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
                <h1 className="font-heading text-2xl font-semibold tracking-tight">{company.companyName}</h1>
                <Badge variant={statusVariant[company.status]}>{clientStatusLabels[company.status]}</Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{company.displayId}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && !updateClient.isPending ? (
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
                <FormField label="Company name" htmlFor="companyName">
                  <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </FormField>
                <FormField label="Industry" htmlFor="industry">
                  <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
                </FormField>
                <FormField label="Specialization" htmlFor="specialization">
                  <Input
                    id="specialization"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                  />
                </FormField>
                <FormField label="City" htmlFor="city">
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </FormField>
                <FormField label="Country" htmlFor="country">
                  <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </FormField>
                <FormField label="Website" htmlFor="website">
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://…"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
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
                <FormField label="Relationship" htmlFor="status">
                  <EnumSelect
                    id="status"
                    value={status}
                    onValueChange={(v) => setStatus(v as ClientStatus)}
                    options={statusOptions}
                  />
                </FormField>
                <FormField label="Terms of Business" htmlFor="tobSigned">
                  <EnumSelect
                    id="tobSigned"
                    value={String(tobSigned)}
                    onValueChange={(v) => setTobSigned(v === 'true')}
                    options={tobOptions}
                  />
                </FormField>
                <FormField label="Fee %" htmlFor="feePercentage">
                  <Input
                    id="feePercentage"
                    type="number"
                    min={0}
                    max={100}
                    value={feePercentage}
                    onChange={(e) => setFeePercentage(e.target.value)}
                  />
                </FormField>
                <FormField label="Guarantee period (days)" htmlFor="guaranteePeriod">
                  <Input
                    id="guaranteePeriod"
                    type="number"
                    min={0}
                    value={guaranteePeriod}
                    onChange={(e) => setGuaranteePeriod(e.target.value)}
                  />
                </FormField>
                <FormField label="Consultant" htmlFor="consultantId">
                  <ConsultantCombobox
                    id="consultantId"
                    value={consultantId}
                    onValueChange={setConsultantId}
                    consultants={consultants}
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
              <CardContent>
                <textarea
                  id="notes"
                  aria-label="Notes"
                  className={textareaClass}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
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
    </PageLayout>
  );
}
