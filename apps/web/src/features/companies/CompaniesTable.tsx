'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

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
import { DataGrid, type DataGridFilter } from '@/components/DataGrid';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { companyColumns } from './columns';
import { mockCompanies } from './mock';
import {
  type Company,
  relationshipStatuses,
  relationshipStatusLabels,
  tobStatuses,
  tobStatusLabels,
} from './schema';

const relationshipOptions = relationshipStatuses.map((value) => ({
  value,
  label: relationshipStatusLabels[value],
}));
const tobOptions = tobStatuses.map((value) => ({
  value,
  label: tobStatusLabels[value],
}));

const companyFilters: DataGridFilter[] = [
  { columnId: 'relationshipStatus', title: 'Relationship', options: relationshipOptions },
  { columnId: 'tobStatus', title: 'TOB', options: tobOptions },
];

export function CompaniesTable({ canCreate = true }: { canCreate?: boolean }) {
  const [companies, setCompanies] = React.useState<Company[]>(mockCompanies);
  const [editing, setEditing] = React.useState<Company | null>(null);

  function handleSave(updated: Company) {
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditing(null);
    toast.success(`Saved changes to ${updated.name}`);
  }

  return (
    <>
      <DataGrid
        columns={companyColumns}
        data={companies}
        searchPlaceholder="Search companies…"
        filters={companyFilters}
        onRowClick={setEditing}
        emptyState="No companies yet. Add your first client to get started."
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
  onSave,
  onCancel,
}: {
  company: Company;
  onSave: (company: Company) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(company.name);
  const [industry, setIndustry] = React.useState(company.industry);
  const [location, setLocation] = React.useState(company.location);
  const [relationshipStatus, setRelationshipStatus] = React.useState(
    company.relationshipStatus,
  );
  const [tobStatus, setTobStatus] = React.useState(company.tobStatus);
  const [owner, setOwner] = React.useState(company.owner);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...company,
      name,
      industry,
      location,
      relationshipStatus,
      tobStatus,
      owner,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Edit company</SheetTitle>
        <SheetDescription>
          Update {company.name}’s account details.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6">
        <FormField label="Company name" htmlFor="company-name">
          <Input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="Industry" htmlFor="company-industry">
          <Input
            id="company-industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </FormField>
        <FormField label="Location" htmlFor="company-location">
          <Input
            id="company-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </FormField>
        <FormField label="Relationship" htmlFor="company-relationship">
          <EnumSelect
            id="company-relationship"
            value={relationshipStatus}
            onValueChange={(v) =>
              setRelationshipStatus(v as Company['relationshipStatus'])
            }
            options={relationshipOptions}
          />
        </FormField>
        <FormField label="Terms of Business" htmlFor="company-tob">
          <EnumSelect
            id="company-tob"
            value={tobStatus}
            onValueChange={(v) => setTobStatus(v as Company['tobStatus'])}
            options={tobOptions}
          />
        </FormField>
        <FormField label="Owner" htmlFor="company-owner">
          <Input
            id="company-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </FormField>
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg">
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
