'use client';

import type { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import {
  type Company,
  type RelationshipStatus,
  type TobStatus,
  relationshipStatusLabels,
  tobStatusLabels,
} from './schema';

const relationshipVariant: Record<
  RelationshipStatus,
  'muted' | 'warning' | 'success' | 'outline'
> = {
  COLD: 'muted',
  WARM: 'warning',
  TRADED: 'success',
  UNS: 'outline',
};

const tobVariant: Record<TobStatus, 'muted' | 'warning' | 'success'> = {
  NONE: 'muted',
  SENT: 'warning',
  SIGNED: 'success',
};

export const companyColumns: ColumnDef<Company>[] = [
  {
    accessorKey: 'name',
    header: 'Company',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.original.name}</span>
    ),
  },
  {
    accessorKey: 'industry',
    header: 'Industry',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.industry}</span>
    ),
  },
  {
    accessorKey: 'location',
    header: 'Location',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.location}</span>
    ),
  },
  {
    accessorKey: 'relationshipStatus',
    header: 'Relationship',
    cell: ({ row }) => (
      <Badge variant={relationshipVariant[row.original.relationshipStatus]}>
        {relationshipStatusLabels[row.original.relationshipStatus]}
      </Badge>
    ),
  },
  {
    accessorKey: 'tobStatus',
    header: 'TOB',
    cell: ({ row }) => (
      <Badge variant={tobVariant[row.original.tobStatus]}>
        {tobStatusLabels[row.original.tobStatus]}
      </Badge>
    ),
  },
  {
    accessorKey: 'stakeholderCount',
    header: 'Stakeholders',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.stakeholderCount}</span>
    ),
  },
  {
    accessorKey: 'openJobOrders',
    header: 'Open JOs',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.openJobOrders}</span>
    ),
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.owner}</span>
    ),
  },
];
