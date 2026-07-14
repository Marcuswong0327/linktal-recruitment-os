'use client';

import { Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { badgeVariants } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConsultantCombobox } from '@/components/ConsultantCombobox';
import { getGetJobOrdersQueryKey, useUpdateJobOrder } from '@/lib/api/generated/job-orders/job-orders';
import type { ConsultantEntity, UpdateJobOrderDto } from '@/lib/api/generated/types';
import {
  type JobOrder,
  jobOrderStatuses,
  jobOrderStatusLabels,
  priorityLabels,
  priorityVariant,
  statusVariant,
} from './schema';

/**
 * Inline status editor for the job orders grid: the status pill opens a menu
 * of statuses and PATCHes just that field — no need to open the edit drawer.
 */
export function JobOrderStatusCell({ jobOrder }: { jobOrder: JobOrder }) {
  const queryClient = useQueryClient();

  const updateStatus = useUpdateJobOrder({
    mutation: {
      onSuccess: (_result, { data }) => {
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        toast.success(`${jobOrder.jobTitle} marked ${jobOrderStatusLabels[data.status ?? jobOrder.status]}`);
      },
      onError: (err) => toast.error(err.message || 'Failed to update status'),
    },
  });

  return (
    // The grid row navigates on click; keep pill clicks inside the cell.
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={updateStatus.isPending}
          className={cn(
            badgeVariants({ variant: statusVariant[jobOrder.status] }),
            'cursor-pointer disabled:opacity-50',
          )}
        >
          {jobOrderStatusLabels[jobOrder.status]}
          <ChevronDown className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {jobOrderStatuses.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() => {
                if (status !== jobOrder.status) {
                  updateStatus.mutate({ id: jobOrder.id, data: { status } });
                }
              }}
            >
              <span className={badgeVariants({ variant: statusVariant[status] })}>
                {jobOrderStatusLabels[status]}
              </span>
              {status === jobOrder.status ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const priorityLevels = Object.keys(priorityLabels).map(Number);

/** Inline priority editor for the job orders grid — same pattern as JobOrderStatusCell. */
export function JobOrderPriorityCell({ jobOrder }: { jobOrder: JobOrder }) {
  const queryClient = useQueryClient();

  const updatePriority = useUpdateJobOrder({
    mutation: {
      onSuccess: (_result, { data }) => {
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        const priority = data.priorityLevel ?? jobOrder.priorityLevel;
        toast.success(`${jobOrder.jobTitle} set to ${priority != null ? priorityLabels[priority] : 'no'} priority`);
      },
      onError: (err) => toast.error(err.message || 'Failed to update priority'),
    },
  });

  const priority = jobOrder.priorityLevel;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={updatePriority.isPending}
          className={cn(
            priority != null
              ? badgeVariants({ variant: priorityVariant[priority] })
              : badgeVariants({ variant: 'muted' }),
            'cursor-pointer disabled:opacity-50',
          )}
        >
          {priority != null ? priorityLabels[priority] : 'Not set'}
          <ChevronDown className="size-3 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {priorityLevels.map((level) => (
            <DropdownMenuItem
              key={level}
              onClick={() => {
                if (level !== priority) {
                  updatePriority.mutate({ id: jobOrder.id, data: { priorityLevel: level } });
                }
              }}
            >
              <span className={badgeVariants({ variant: priorityVariant[level] })}>{priorityLabels[level]}</span>
              {level === priority ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Inline consultant assignment for the job orders grid — same combobox as the companies table's consultant column. */
export function JobOrderConsultantCell({
  jobOrder,
  consultants,
}: {
  jobOrder: JobOrder;
  consultants: ConsultantEntity[];
}) {
  const queryClient = useQueryClient();

  const updateConsultant = useUpdateJobOrder({
    mutation: {
      onSuccess: (_result, { data }) => {
        queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
        toast.success(data.consultantId ? 'Consultant assigned' : 'Consultant unassigned');
      },
      onError: (err) => toast.error(err.message || 'Failed to update consultant'),
    },
  });

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ConsultantCombobox
        value={jobOrder.consultantId ?? ''}
        onValueChange={(consultantId) =>
          updateConsultant.mutate({
            id: jobOrder.id,
            // Generated type omits null (API accepts it to clear the FK) — cast
            // around the gap rather than sending '' which Prisma would reject.
            data: { consultantId: consultantId || null } as unknown as UpdateJobOrderDto,
          })
        }
        consultants={consultants}
        disabled={updateConsultant.isPending}
        className="w-fit mx-auto"
      />
    </div>
  );
}
