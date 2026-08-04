'use client';

import type * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Phone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ComboboxSelect } from '@/components/ComboboxSelect';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { stakeholderFullName, type Stakeholder } from './schema';

// Despite what a combined "fullName" field would suggest, some imported
// stakeholders have neither name on file — guard rather than assume.
function initials(name: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

// Three-state: null = "not yet checked" (distinct from false), per
// StakeholderEntity.isAccurate's doc comment. Exported — StakeholderDetail
// reuses the exact same options/colors for its own accuracy picker/badge.
export const accuracyOptions = [
  { value: 'unchecked', label: 'Unchecked', triggerClassName: 'border-transparent bg-muted text-muted-foreground' },
  { value: 'true', label: 'Accurate', triggerClassName: 'border-success/30 bg-success/10 text-success' },
  { value: 'false', label: 'Inaccurate', triggerClassName: 'border-destructive/30 bg-destructive/10 text-destructive' },
];

export function accuracyValue(isAccurate: boolean | null): string {
  return isAccurate === null ? 'unchecked' : String(isAccurate);
}

export function parseAccuracyValue(value: string): boolean | null {
  return value === 'unchecked' ? null : value === 'true';
}

// Shared palette for Role type coloring — the filter dropdown (Badge
// `variant`), the Role type cell/form pickers (raw `triggerClassName`,
// since CreatableCombobox isn't on the Badge variant system) and
// StakeholderDetail's own role type picker all draw from the same ordered
// list, so a given role type gets the same color everywhere. Role types are
// a user-grown catalog (CreatableCombobox), not a fixed enum, so there's no
// per-value semantic color to assign — cycle by position instead, same
// reasoning as Consultants' roleFilterVariant.
export const ROLE_TYPE_PALETTE: {
  variant: NonNullable<React.ComponentProps<typeof Badge>['variant']>;
  triggerClassName: string;
}[] = [
  { variant: 'default', triggerClassName: 'border-primary/30 bg-primary/10 text-primary' },
  { variant: 'info', triggerClassName: 'border-info/30 bg-info/10 text-info' },
  { variant: 'warning', triggerClassName: 'border-warning/30 bg-warning/10 text-warning' },
  { variant: 'secondary', triggerClassName: 'border-transparent bg-secondary text-secondary-foreground' },
  { variant: 'outline', triggerClassName: 'border-border text-foreground' },
  { variant: 'muted', triggerClassName: 'border-transparent bg-muted text-muted-foreground' },
];
export function roleTypeStyle(index: number) {
  return ROLE_TYPE_PALETTE[index % ROLE_TYPE_PALETTE.length];
}

interface StakeholderColumnsOptions {
  roleTypes: CreatableComboboxOption[];
  onRoleTypeChange: (stakeholder: Stakeholder, roleTypeId: string) => void;
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  onAccuracyChange: (stakeholder: Stakeholder, isAccurate: boolean | null) => void;
  onLogContact: (stakeholder: Stakeholder) => void;
  /** Row id currently saving an inline change — disables that row's controls. */
  pendingRowId: string | null;
  /** Absent when the caller lacks `stakeholder:update` — controls render read-only. */
  canUpdate: boolean;
}

export function getStakeholderColumns({
  roleTypes,
  onRoleTypeChange,
  onCreateRoleType,
  onAccuracyChange,
  onLogContact,
  pendingRowId,
  canUpdate,
}: StakeholderColumnsOptions): ColumnDef<Stakeholder>[] {
  return [
    {
      id: 'fullName',
      // No single "fullName" column server-side to sort by (see
      // StakeholderSortField) — firstName/lastName are separate columns.
      enableSorting: false,
      header: 'Name',
      cell: ({ row }) => {
        const stakeholder = row.original;
        const name = stakeholderFullName(stakeholder);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initials(name)}
            </span>
            <span className="truncate font-medium text-foreground">{name || 'Unnamed contact'}</span>
          </div>
        );
      },
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
      // stakeholderRoleTypeId isn't a StakeholderSortField (see
      // query-stakeholders.dto.ts) — it's exposed as a filter instead, same
      // reasoning as Client.status.
      enableSorting: false,
      header: 'Role type',
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const stakeholder = row.original;
        if (!canUpdate) {
          return (
            <span className="text-muted-foreground">{stakeholder.roleType ?? 'Uncategorized'}</span>
          );
        }
        // No data-no-row-drag needed here (matches ComboboxSelect/Consultants'
        // Role column) — a mousedown that turns into a real drag never
        // reaches this element's click at all, since the browser only fires
        // `click` when mouseup lands back on the same target.
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <CreatableCombobox
              title="Role type"
              variant="badge"
              value={stakeholder.stakeholderRoleTypeId ?? ''}
              onValueChange={(id) => onRoleTypeChange(stakeholder, id)}
              options={roleTypes}
              onCreate={onCreateRoleType}
              disabled={pendingRowId === stakeholder.id}
              placeholder="Uncategorized"
              className="mx-auto"
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
      accessorKey: 'isAccurate',
      header: 'Accuracy',
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const stakeholder = row.original;
        const current = accuracyOptions.find((o) => o.value === accuracyValue(stakeholder.isAccurate))!;
        if (!canUpdate) {
          return <span className="text-muted-foreground">{current.label}</span>;
        }
        // stopPropagation only — no data-no-row-drag needed, same reasoning
        // as the Role type cell above: a mousedown that turns into a real
        // drag never reaches this element's click at all, so row
        // range-select and "click to open the picker" don't conflict.
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <ComboboxSelect
              title="Details accuracy"
              value={accuracyValue(stakeholder.isAccurate)}
              onValueChange={(v) => onAccuracyChange(stakeholder, parseAccuracyValue(v))}
              options={accuracyOptions}
              disabled={pendingRowId === stakeholder.id}
              triggerClassName="mx-auto"
            />
          </div>
        );
      },
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
            aria-label={`Log a contact with ${stakeholderFullName(row.original) || 'this contact'}`}
          >
            <Phone />
          </Button>
        </div>
      ),
    },
  ];
}
