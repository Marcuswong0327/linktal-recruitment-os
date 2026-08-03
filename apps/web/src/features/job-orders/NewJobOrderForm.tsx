'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, DollarSign, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ClientCombobox } from '@/components/ClientCombobox';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { PageLayout } from '@/components/app-shell/PageLayout';
import { useGetClients } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import { getGetJobOrdersQueryKey, useCreateJobOrder } from '@/lib/api/generated/job-orders/job-orders';
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

  const [jobTitle, setJobTitle] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  // Industry-first: a Job Order has no industry of its own, only via its
  // Client — no client picked yet (or one with no industry tagged) means no
  // consultant can be assigned at all (enforced server-side too).
  const selectedClientIndustryId = clients.find((c) => c.id === clientId)?.industryId ?? null;
  const availableConsultants = !selectedClientIndustryId
    ? []
    : consultants.filter(
        (c) => c.industryIds === undefined || c.industryIds.includes(selectedClientIndustryId),
      );
  const [consultantId, setConsultantId] = React.useState('');
  const [department, setDepartment] = React.useState('');
  const [city, setCity] = React.useState('');
  const [suburb, setSuburb] = React.useState('');
  const [status, setStatus] = React.useState<JobOrderStatus>('ACTIVE');
  const [quality, setQuality] = React.useState<JobOrderQuality>('MEDIUM');
  const [priorityLevel, setPriorityLevel] = React.useState('2');
  const [isReplacement, setIsReplacement] = React.useState(false);
  const [isCollaborated, setIsCollaborated] = React.useState(false);
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
      jobTitle,
      clientId,
      consultantId: consultantId || undefined,
      department: department || undefined,
      city: city || undefined,
      suburb: suburb || undefined,
      status,
      quality,
      priorityLevel: priorityLevel === '' ? undefined : Number(priorityLevel),
      isReplacement,
      isCollaborated,
      salaryMin: salaryMin === '' ? undefined : Number(salaryMin),
      salaryMax: salaryMax === '' ? undefined : Number(salaryMax),
      salaryCurrency: salaryCurrency || undefined,
      openings: openings === '' ? undefined : Number(openings),
      description: description || undefined,
      requirements: requirements || undefined,
    };
    createJobOrder.mutate({ data: dto });
  }

  const canSubmit = jobTitle.trim() !== '' && clientId !== '';

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
                <FormField label="Role" htmlFor="jobTitle" required>
                  <Input
                    id="jobTitle"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. Production Manager"
                    autoFocus
                  />
                </FormField>
                <FormField label="Client" htmlFor="clientId" required>
                  <ClientCombobox id="clientId" value={clientId} onValueChange={setClientId} clients={clients} />
                </FormField>
                <FormField
                  label="Consultant"
                  htmlFor="consultantId"
                  description={
                    !selectedClientIndustryId
                      ? 'Tag the client with an industry before assigning a consultant'
                      : undefined
                  }
                >
                  <ConsultantCombobox
                    id="consultantId"
                    value={consultantId}
                    onValueChange={setConsultantId}
                    consultants={availableConsultants}
                    disabled={!selectedClientIndustryId}
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
