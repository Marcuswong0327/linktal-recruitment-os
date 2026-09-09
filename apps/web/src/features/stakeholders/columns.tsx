'use client';

import type * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ComboboxSelect } from '@/components/ComboboxSelect';
import { ConsultantAvatar } from '@/components/ConsultantCombobox';
import { ContactMethodsCell } from '@/components/ContactMethodsCell';
import { CreatableCombobox, type CreatableComboboxOption } from '@/components/CreatableCombobox';
import { LocationBadgeList } from '@/components/LocationBadgeList';
import { StakeholderEntityStatus } from '@/lib/api/generated/types';
import type { StakeholderEntity } from '@/lib/api/generated/types';

/** Helper for display — the entity has no combined name field, by design (see firstName/lastName in the schema). */
export function stakeholderFullName(s: Pick<StakeholderEntity, 'firstName' | 'lastName'>): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ');
}

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
// reuses the exact same options/colors for its own accuracy picker/badge,
// and StakeholdersTable's header filter reuses `variant` for the same
// colored badges in its dropdown list.
export const accuracyOptions = [
  {
    value: 'unchecked',
    label: 'Unchecked',
    variant: 'warning' as const,
    triggerClassName: 'border-warning/30 bg-warning/10 text-warning',
  },
  {
    value: 'true',
    label: 'Accurate',
    variant: 'success' as const,
    triggerClassName: 'border-success/30 bg-success/10 text-success',
  },
  {
    value: 'false',
    label: 'Inaccurate',
    variant: 'destructive' as const,
    triggerClassName: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
];

export function accuracyValue(isAccurate: boolean | null): string {
  return isAccurate === null ? 'unchecked' : String(isAccurate);
}

export function parseAccuracyValue(value: string): boolean | null {
  return value === 'unchecked' ? null : value === 'true';
}

// Relationship-warmth status, distinct from Accuracy above — see
// Stakeholder.status's own doc comment in schema.prisma. DATA_NOT_ACCURATE
// sits last, same declaration-order-is-sort-order trick as ClientStatus's
// UNS.
export const stakeholderStatuses = Object.values(StakeholderEntityStatus);
export type StakeholderStatus = (typeof stakeholderStatuses)[number];

export const stakeholderStatusLabels: Record<StakeholderStatus, string> = {
  COLD: 'Cold',
  WARM: 'Warm',
  UNS: 'UNS',
  DATA_NOT_ACCURATE: 'Data Not Accurate',
};

export const stakeholderStatusVariants: Record<StakeholderStatus, 'info' | 'warning' | 'muted' | 'destructive'> = {
  COLD: 'info',
  WARM: 'warning',
  UNS: 'muted',
  DATA_NOT_ACCURATE: 'destructive',
};

export const stakeholderStatusTriggerClassName: Record<StakeholderStatus, string> = {
  COLD: 'border-info/30 bg-info/10 text-info',
  WARM: 'border-warning/30 bg-warning/10 text-warning',
  UNS: 'border-transparent bg-muted text-muted-foreground',
  DATA_NOT_ACCURATE: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export const stakeholderStatusOptions = stakeholderStatuses.map((value) => ({
  value,
  label: stakeholderStatusLabels[value],
  variant: stakeholderStatusVariants[value],
  triggerClassName: stakeholderStatusTriggerClassName[value],
}));

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
  onRoleTypeChange: (stakeholder: StakeholderEntity, roleTypeId: string) => void;
  onCreateRoleType: (name: string) => Promise<CreatableComboboxOption>;
  onStatusChange: (stakeholder: StakeholderEntity, status: StakeholderStatus) => void;
  /** Row id currently saving an inline change — disables that row's controls. */
  pendingRowId: string | null;
  /** Absent when the caller lacks `stakeholder:update` — controls render read-only. */
  canUpdate: boolean;
}

export function getStakeholderColumns({
  roleTypes,
  onRoleTypeChange,
  onCreateRoleType,
  onStatusChange,
  pendingRowId,
  canUpdate,
}: StakeholderColumnsOptions): ColumnDef<StakeholderEntity>[] {
  return [
    {
      id: 'fullName',
      // No single "fullName" column server-side to sort by (see
      // StakeholderSortField) — firstName/lastName are separate columns.
      // strictMinSize only — avatar + name + link icon is left-aligned
      // content, not a centered pill like City Coverage/Role type. grow:
      // absorbs leftover width on a wide screen — see DataGridColumnMeta.grow.
      meta: { strictMinSize: true, grow: true },
      enableSorting: false,
      header: 'Name',
      cell: ({ row }) => {
        const stakeholder = row.original;
        const name = stakeholderFullName(stakeholder);
        return (
          <Link
            href={`/stakeholders/${stakeholder.id}`}
            onClick={(e) => e.stopPropagation()}
            title={`${name || 'Unnamed contact'} — opens its own page`}
            className="flex min-w-0 items-center gap-2.5"
            data-no-row-drag
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initials(name)}
            </span>
            <span className="flex min-w-0 items-center gap-1 truncate font-medium text-foreground hover:underline">
              <span className="truncate">{name || 'Unnamed contact'}</span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
            </span>
          </Link>
        );
      },
    },
    {
      accessorKey: 'companyName',
      header: 'Company',
      // Free text via a joined field — not a StakeholderSortField.
      enableSorting: false,
      cell: ({ row }) => {
        const { clientId, companyName } = row.original;
        if (!companyName) return <span className="text-muted-foreground">—</span>;
        return (
          <Link
            href={`/companies/${clientId}?from=stakeholders`}
            onClick={(e) => e.stopPropagation()}
            title={`${companyName} — opens its own page`}
            className="flex min-w-0 items-center gap-1 truncate text-muted-foreground hover:underline"
            data-no-row-drag
          >
            <span className="truncate">{companyName}</span>
            <ArrowUpRight className="size-3.5 shrink-0" />
          </Link>
        );
      },
    },
    {
      id: 'coverage',
      header: 'City Coverage',
      // Not a StakeholderSortField (see query-stakeholders.dto.ts) — exposed
      // as the 'coverage' header filter instead (StakeholdersTable), same as
      // Company's analogous City Coverage column/filter.
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => <LocationBadgeList locations={row.original.coverage} />,
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
          return <span className="text-muted-foreground">{stakeholder.roleType ?? 'Uncategorized'}</span>;
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
              fullCellHitArea
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
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.jobTitle ?? '—'}</span>,
    },
    {
      id: 'contact',
      header: 'Contact',
      // Email/Mobile/LinkedIn aren't independently sortable server-side
      // (StakeholderSortField) — same reasoning as Coverage/Role type above.
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => (
        <ContactMethodsCell
          email={row.original.email}
          mobile={row.original.mobile}
          linkedinUrl={row.original.linkedinUrl}
        />
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
      accessorKey: 'status',
      header: 'Status',
      // Not a StakeholderSortField — exposed as a filter instead, same
      // reasoning as Accuracy/Role type above.
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const stakeholder = row.original;
        const current = stakeholderStatusOptions.find((o) => o.value === stakeholder.status)!;
        if (!canUpdate) {
          return <Badge className={current.triggerClassName}>{current.label}</Badge>;
        }
        // stopPropagation only — no data-no-row-drag needed, same reasoning
        // as the Role type cell above: a mousedown that turns into a real
        // drag never reaches this element's click at all, so row
        // range-select and "click to open the picker" don't conflict.
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <ComboboxSelect
              title="Status"
              value={stakeholder.status}
              onValueChange={(v) => onStatusChange(stakeholder, v as StakeholderStatus)}
              options={stakeholderStatusOptions}
              disabled={pendingRowId === stakeholder.id}
              triggerClassName="mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'lastContactedBy',
      header: 'Last contacted by',
      // Resolved from the latest StakeholderContactHistory row, not a real
      // column on Stakeholder itself — not a StakeholderSortField. Read-only
      // (contactedById always comes from the caller's own session server-side,
      // never request-supplied — see StakeholdersService.addContactHistory),
      // so this borrows ConsultantCombobox's avatar-then-name look without
      // the picker itself — same identity styling as everywhere else a
      // consultant shows up, just static.
      enableSorting: false,
      cell: ({ row }) => {
        const { lastContactedById, lastContactedBy } = row.original;
        if (!lastContactedById) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-2">
            <ConsultantAvatar consultantId={lastContactedById} name={lastContactedBy ?? undefined} size={5} />
            <span className="truncate text-muted-foreground">{lastContactedBy ?? 'Unknown'}</span>
          </div>
        );
      },
    },
  ];
}
