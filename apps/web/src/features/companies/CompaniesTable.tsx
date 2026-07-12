'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DataGrid, type DataGridFilter, type DataGridQuery } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { getGetClientsQueryKey, useGetClients, useUpdateClient } from '@/lib/api/generated/clients/clients';
import { useGetConsultants } from '@/lib/api/generated/consultants/consultants';
import type { ConsultantEntity, GetClientsStatus } from '@/lib/api/generated/types';
import { getCompanyColumns, statusVariant, tobVariant } from './columns';
import { type ClientStatus, type Company, clientStatusLabels, clientStatuses } from './schema';

const PAGE_SIZE = 20;

const statusOptions = clientStatuses.map((value) => ({
  value,
  label: clientStatusLabels[value],
  variant: statusVariant[value],
}));

const tobOptions = [
  { value: 'true', label: 'Signed', variant: tobVariant.true },
  { value: 'false', label: 'Not signed', variant: tobVariant.false },
];

const companyFilters: DataGridFilter[] = [
  { columnId: 'status', title: 'Relationship', single: true, options: statusOptions },
  { columnId: 'tobSigned', title: 'TOB', single: true, options: tobOptions },
];

export function CompaniesTable({ canCreate = true }: { canCreate?: boolean }) {
  const queryClient = useQueryClient();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState<string | undefined>();
  const [status, setStatus] = React.useState<GetClientsStatus | undefined>();
  const [tobSigned, setTobSigned] = React.useState<boolean | undefined>();
  const [editing, setEditing] = React.useState<Company | null>(null);

  const { data, isLoading, isError, error } = useGetClients(
    { page, pageSize: PAGE_SIZE, q: search, status, tobSigned },
    { query: { placeholderData: keepPreviousData } },
  );

  // Client-side join: the API returns consultantId only, so pull the full
  // consultant list once to resolve names for the table and edit form.
  const { data: consultantsData } = useGetConsultants({ pageSize: 100 });
  const consultants = consultantsData?.status === 200 ? consultantsData.data.data : [];
  const consultantName = React.useCallback(
    (id: string | null) => (id ? (consultants.find((c) => c.id === id)?.fullName ?? 'Unknown') : 'Unassigned'),
    [consultants],
  );

  const updateClient = useUpdateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() });
        toast.success('Saved changes');
        setEditing(null);
      },
      onError: (err) => toast.error(err.message || 'Failed to update company'),
    },
  });

  const result = data?.status === 200 ? data.data : undefined;
  const companies = result?.data ?? [];

  function handleQueryChange({ search, columnFilters }: DataGridQuery) {
    const statusFilter = columnFilters.find((f) => f.id === 'status')?.value as string[] | undefined;
    const tobFilter = columnFilters.find((f) => f.id === 'tobSigned')?.value as string[] | undefined;
    setSearch(search.trim() || undefined);
    setStatus(statusFilter?.[0] as GetClientsStatus | undefined);
    setTobSigned(tobFilter?.[0] === undefined ? undefined : tobFilter[0] === 'true');
    setPage(1);
  }

  function handleSave(updated: Company) {
    updateClient.mutate({
      id: updated.id,
      data: {
        companyName: updated.companyName,
        industry: updated.industry ?? undefined,
        city: updated.city ?? undefined,
        country: updated.country ?? undefined,
        status: updated.status,
        tobSigned: updated.tobSigned,
        feePercentage: updated.feePercentage ?? undefined,
        consultantId: updated.consultantId ?? undefined,
      },
    });
  }

  const columns = React.useMemo(() => getCompanyColumns({ consultantName }), [consultantName]);

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load companies: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        columns={columns}
        data={companies}
        isLoading={isLoading}
        searchPlaceholder="Search companies…"
        filters={companyFilters}
        onRowClick={setEditing}
        emptyState="No companies yet. Add your first client to get started."
        getRowId={(c) => c.id}
        toolbar={
          <Button
            size="lg"
            disabled={!canCreate}
            title={canCreate ? undefined : "You don't have permission to add companies"}
          >
            <Plus />
            Add company
          </Button>
        }
        server={{
          total: result?.total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          pageCount: result?.pageCount ?? 1,
          onPageChange: setPage,
          onQueryChange: handleQueryChange,
        }}
      />

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent className="w-full sm:max-w-md">
          {editing ? (
            <EditCompanyForm
              key={editing.id}
              company={editing}
              consultants={consultants}
              isSaving={updateClient.isPending}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function EditCompanyForm({
  company,
  consultants,
  isSaving,
  onSave,
  onCancel,
}: {
  company: Company;
  consultants: ConsultantEntity[];
  isSaving: boolean;
  onSave: (company: Company) => void;
  onCancel: () => void;
}) {
  const [companyName, setCompanyName] = React.useState(company.companyName);
  const [industry, setIndustry] = React.useState(company.industry ?? '');
  const [city, setCity] = React.useState(company.city ?? '');
  const [country, setCountry] = React.useState(company.country ?? '');
  const [status, setStatus] = React.useState<ClientStatus>(company.status);
  const [tobSigned, setTobSigned] = React.useState(company.tobSigned);
  const [feePercentage, setFeePercentage] = React.useState(
    company.feePercentage != null ? String(company.feePercentage) : '',
  );
  const [consultantId, setConsultantId] = React.useState(company.consultantId ?? '');

  const consultantOptions = [
    { value: '', label: 'Unassigned' },
    ...consultants.map((c) => ({ value: c.id, label: c.fullName })),
  ];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...company,
      companyName,
      industry: industry || null,
      city: city || null,
      country: country || null,
      status,
      tobSigned,
      feePercentage: feePercentage === '' ? null : Number(feePercentage),
      consultantId: consultantId || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit company</SheetTitle>
        <SheetDescription>
          Update {company.companyName}’s account details.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company name" htmlFor="company-name">
          <Input
            id="company-name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </FormField>
        <FormField label="Industry" htmlFor="company-industry">
          <Input
            id="company-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </FormField>
        <FormField label="City" htmlFor="company-city">
          <Input
            id="company-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </FormField>
        <FormField label="Country" htmlFor="company-country">
          <Input
            id="company-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </FormField>
        <FormField label="Relationship" htmlFor="company-status">
          <EnumSelect
            id="company-status"
            value={status}
            onValueChange={(v) => setStatus(v as ClientStatus)}
            options={statusOptions}
          />
        </FormField>
        <FormField label="Terms of Business" htmlFor="company-tob">
          <EnumSelect
            id="company-tob"
            value={String(tobSigned)}
            onValueChange={(v) => setTobSigned(v === 'true')}
            options={tobOptions}
          />
        </FormField>
        <FormField label="Fee %" htmlFor="company-fee">
          <Input
            id="company-fee"
            type="number"
            value={feePercentage}
            onChange={(e) => setFeePercentage(e.target.value)}
          />
        </FormField>
        <FormField label="Consultant" htmlFor="company-consultant">
          <EnumSelect
            id="company-consultant"
            value={consultantId}
            onValueChange={setConsultantId}
            options={consultantOptions}
            placeholder="Unassigned"
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </SheetFooter>
    </form>
  );
}
