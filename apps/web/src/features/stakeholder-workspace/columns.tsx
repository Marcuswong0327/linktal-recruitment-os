'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Phone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import type { EnrichedStakeholder } from './schema';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

interface StakeholderColumnsOptions {
  roleTypes: CreatableComboboxOption[];
  onRoleTypeChange: (stakeholder: EnrichedStakeholder, roleTypeId: string) => void;
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  onLogContact: (stakeholder: EnrichedStakeholder) => void;
  /** Row id currently saving an inline change — disables that row's pill. */
  pendingRowId: string | null;
}

export function getStakeholderColumns({
  roleTypes,
  onRoleTypeChange,
  onCreateRoleType,
  onLogContact,
  pendingRowId,
}: StakeholderColumnsOptions): ColumnDef<EnrichedStakeholder>[] {
  return [
    {
      accessorKey: 'fullName',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.fullName}</span>
      ),
    },
    {
      accessorKey: 'companyName',
      header: 'Company',
      // Free text via a joined field — not a StakeholderSortField.
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.companyName ?? '—'}</span>
      ),
    },
    {
      id: 'roleType',
      // roleTypeId isn't a StakeholderSortField (see query-stakeholders.dto.ts)
      // — it's exposed as a filter instead, same reasoning as Client.status.
      enableSorting: false,
      header: 'Role type',
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const stakeholder = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
            <CreatableCombobox
              value={stakeholder.roleTypeId ?? ''}
              onValueChange={(id) => onRoleTypeChange(stakeholder, id)}
              options={roleTypes}
              onCreate={onCreateRoleType}
              disabled={pendingRowId === stakeholder.id}
              placeholder="Uncategorized"
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'jobTitle',
      header: 'Job title',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.jobTitle ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email ?? '—'}</span>,
    },
    {
      accessorKey: 'mobile',
      header: 'Mobile',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.mobile ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'isDecisionMaker',
      header: 'Decision maker',
      enableSorting: false,
      meta: { align: 'center' },
      cell: ({ row }) =>
        row.original.isDecisionMaker ? (
          <Badge variant="success">Yes</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'lastContactedAt',
      header: 'Last contacted',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.lastContactedAt ? formatDate(row.original.lastContactedAt) : '—'}
        </span>
      ),
    },
    {
      id: 'logContact',
      header: '',
      enableSorting: false,
      size: 56,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()} data-no-row-drag>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onLogContact(row.original)}
            aria-label={`Log a contact with ${row.original.fullName}`}
          >
            <Phone />
          </Button>
        </div>
      ),
    },
  ];
}
