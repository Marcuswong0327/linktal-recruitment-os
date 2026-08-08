'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';

import { ComboboxSelect } from '@/components/ComboboxSelect';
import { LocationBadgeList } from '@/components/LocationBadgeList';
import { LocationMultiSelect, type LocationOption } from '@/components/LocationMultiSelect';
import {
  SpecializationBadgeList,
  SpecializationMultiSelect,
  type SpecializationOption,
} from '@/components/SpecializationPicker';
import { TagMultiSelect, TagPills, type TagOption } from '@/components/TagMultiSelect';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type Consultant,
  type ConsultantRole,
  consultantRoleLabels,
  consultantRoleTriggerClassName,
  consultantRoles,
} from './schema';

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

const roleOptions = consultantRoles.map((value) => ({
  value,
  label: consultantRoleLabels[value],
  triggerClassName: consultantRoleTriggerClassName[value],
}));
const activeStatusOption = {
  value: 'true',
  label: 'Active',
  triggerClassName: 'border-success/30 bg-success/10 text-success',
};
const inactiveStatusOption = {
  value: 'false',
  label: 'Inactive',
  triggerClassName: 'border-destructive/30 bg-destructive/10 text-destructive',
};
// Same underlying value ('false') as inactiveStatusOption — this is a display
// override for a row whose `pendingApproval` flag is still set, not a third
// value of `isActive`. Selecting either one still just sets isActive=false;
// the difference is purely which label/color a false row gets, so a fresh
// self-registration reads as "needs a decision" rather than "already
// handled, offboarded". The flag itself flips off server-side the moment an
// admin acts on isActive (either direction) — see the Prisma model's doc
// comment — so toggling Active then back to Inactive correctly lands on
// plain "Inactive", not "Pending approval" again.
const pendingStatusOption = {
  value: 'false',
  label: 'Pending approval',
  triggerClassName: 'border-warning/30 bg-warning/10 text-warning',
};

interface ConsultantColumnsOptions {
  /** Editing a row while its mutation is in flight — disables that row's controls. */
  pendingId: string | null;
  /** Self-lockout: the signed-in user can't change their own role/status. */
  isSelf: (user: Consultant) => boolean;
  onRoleChange: (user: Consultant, role: ConsultantRole) => void;
  onStatusChange: (user: Consultant, isActive: boolean) => void;
  /**
   * Present only when the caller holds `consultant_industry:read` — the
   * whole column is omitted otherwise (matches `industries`/`industryIds`
   * being absent from the API response entirely for a caller without that
   * permission, not just empty).
   */
  industries?: {
    options: TagOption[];
    /** Absent when the caller lacks `consultant_industry:update` — read-only chips instead of an editable picker. */
    onIndustriesChange?: (user: Consultant, industryIds: string[]) => void;
    /** Grows the Industry catalog itself (not just this consultant's grants) — present only for `industry:create` (admin, manager). */
    onCreateIndustry?: (name: string) => Promise<TagOption>;
    /** Renames the underlying Industry row — present only for `industry:update` (admin, manager). */
    onEditIndustry?: (option: TagOption) => void;
    /** Deactivates the underlying Industry row — present only for `industry:delete` (admin, manager). */
    onDeleteIndustry?: (option: TagOption) => void;
  };
  /**
   * Same gating pattern as `industries`, keyed to `consultant_specialization:read`.
   * Narrows the industry arm rather than granting on its own — see
   * docs/scope-explained.md §4. A specialization grant only means anything as
   * a narrowing of an industry the consultant already holds (enforced
   * server-side in `setSpecializations`), so the picker mirrors that: a row
   * with no industries yet can't be given any specialization, and a row with
   * some can only add ones under those industries — enforced here by passing
   * the row's own `industryIds` into `SpecializationMultiSelect`'s search
   * (server-narrowed), not by filtering a client-side catalog.
   */
  specializations?: {
    /** Absent when the caller lacks `consultant_specialization:update` — read-only chips instead of an editable picker. */
    onSpecializationsChange?: (user: Consultant, specializationIds: string[]) => void;
    /** Grows the Specialization catalog itself — present only for `specialization:create` (admin, manager). */
    onCreateSpecialization?: (name: string) => Promise<SpecializationOption>;
    /** Renames the underlying Specialization row — present only for `specialization:update` (admin, manager). */
    onEditSpecialization?: (option: SpecializationOption) => void;
    /** Deactivates the underlying Specialization row — present only for `specialization:delete` (admin, manager). */
    onDeleteSpecialization?: (option: SpecializationOption) => void;
  };
  /**
   * Same gating pattern as `industries`/`specializations`, keyed to
   * `consultant_location:read` — this consultant's patch, at any level. No
   * catalog options here (Location is a ~2k-node searched tree, not an
   * in-memory list), so unlike the two above there's no create/rename/delete
   * affordance — Location is admin-only and never hand-typed.
   */
  locations?: {
    /** Absent when the caller lacks `consultant_location:update` — read-only badges instead of an editable picker. */
    onLocationsChange?: (user: Consultant, locationIds: string[]) => void;
  };
}

export function getConsultantColumns({
  pendingId,
  isSelf,
  onRoleChange,
  onStatusChange,
  industries,
  specializations,
  locations,
}: ConsultantColumnsOptions): ColumnDef<Consultant>[] {
  return [
    {
      accessorKey: 'fullName',
      header: 'Name',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initials(user.fullName)}
            </span>
            <span className="truncate font-medium text-foreground">{user.fullName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="block truncate text-muted-foreground">{row.original.email}</span>
      ),
    },
    {
      id: 'roleName',
      accessorFn: (user) => user.role?.name ?? '',
      header: 'Role',
      meta: { align: 'center', strictMinSize: true },
      cell: ({ row }) => {
        const user = row.original;
        const disabled = isSelf(user) || pendingId === user.id;
        return (
          <ComboboxSelect
            title="Role"
            value={user.role?.name ?? ''}
            onValueChange={(v) => onRoleChange(user, v as ConsultantRole)}
            options={roleOptions}
            placeholder="No role"
            disabled={disabled}
            triggerClassName="mx-auto"
          />
        );
      },
    },
    {
      accessorKey: 'isActive',
      enableSorting: false,
      meta: { align: 'center', strictMinSize: true },
      header: () => (
        <span className="inline-flex items-center gap-1">
          Status
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="size-3.5" />
                </button>
              }
            />
            <TooltipContent>
              Active consultants can sign in and access the app; inactive consultants are blocked
              from signing in. A row marked "Pending approval" has never signed in — approve it by
              switching to Active, or leave it if it should be rejected.
            </TooltipContent>
          </Tooltip>
        </span>
      ),
      cell: ({ row }) => {
        const user = row.original;
        const disabled = isSelf(user) || pendingId === user.id;
        const options = [
          activeStatusOption,
          user.pendingApproval ? pendingStatusOption : inactiveStatusOption,
        ];
        return (
          <ComboboxSelect
            title="Status"
            value={String(user.isActive)}
            onValueChange={(v) => onStatusChange(user, v === 'true')}
            options={options}
            disabled={disabled}
            triggerClassName="mx-auto"
          />
        );
      },
    },
    // {
    //   accessorKey: 'openJobOrders',
    //   header: 'Open JOs',
    //   size: 100,
    //   meta: { align: 'center' },
    //   cell: ({ row }) => (
    //     <span className="tabular-nums">{row.original.openJobOrders}</span>
    //   ),
    // },
    ...(industries
      ? [
          {
            id: 'industries',
            header: 'Industries',
            size: 200,
            enableSorting: false,
            cell: ({ row }: { row: { original: Consultant } }) => {
              const user = row.original;
              const selected = user.industryIds ?? [];
              if (!industries.onIndustriesChange) {
                return <TagPills options={industries.options} selected={selected} />;
              }
              const disabled = pendingId === user.id;
              // No data-no-row-drag here (or on Role/Status/Specializations)
              // — a mousedown that turns into a real drag never reaches this
              // element's click at all (the browser only fires `click` when
              // mouseup lands back on the same target), so row range-select
              // and "click to open the picker" don't actually conflict.
              return (
                <TagMultiSelect
                  title="Industries"
                  options={industries.options}
                  selected={selected}
                  onChange={(ids) => industries.onIndustriesChange!(user, ids)}
                  disabled={disabled}
                  onCreate={industries.onCreateIndustry}
                  tagActions={
                    industries.onEditIndustry || industries.onDeleteIndustry
                      ? { onEdit: industries.onEditIndustry, onDelete: industries.onDeleteIndustry }
                      : undefined
                  }
                />
              );
            },
          } satisfies ColumnDef<Consultant>,
        ]
      : []),
    ...(specializations
      ? [
          {
            id: 'specializations',
            header: 'Specializations',
            size: 200,
            enableSorting: false,
            cell: ({ row }: { row: { original: Consultant } }) => {
              const user = row.original;
              const selected = user.specializationIds ?? [];
              const names = user.specializations ?? [];
              if (!specializations.onSpecializationsChange) {
                return <SpecializationBadgeList ids={selected} names={names} />;
              }
              const industryIds = user.industryIds ?? [];
              const hasNoIndustries = industryIds.length === 0;
              const disabled = pendingId === user.id || hasNoIndustries;
              const picker = (
                <SpecializationMultiSelect
                  title="Specializations"
                  selected={selected}
                  selectedLabels={names}
                  // Only offer specializations under an industry this row
                  // already holds — mirrors the server-side check in
                  // `setSpecializations`, now enforced by the search itself
                  // rather than a client-side catalog filter.
                  industryIds={industryIds}
                  onChange={(ids) => specializations.onSpecializationsChange!(user, ids)}
                  disabled={disabled}
                  onCreate={specializations.onCreateSpecialization}
                  tagActions={
                    specializations.onEditSpecialization || specializations.onDeleteSpecialization
                      ? {
                          onEdit: specializations.onEditSpecialization,
                          onDelete: specializations.onDeleteSpecialization,
                        }
                      : undefined
                  }
                />
              );
              // Native title tooltip rather than the app's Tooltip component
              // — this is a single row-level hint, not worth the extra
              // floating-layer machinery used for the Status header's info icon.
              return hasNoIndustries ? (
                <span title="Assign an industry first — specializations narrow one, they can't stand alone.">
                  {picker}
                </span>
              ) : (
                picker
              );
            },
          } satisfies ColumnDef<Consultant>,
        ]
      : []),
    ...(locations
      ? [
          {
            id: 'locations',
            header: 'Locations',
            size: 220,
            enableSorting: false,
            cell: ({ row }: { row: { original: Consultant } }) => {
              const user = row.original;
              const names = user.locations ?? [];
              if (!locations.onLocationsChange) {
                return <LocationBadgeList locations={names} />;
              }
              const ids = user.locationIds ?? [];
              // No `level` for a row's already-assigned locations — the API
              // returns name+id only, not the badge-worthy level (see
              // LocationOption's own doc comment). It backfills the moment a
              // location is re-picked from a live search result.
              const selected: LocationOption[] = ids.map((id, i) => ({
                id,
                name: names[i] ?? id,
              }));
              const disabled = pendingId === user.id;
              return (
                <LocationMultiSelect
                  selected={selected}
                  onChange={(next) =>
                    locations.onLocationsChange!(
                      user,
                      next.map((l) => l.id),
                    )
                  }
                  disabled={disabled}
                  placeholder="No locations"
                />
              );
            },
          } satisfies ColumnDef<Consultant>,
        ]
      : []),
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      size: 140,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
  ];
}
