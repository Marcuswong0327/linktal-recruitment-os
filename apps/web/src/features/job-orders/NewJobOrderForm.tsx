'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, DollarSign, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ClientCombobox } from '@/components/ClientCombobox';
import { ConsultantMultiSelect } from '@/components/ConsultantCombobox';
import { CreatableCombobox } from '@/components/CreatableCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { getGetJobOrdersQueryKey, useCreateJobOrder } from '@/lib/api/generated/job-orders/job-orders';
import { useCreateJobTitle, useGetJobTitles } from '@/lib/api/generated/job-titles/job-titles';
import type { CreateJobOrderDto } from '@/lib/api/generated/types';
import {
  type JobOrderQuality,
  type JobOrderStatus,
  priorityOptions,
  qualityOptions,
  statusOptions,
} from './schema';

const textareaClass =
  'min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

/**
 * Dedicated create page (2.1/2.2) — "Add Job Order" navigates here instead of
 * a quick-add sheet, so a new job order gets the same guided, sectioned flow
 * as editing one, right from the start.
 */
export function NewJobOrderForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: clientsData } = useGetClients({ pageSize: 100 });
  const clients = clientsData?.status === 200 ? clientsData.data.data : [];

  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];

  const [jobTitleId, setJobTitleId] = React.useState('');
  const { data: jobTitleData } = useGetJobTitles({ take: 200 });
  const jobTitles = jobTitleData?.status === 200 ? jobTitleData.data : [];
  const createJobTitle = useCreateJobTitle();
  async function handleCreateJobTitle(name: string) {
    const res = await createJobTitle.mutateAsync({ data: { name } });
    if (res.status !== 201) throw new Error('Failed to add job title');
    return res.data;
  }

  const [clientId, setClientId] = React.useState('');
  // A Job Order has no industry of its own, only via its Client — used below
  // purely for the non-blocking out-of-scope warning, not to restrict who can
  // be picked (several consultants can work a job order regardless of their
  // own industry/location — see PUT /job-orders/:id/consultants).
  const selectedClientIndustryId = clients.find((c) => c.id === clientId)?.industryId ?? null;
  const [consultantIds, setConsultantIds] = React.useState<string[]>([]);
  const outOfScopeConsultants = consultantIds
    .map((id) => consultants.find((c) => c.id === id))
    .filter((c): c is (typeof consultants)[number] => c != null)
    .filter((c) => {
      // Can't tell without grant data (omitted when the caller lacks
      // consultant_industry:read) — never warn on a guess. There's no
      // location to check yet — this form doesn't collect one.
      if (c.industryIds == null) return false;
      return selectedClientIndustryId == null || !c.industryIds.includes(selectedClientIndustryId);
    });
  const [status, setStatus] = React.useState<JobOrderStatus>('ACTIVE');
  const [quality, setQuality] = React.useState<JobOrderQuality>('MEDIUM');
  const [priorityLevel, setPriorityLevel] = React.useState('2');
  const [salaryMin, setSalaryMin] = React.useState('');
  const [salaryMax, setSalaryMax] = React.useState('');
  const [salaryCurrency, setSalaryCurrency] = React.useState('AUD');
  const [openings, setOpenings] = React.useState('1');
  const [description, setDescription] = React.useState('');
  const [requirements, setRequirements] = React.useState('');

  const createJobOrder = useCreateJobOrder({
    mutation: {
      onSuccess: (result) => {
        if (result.status !== 201) return;
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        toast.success(`${result.data.jobTitle} created`);
        router.push(`/job-orders/${result.data.id}`);
      },
      onError: (err) => toast.error(err.message || 'Failed to create job order'),
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dto: CreateJobOrderDto = {
      jobTitleId: jobTitleId || undefined,
      clientId,
      consultantIds: consultantIds.length > 0 ? consultantIds : undefined,
      status,
      quality,
      priorityLevel: priorityLevel === '' ? undefined : Number(priorityLevel),
      salaryMin: salaryMin === '' ? undefined : Number(salaryMin),
      salaryMax: salaryMax === '' ? undefined : Number(salaryMax),
      salaryCurrency: salaryCurrency || undefined,
      openings: openings === '' ? undefined : Number(openings),
      description: description || undefined,
      requirements: requirements || undefined,
    };
    createJobOrder.mutate({ data: dto });
  }

  const canSubmit = clientId !== '';

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
              <h1 className="font-heading text-2xl font-semibold tracking-tight">New Job Order</h1>
              <span className="text-sm text-muted-foreground">
                Fill in the role's details — you can refine everything else after it's created.
              </span>
            </div>
          </div>
          <Button type="submit" form="new-job-order-form" size="lg" disabled={!canSubmit || createJobOrder.isPending}>
            {createJobOrder.isPending ? 'Creating…' : 'Create job order'}
          </Button>
        </div>
      </div>

      <form id="new-job-order-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
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
                <FormField
                  label="Role"
                  htmlFor="jobTitle"
                  description="The client's own words for the role."
                >
                  <CreatableCombobox
                    id="jobTitle"
                    value={jobTitleId}
                    onValueChange={setJobTitleId}
                    options={jobTitles}
                    onCreate={handleCreateJobTitle}
                    placeholder="e.g. Production Manager"
                  />
                </FormField>
                <FormField label="Client" htmlFor="clientId" required>
                  <ClientCombobox id="clientId" value={clientId} onValueChange={setClientId} clients={clients} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField
                    label="Consultants"
                    htmlFor="consultantIds"
                    description="Several consultants can work this job order concurrently — optional at creation, can be changed later."
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
                      {outOfScopeConsultants.length === 1 ? "isn't" : "aren't"} tagged for this client's industry —
                      still fine to add.
                    </p>
                  ) : null}
                </div>
                <FormField label="Status" htmlFor="status">
                  <EnumSelect
                    id="status"
                    value={status}
                    onValueChange={(v) => setStatus(v as JobOrderStatus)}
                    options={statusOptions}
                  />
                </FormField>
                <FormField label="Quality" htmlFor="quality">
                  <EnumSelect
                    id="quality"
                    value={quality}
                    onValueChange={(v) => setQuality(v as JobOrderQuality)}
                    options={qualityOptions}
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
        </div>
      </form>
    </PageLayout>
  );
}
