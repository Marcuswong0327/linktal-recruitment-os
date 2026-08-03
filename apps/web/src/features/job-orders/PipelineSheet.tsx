'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ArrowLeft, GripVertical, MessagesSquare, Plus, Rows3, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { EnumSelect } from '@/components/EnumSelect';
import { FormField } from '@/components/FormField';
import { getGetJobOrdersQueryKey } from '@/lib/api/generated/job-orders/job-orders';
import {
  getGetSubmissionsQueryKey,
  useUpdateSubmission,
} from '@/lib/api/generated/submissions/submissions';
import {
  getGetInterviewsQueryKey,
  useCreateInterview,
  useDeleteInterview,
  useGetInterviews,
  useUpdateInterview,
} from '@/lib/api/generated/interviews/interviews';
import { useCreatePlacement } from '@/lib/api/generated/placements/placements';
import type {
  CreatePlacementDtoFeeType,
  InterviewEntityOutcome,
  SubmissionEntityStatus,
} from '@/lib/api/generated/types';
import type { JobOrder, PipelineCandidate } from './schema';

const STAGES: { status: SubmissionEntityStatus; label: string }[] = [
  { status: 'SUBMITTED', label: 'Submissions' },
  { status: 'INTERVIEWING', label: 'Interviewing' },
  { status: 'PLACED', label: 'Placed' },
];

const dateInputClass =
  'rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30';

const outcomeOptions: { value: InterviewEntityOutcome; label: string }[] = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const outcomeVariant: Record<InterviewEntityOutcome, 'info' | 'warning' | 'success' | 'destructive' | 'muted'> = {
  SCHEDULED: 'info',
  PENDING: 'warning',
  PASSED: 'success',
  FAILED: 'destructive',
  CANCELLED: 'muted',
};

function nextRoundLabel(existingCount: number) {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th'];
  return existingCount < ordinals.length ? `${ordinals[existingCount]} Interview` : 'Final Interview';
}

/** The draggable chip. Drag is confined to the grip handle so a plain click on the name (for Interviewing-stage candidates) can open the interview-rounds view without fighting dnd-kit's pointer sensor. */
function CandidateChip({
  candidate,
  disabled,
  onClick,
}: {
  candidate: PipelineCandidate;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: candidate.submissionId,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-sm shadow-sm',
        disabled && 'opacity-60',
        isDragging && 'opacity-40',
      )}
    >
      {!disabled ? (
        <span
          {...listeners}
          {...attributes}
          className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </span>
      ) : null}
      {onClick ? (
        <button type="button" onClick={onClick} className="min-w-0 flex-1 truncate text-left hover:underline">
          {candidate.candidateName}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate" title={candidate.candidateName}>
          {candidate.candidateName}
        </span>
      )}
    </div>
  );
}

function StageColumn({
  status,
  label,
  candidates,
  onCandidateClick,
}: {
  status: SubmissionEntityStatus;
  label: string;
  candidates: PipelineCandidate[];
  onCandidateClick?: (candidate: PipelineCandidate) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-1 flex-col gap-2 rounded-xl border border-dashed p-3 transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label} ({candidates.length})
      </span>
      {candidates.length === 0 ? (
        <span className="text-xs text-muted-foreground/60">Empty</span>
      ) : (
        candidates.map((c) => (
          <CandidateChip
            key={c.submissionId}
            candidate={c}
            onClick={onCandidateClick ? () => onCandidateClick(c) : undefined}
          />
        ))
      )}
    </div>
  );
}

type SheetView =
  | { type: 'board' }
  | { type: 'interviews'; candidate: PipelineCandidate }
  | { type: 'placement'; candidate: PipelineCandidate };

/**
 * Right-docked panel purely for moving candidates between pipeline stages by
 * drag — separate from the Candidates cell's roster add/remove combobox, and
 * separate from the dedicated Job Order page (which stays for editing the
 * job order's own fields).
 *
 * Dragging into Interviewing lets you open that candidate's interview rounds
 * (label/date/outcome). Dragging into Placed opens the real Placement form
 * (base salary, super%, fee) instead of silently flipping status — creating
 * it server-side also marks the candidate Placed, fills the job order, and
 * trades the client on their first placement.
 */
export function PipelineSheetTrigger({ jobOrder }: { jobOrder: JobOrder }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<SheetView>({ type: 'board' });
  const [activeCandidate, setActiveCandidate] = React.useState<PipelineCandidate | null>(null);

  function invalidateJobOrder() {
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() });
  }

  const updateSubmission = useUpdateSubmission({
    mutation: {
      onSuccess: invalidateJobOrder,
      onError: (err) => toast.error(err.message || 'Failed to move candidate'),
    },
  });

  const rejected = jobOrder.pipelineSubmissions.filter((c) => c.status === 'REJECTED');

  function handleDragEnd(event: DragEndEvent) {
    setActiveCandidate(null);
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as SubmissionEntityStatus;
    const candidate = jobOrder.pipelineSubmissions.find((c) => c.submissionId === active.id);
    if (!candidate || candidate.status === newStatus) return;

    if (newStatus === 'PLACED') {
      // Placement is a real business record (fee calc, guarantee period,
      // downstream auto-updates) — collect that instead of just flipping
      // status like the other transitions.
      setView({ type: 'placement', candidate });
      return;
    }
    updateSubmission.mutate({ id: candidate.submissionId, data: { status: newStatus } });
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) setView({ type: 'board' });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Move candidates between stages"
        aria-label="Move candidates between stages"
        data-no-row-drag
      >
        <Rows3 className="text-muted-foreground" />
      </Button>

      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="w-full sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
          {view.type === 'board' ? (
            <>
              <SheetHeader>
                <SheetTitle>{jobOrder.jobTitle} pipeline</SheetTitle>
                <SheetDescription>
                  Drag a candidate between stages to move them. Click an interviewing
                  candidate's name to manage their interview rounds.
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 pb-6">
                <DndContext
                  collisionDetection={pointerWithin}
                  onDragStart={(e) =>
                    setActiveCandidate(
                      jobOrder.pipelineSubmissions.find((c) => c.submissionId === e.active.id) ?? null,
                    )
                  }
                  onDragEnd={handleDragEnd}
                  onDragCancel={() => setActiveCandidate(null)}
                >
                  <div className="flex gap-3">
                    {STAGES.map((stage) => (
                      <StageColumn
                        key={stage.status}
                        status={stage.status}
                        label={stage.label}
                        candidates={jobOrder.pipelineSubmissions.filter((c) => c.status === stage.status)}
                        onCandidateClick={
                          stage.status === 'INTERVIEWING'
                            ? (candidate) => setView({ type: 'interviews', candidate })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                  {rejected.length > 0 ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border/50 bg-muted/30 p-3">
                      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        Rejected
                      </span>
                      {rejected.map((c) => (
                        <CandidateChip key={c.submissionId} candidate={c} disabled />
                      ))}
                    </div>
                  ) : null}
                  {typeof document !== 'undefined'
                    ? createPortal(
                        <DragOverlay>
                          {activeCandidate ? (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
                              {activeCandidate.candidateName}
                            </div>
                          ) : null}
                        </DragOverlay>,
                        document.body,
                      )
                    : null}
                </DndContext>
              </div>
            </>
          ) : view.type === 'interviews' ? (
            <InterviewRoundsView candidate={view.candidate} onBack={() => setView({ type: 'board' })} />
          ) : (
            <PlacementFormView
              jobOrder={jobOrder}
              candidate={view.candidate}
              onCancel={() => setView({ type: 'board' })}
              onCreated={() => {
                invalidateJobOrder();
                setView({ type: 'board' });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function InterviewRoundsView({
  candidate,
  onBack,
}: {
  candidate: PipelineCandidate;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetInterviews({ submissionId: candidate.submissionId });
  const rounds = data?.status === 200 ? data.data : [];

  const [roundLabel, setRoundLabel] = React.useState('');
  const [interviewDate, setInterviewDate] = React.useState('');

  // Reseed the suggested label whenever the round count changes (not on every keystroke).
  React.useEffect(() => {
    if (!isLoading) setRoundLabel(nextRoundLabel(rounds.length));
  }, [rounds.length, isLoading]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetInterviewsQueryKey({ submissionId: candidate.submissionId }) });
    // The main Job Orders sheet's Interview Date column reads from the job
    // orders list cache (pipelineSubmissions[].latestInterviewDate), not this
    // interviews query — without this it never picks up a new/changed round.
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
  }

  const createInterview = useCreateInterview({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Interview round added');
        setInterviewDate('');
      },
      onError: (err) => toast.error(err.message || 'Failed to add interview round'),
    },
  });
  const updateInterview = useUpdateInterview({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => toast.error(err.message || 'Failed to update interview round'),
    },
  });
  const deleteInterview = useDeleteInterview({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => toast.error(err.message || 'Failed to remove interview round'),
    },
  });

  function handleAdd() {
    if (!roundLabel.trim() || !interviewDate) return;
    createInterview.mutate({
      data: { submissionId: candidate.submissionId, roundLabel: roundLabel.trim(), interviewDate },
    });
  }

  return (
    <>
      <SheetHeader>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to pipeline
        </Button>
        <SheetTitle className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-muted-foreground" />
          {candidate.candidateName}'s interview rounds
        </SheetTitle>
        <SheetDescription>Track each round's date and outcome.</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 pb-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interview rounds yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rounds.map((round) => (
              <li
                key={round.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{round.roundLabel}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(round.interviewDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <EnumSelect
                    value={round.outcome}
                    onValueChange={(v) =>
                      updateInterview.mutate({ id: round.id, data: { outcome: v as InterviewEntityOutcome } })
                    }
                    options={outcomeOptions}
                    size="badge"
                  />
                  <Badge variant={outcomeVariant[round.outcome]} className="sr-only">
                    {round.outcome}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={deleteInterview.isPending}
                    onClick={() => deleteInterview.mutate({ id: round.id })}
                    aria-label="Remove round"
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2 border-t border-border pt-4">
          <FormField label="Round" htmlFor="round-label">
            <Input id="round-label" value={roundLabel} onChange={(e) => setRoundLabel(e.target.value)} />
          </FormField>
          <FormField label="Date" htmlFor="round-date">
            <input
              id="round-date"
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className={dateInputClass}
            />
          </FormField>
          <Button
            size="sm"
            disabled={!roundLabel.trim() || !interviewDate || createInterview.isPending}
            onClick={handleAdd}
          >
            <Plus />
            Add
          </Button>
        </div>
      </div>
    </>
  );
}

function PlacementFormView({
  jobOrder,
  candidate,
  onCancel,
  onCreated,
}: {
  jobOrder: JobOrder;
  candidate: PipelineCandidate;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [baseSalary, setBaseSalary] = React.useState('');
  const [superPercentage, setSuperPercentage] = React.useState('12');
  const [feeType, setFeeType] = React.useState<CreatePlacementDtoFeeType>('PERCENTAGE');
  const [feePercentage, setFeePercentage] = React.useState('15');
  const [feeValue, setFeeValue] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [accountsNotified, setAccountsNotified] = React.useState(false);

  const createPlacement = useCreatePlacement({
    mutation: {
      onSuccess: () => {
        toast.success(`${candidate.candidateName} placed`);
        onCreated();
      },
      onError: (err) => toast.error(err.message || 'Failed to create placement'),
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createPlacement.mutate({
      data: {
        submissionId: candidate.submissionId,
        baseSalary: baseSalary === '' ? undefined : Number(baseSalary),
        superPercentage: superPercentage === '' ? undefined : Number(superPercentage),
        feeType,
        feePercentage: feeType === 'PERCENTAGE' && feePercentage !== '' ? Number(feePercentage) : undefined,
        feeValue: feeType === 'FLAT' && feeValue !== '' ? Number(feeValue) : undefined,
        startDate: startDate || undefined,
        accountsNotified,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="-ml-2 w-fit text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Back to pipeline
        </Button>
        <SheetTitle>Place {candidate.candidateName}</SheetTitle>
        <SheetDescription>
          For {jobOrder.jobTitle}. Creates the placement record and marks the candidate, job order and
          client accordingly.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 pb-6">
        <FormField label="Base salary" htmlFor="placement-base-salary">
          <Input
            id="placement-base-salary"
            type="number"
            min={0}
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
          />
        </FormField>
        <FormField label="Super %" htmlFor="placement-super" description="Default 12% per Terms of Business">
          <Input
            id="placement-super"
            type="number"
            min={0}
            max={100}
            value={superPercentage}
            onChange={(e) => setSuperPercentage(e.target.value)}
          />
        </FormField>
        <FormField label="Fee type" htmlFor="placement-fee-type">
          <EnumSelect
            id="placement-fee-type"
            value={feeType}
            onValueChange={(v) => setFeeType(v as CreatePlacementDtoFeeType)}
            options={[
              { value: 'PERCENTAGE', label: 'Percentage of total package' },
              { value: 'FLAT', label: 'Flat amount' },
            ]}
          />
        </FormField>
        {feeType === 'PERCENTAGE' ? (
          <FormField label="Fee %" htmlFor="placement-fee-percentage">
            <Input
              id="placement-fee-percentage"
              type="number"
              min={0}
              max={100}
              value={feePercentage}
              onChange={(e) => setFeePercentage(e.target.value)}
            />
          </FormField>
        ) : (
          <FormField label="Fee value" htmlFor="placement-fee-value">
            <Input
              id="placement-fee-value"
              type="number"
              min={0}
              value={feeValue}
              onChange={(e) => setFeeValue(e.target.value)}
            />
          </FormField>
        )}
        <FormField label="Start date" htmlFor="placement-start-date" description="= invoice date; guarantee end date is calculated from this">
          <input
            id="placement-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={cn(dateInputClass, 'w-full')}
          />
        </FormField>
        <label htmlFor="placement-accounts-notified" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="placement-accounts-notified"
            checked={accountsNotified}
            onCheckedChange={(checked) => setAccountsNotified(!!checked)}
          />
          Accounts notified
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-border p-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={createPlacement.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPlacement.isPending}>
          {createPlacement.isPending ? 'Placing…' : 'Create placement'}
        </Button>
      </div>
    </form>
  );
}
