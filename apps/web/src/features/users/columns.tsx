'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import {
  type User,
  type UserRole,
  type UserStatus,
  userRoleLabels,
  userStatusLabels,
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

const roleVariant: Record<UserRole, 'default' | 'info' | 'muted'> = {
  ADMINISTRATOR: 'default',
  MANAGER: 'info',
  CONSULTANT: 'muted',
};

const statusVariant: Record<UserStatus, 'success' | 'warning' | 'destructive'> = {
  ACTIVE: 'success',
  INVITED: 'warning',
  DISABLED: 'destructive',
};

export const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {initials(user.name)}
          </span>
          <span className="font-medium text-foreground">{user.name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.email}</span>
    ),
  },
  {
    accessorKey: 'role',
    header: 'Role',
    size: 130,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <Badge variant={roleVariant[row.original.role]}>
        {userRoleLabels[row.original.role]}
      </Badge>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    size: 120,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {userStatusLabels[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: 'openJobOrders',
    header: 'Open JOs',
    size: 100,
    meta: { align: 'center' },
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.openJobOrders}</span>
    ),
  },
  {
    accessorKey: 'lastActiveAt',
    header: 'Last active',
    size: 140,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.lastActiveAt)}
      </span>
    ),
  },
];
