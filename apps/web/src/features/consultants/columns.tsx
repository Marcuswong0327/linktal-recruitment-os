'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';

import { EnumSelect } from '@/components/EnumSelect';
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
const statusOptions = [
  {
    value: 'true',
    label: 'Active',
    triggerClassName: 'border-success/30 bg-success/10 text-success',
  },
  {
    value: 'false',
    label: 'Inactive',
    triggerClassName: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
];

interface ConsultantColumnsOptions {
  /** Editing a row while its mutation is in flight — disables that row's controls. */
  pendingId: string | null;
  /** Self-lockout: the signed-in user can't change their own role/status. */
  isSelf: (user: Consultant) => boolean;
  onRoleChange: (user: Consultant, role: ConsultantRole) => void;
  onStatusChange: (user: Consultant, isActive: boolean) => void;
}

export function getConsultantColumns({
  pendingId,
  isSelf,
  onRoleChange,
  onStatusChange,
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
      size: 160,
      meta: { align: 'center' },
      cell: ({ row }) => {
        const user = row.original;
        const disabled = isSelf(user) || pendingId === user.id;
        return (
          <div data-no-row-drag>
            <EnumSelect
              value={user.role?.name ?? ''}
              onValueChange={(v) => onRoleChange(user, v as ConsultantRole)}
              options={roleOptions}
              placeholder="No role"
              disabled={disabled}
              size="badge"
              className="w-fit mx-auto"
            />
          </div>
        );
      },
    },
    {
      accessorKey: 'isActive',
      size: 150,
      enableSorting: false,
      meta: { align: 'center' },
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
              from signing in.
            </TooltipContent>
          </Tooltip>
        </span>
      ),
      cell: ({ row }) => {
        const user = row.original;
        const disabled = isSelf(user) || pendingId === user.id;
        return (
          <div data-no-row-drag>
            <EnumSelect
              value={String(user.isActive)}
              onValueChange={(v) => onStatusChange(user, v === 'true')}
              options={statusOptions}
              disabled={disabled}
              size="badge"
              className="w-fit mx-auto"
            />
          </div>
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
