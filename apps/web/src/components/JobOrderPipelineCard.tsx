'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Mail, Phone, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CandidateCombobox } from '@/components/CandidateCombobox';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { LinkedinIcon } from '@/components/BrandIcons';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { cn } from '@/lib/utils';
import { getGetCandidatesQueryKey } from '@/lib/api/generated/candidates/candidates';
import {
  getGetJobOrderQueryKey,
  getGetJobOrdersQueryKey,
} from '@/lib/api/generated/job-orders/job-orders';
import {
  getGetInterviewsQueryKey,
  useCreateInterview,
  useGetInterviews,
  useUpdateInterview,
} from '@/lib/api/generated/interviews/interviews';
import {
  getGetPlacementsQueryKey,
  useCreatePlacement,
  useGetPlacements,
  useUpdatePlacement,
} from '@/lib/api/generated/placements/placements';
import {
  getGetSubmissionsQueryKey,
  useCreateSubmission,
  useDeleteSubmission,
  useUpdateSubmission,
} from '@/lib/api/generated/submissions/submissions';
import type {
  CandidateEntity,
  InterviewEntity,
  JobOrderEntity,
  JobOrderPipelineCandidateEntity,
  PlacementEntity,
} from '@/lib/api/generated/types';

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function toDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function copyValue(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Couldn't copy ${label.toLowerCase()}`),
  );
}

/** One icon per contact method — mirrors CandidateDetail's ContactIconButton/ContactCopyButton, sized down for a table cell. A method with no value on file renders greyed-out and inert rather than being hidden, so the row doesn't reflow. */
function ContactIcon({
  icon: Icon,
  href,
  onClick,
  disabled,
  label,
  activeClassName = 'text-muted-foreground hover:text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
  activeClassName?: string;
}) {
  const className = cn(
    'flex size-6 items-center justify-center rounded-md transition-colors',
    disabled ? 'cursor-not-allowed text-muted-foreground' : cn(activeClassName, 'hover:bg-accent'),
  );
  const icon = <Icon className={cn('size-3.5', disabled && 'opacity-30 grayscale')} />;
  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={label}
        aria-label={label}
        className={className}
      >
        {icon}
      </button>
    );
  }
  return (
    <a
      href={disabled ? undefined : href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={disabled}
      onClick={disabled ? (e) => e.preventDefault() : undefined}
      title={label}
      aria-label={label}
      className={className}
    >
      {icon}
    </a>
  );
}

/** Mail (mailto) / Phone (copy) / LinkedIn (redirect) — shared between the pipeline table's candidate rows and the Information card's Key Stakeholder contact. */
export function ContactIconRow({
  email,
  mobile,
  linkedinUrl,
}: {
  email?: string | null;
  mobile?: string | null;
  linkedinUrl?: string | null;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <ContactIcon
        icon={Mail}
        href={email ? `mailto:${email}` : undefined}
        disabled={!email}
        label={email ? 'Email' : 'No email on file'}
      />
      <ContactIcon
        icon={Phone}
        onClick={mobile ? () => copyValue(mobile, 'Mobile') : undefined}
        disabled={!mobile}
        label={mobile ? 'Copy mobile' : 'No mobile on file'}
      />
      <ContactIcon
        icon={LinkedinIcon}
        href={linkedinUrl ?? undefined}
        disabled={!linkedinUrl}
        label={linkedinUrl ? 'LinkedIn' : 'No LinkedIn on file'}
        activeClassName="text-[#0A66C2]"
      />
    </div>
  );
}

function TickCrossButton({
  icon: Icon,
  active,
  tone,
  onClick,
  disabled,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  tone: 'positive' | 'negative';
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex size-6 items-center justify-center rounded-md border transition-colors',
        disabled && 'cursor-not-allowed',
        // A disabled *inactive* button is just locked (nothing to show), so it
        // fades out. A disabled *active* button is a known, settled outcome —
        // it keeps its full tick/cross color, just slightly dimmed, rather
        // than losing the color and reading as "unknown".
        !active &&
          (disabled
            ? 'border-border text-muted-foreground opacity-40'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'),
        active &&
          tone === 'positive' &&
          'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        active && tone === 'negative' && 'border-destructive/40 bg-destructive/15 text-destructive',
        active && disabled && 'opacity-80',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/** Gray by default, green when ticked, red when crossed — clicking the already-active button toggles it back off (undo), same "set state" shape used throughout instead of a separate undo control. */
function TickCrossPair({
  state,
  onTick,
  onCross,
  disabled,
  tickLabel,
  crossLabel,
}: {
  state: 'tick' | 'cross' | null;
  onTick: () => void;
  onCross: () => void;
  disabled?: boolean;
  tickLabel: string;
  crossLabel: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <TickCrossButton
        icon={Check}
        active={state === 'tick'}
        tone="positive"
        onClick={onTick}
        disabled={disabled}
        label={tickLabel}
      />
      <TickCrossButton
        icon={X}
        active={state === 'cross'}
        tone="negative"
        onClick={onCross}
        disabled={disabled}
        label={crossLabel}
      />
    </div>
  );
}

const dateInputClass =
  'h-7 w-32 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

function PipelineRow({
  index,
  row,
  interview,
  placement,
  onShortlist,
  onInterviewDateChange,
  onInterviewOutcome,
  onAccept,
  onDecline,
  onStartDateChange,
  onRemove,
  saving,
}: {
  index: number;
  row: JobOrderPipelineCandidateEntity;
  interview: InterviewEntity | null;
  placement: PlacementEntity | null;
  onShortlist: (value: boolean | null) => void;
  onInterviewDateChange: (date: string) => void;
  onInterviewOutcome: (outcome: 'SCHEDULED' | 'PASSED' | 'FAILED') => void;
  onAccept: () => void;
  onDecline: (value: boolean | null) => void;
  onStartDateChange: (date: string) => void;
  onRemove: () => void;
  saving: boolean;
}) {
  // Each stage is its own tri-state column (null = undecided) — not derived
  // from `status` or from each other. The Interview column still gates on
  // Shortlisted being ticked, but CDD Accepted is a shortcut: ticking it
  // directly backfills Shortlisted + a Passed interview instead of requiring
  // them to be ticked in order first (see onAccept below).
  const shortlistState: 'tick' | 'cross' | null =
    row.shortlisted === true ? 'tick' : row.shortlisted === false ? 'cross' : null;
  const interviewGateOpen = row.shortlisted === true;

  const outcomeState: 'tick' | 'cross' | null =
    interview?.outcome === 'PASSED' ? 'tick' : interview?.outcome === 'FAILED' ? 'cross' : null;

  const cddState: 'tick' | 'cross' | null =
    row.cddAccepted === true ? 'tick' : row.cddAccepted === false ? 'cross' : null;
  // Ticking CDD Accepted creates the Placement in the same action (see
  // onAccept below) — once that's happened it's locked, same "irreversible
  // via this simple UI" reasoning as the rest of this table.
  const accepted = row.cddAccepted === true;
  // The candidate can't start before they interviewed — gates the Starting
  // date input's floor (both via the native date picker's `min` and an
  // explicit check, since a typed-in date can bypass `min`).
  const interviewDateValue = toDateInputValue(interview?.interviewDate);

  return (
    <TableRow className="divide-x divide-border align-top">
      <TableCell className="text-muted-foreground">{index}</TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col gap-1">
          <Link href={`/candidates/${row.candidateId}`} className="font-medium hover:underline">
            {row.candidateName}
          </Link>
          <ContactIconRow
            email={row.candidateEmail}
            mobile={row.candidateMobile}
            linkedinUrl={row.candidateLinkedinUrl}
          />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {shortDateFormatter.format(new Date(row.submittedAt))}
      </TableCell>
      <TableCell>
        <TickCrossPair
          state={shortlistState}
          disabled={saving || accepted}
          onTick={() => onShortlist(shortlistState === 'tick' ? null : true)}
          onCross={() => onShortlist(shortlistState === 'cross' ? null : false)}
          tickLabel="Shortlisted for interview"
          crossLabel="Not shortlisted"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Interview date"
            value={toDateInputValue(interview?.interviewDate)}
            onChange={(e) => e.target.value && onInterviewDateChange(e.target.value)}
            disabled={saving || !interviewGateOpen || accepted}
            className={dateInputClass}
          />
          <TickCrossPair
            state={outcomeState}
            disabled={saving || !interviewGateOpen || !interview || accepted}
            onTick={() => onInterviewOutcome(outcomeState === 'tick' ? 'SCHEDULED' : 'PASSED')}
            onCross={() => onInterviewOutcome(outcomeState === 'cross' ? 'SCHEDULED' : 'FAILED')}
            tickLabel="Passed interview"
            crossLabel="Failed interview"
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <TickCrossPair
            state={cddState}
            disabled={saving || accepted}
            onTick={onAccept}
            onCross={() => onDecline(cddState === 'cross' ? null : false)}
            tickLabel="CDD accepted"
            crossLabel="CDD declined"
          />
          {accepted ? (
            <input
              type="date"
              aria-label="Starting date"
              value={toDateInputValue(placement?.startDate)}
              min={interviewDateValue || undefined}
              onChange={(e) => {
                const date = e.target.value;
                if (!date) return;
                if (interviewDateValue && date < interviewDateValue) {
                  toast.error('Starting date cannot be earlier than the interview date');
                  return;
                }
                onStartDateChange(date);
              }}
              disabled={saving}
              className={dateInputClass}
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <button
          type="button"
          disabled={saving || accepted}
          onClick={onRemove}
          title={accepted ? "Can't remove a placed candidate" : 'Remove from pipeline'}
          aria-label="Remove from pipeline"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          <Trash2 className="size-3.5" />
        </button>
      </TableCell>
    </TableRow>
  );
}

/**
 * The Candidate Pipeline card on the Job Order detail page. Reads
 * `jobOrder.pipelineSubmissions` (already aggregated server-side) for the
 * per-candidate rows, and layers in the actual Interview/Placement records
 * (fetched once per job order, not per row) for the two right-hand columns —
 * `pipelineSubmissions` only carries the *latest* interview date, not the
 * outcome or an id to update.
 */
export function JobOrderPipelineCard({
  jobOrder,
  candidates,
  clientIndustryId,
}: {
  jobOrder: JobOrderEntity;
  candidates: CandidateEntity[];
  clientIndustryId?: string | null;
}) {
  const queryClient = useQueryClient();

  const { data: interviewsData } = useGetInterviews({ jobOrderId: jobOrder.id });
  const interviews: InterviewEntity[] = interviewsData?.status === 200 ? interviewsData.data : [];
  const { data: placementsData } = useGetPlacements({ jobOrderId: jobOrder.id });
  const placements: PlacementEntity[] = placementsData?.status === 200 ? placementsData.data : [];

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetJobOrderQueryKey(jobOrder.id) });
    queryClient.invalidateQueries({ queryKey: getGetJobOrdersQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetInterviewsQueryKey({ jobOrderId: jobOrder.id }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetPlacementsQueryKey({ jobOrderId: jobOrder.id }),
    });
    queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCandidatesQueryKey() });
  }

  const updateSubmission = useUpdateSubmission({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to update stage'),
    },
  });
  const createInterview = useCreateInterview({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to save interview date'),
    },
  });
  const updateInterview = useUpdateInterview({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to update interview'),
    },
  });
  const createPlacement = useCreatePlacement({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to record placement'),
    },
  });
  const updatePlacement = useUpdatePlacement({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to update placement'),
    },
  });

  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [pickerValue, setPickerValue] = React.useState('');
  const createSubmission = useCreateSubmission({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setPickerValue('');
        setSubmitOpen(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to submit'),
    },
  });

  const [confirmingRemove, setConfirmingRemove] = React.useState<JobOrderPipelineCandidateEntity | null>(null);
  const deleteSubmission = useDeleteSubmission();

  function handleRemove(row: JobOrderPipelineCandidateEntity) {
    setConfirmingRemove(null);
    // No restore endpoint for Submission — delayed mode: nothing is sent to
    // the server until the undo window elapses, so Undo is exact.
    deleteWithUndo({
      label: `${row.candidateName ?? 'this candidate'} from the pipeline`,
      deleteFn: () => deleteSubmission.mutateAsync({ id: row.submissionId }),
      onCommitted: invalidateAll,
      onUndo: invalidateAll,
    });
  }

  function handleSubmitCandidate() {
    if (!pickerValue) return;
    const candidate = candidates.find((c) => c.id === pickerValue);
    const mismatch =
      (!!clientIndustryId && candidate != null && candidate.industryId !== clientIndustryId) ||
      (!!jobOrder.locationId && candidate != null && candidate.locationId !== jobOrder.locationId);
    createSubmission.mutate(
      { data: { candidateId: pickerValue, jobOrderId: jobOrder.id } },
      {
        onSuccess: () => {
          toast[mismatch ? 'warning' : 'success'](
            mismatch
              ? "This candidate's industry or location doesn't match the job order's — still fine to submit, just a heads-up to double-check the fit."
              : 'Submitted',
          );
        },
      },
    );
  }

  const rows = React.useMemo(
    () =>
      [...jobOrder.pipelineSubmissions].sort(
        (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      ),
    [jobOrder.pipelineSubmissions],
  );

  // Only one interview round is managed from this table (roundLabel
  // "Interview") — a candidate can still carry several rounds in the data
  // model, but this view only ever needs the latest to drive its single
  // date+outcome column, same as `pipelineSubmissions.latestInterviewDate`.
  const interviewBySubmission = React.useMemo(() => {
    const map = new Map<string, InterviewEntity>();
    for (const interview of interviews) {
      const existing = map.get(interview.submissionId);
      if (!existing || new Date(interview.interviewDate) > new Date(existing.interviewDate)) {
        map.set(interview.submissionId, interview);
      }
    }
    return map;
  }, [interviews]);

  const placementBySubmission = React.useMemo(
    () => new Map(placements.map((p) => [p.submissionId, p])),
    [placements],
  );

  const mutating =
    updateSubmission.isPending ||
    createInterview.isPending ||
    updateInterview.isPending ||
    createPlacement.isPending ||
    updatePlacement.isPending;

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between border-b">
        <CardTitle>Candidate Pipeline ({rows.length} Candidates ING)</CardTitle>
        <Popover open={submitOpen} onOpenChange={setSubmitOpen}>
          <PopoverTrigger
            render={
              <Button type="button" size="sm">
                <Plus />
                Submit Candidate
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72">
            <div className="flex flex-col gap-2">
              <CandidateCombobox
                value={pickerValue}
                onValueChange={setPickerValue}
                candidates={candidates}
              />
              <Button
                type="button"
                size="sm"
                disabled={!pickerValue || createSubmission.isPending}
                onClick={handleSubmitCandidate}
              >
                {createSubmission.isPending ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No candidates submitted yet.</p>
        ) : (
          <div className="max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="divide-x divide-border">
                  <TableHead className="w-10">No.</TableHead>
                  <TableHead>Name / Contact</TableHead>
                  <TableHead>Submitted Date</TableHead>
                  <TableHead>Client Shortlisted to Interview</TableHead>
                  <TableHead>Interview Date &amp; Outcome</TableHead>
                  <TableHead>CDD Accepted &amp; Starting Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <PipelineRow
                    key={row.submissionId}
                    index={i + 1}
                    row={row}
                    interview={interviewBySubmission.get(row.submissionId) ?? null}
                    placement={placementBySubmission.get(row.submissionId) ?? null}
                    saving={mutating}
                    onShortlist={(shortlisted) =>
                      updateSubmission.mutate({ id: row.submissionId, data: { shortlisted } })
                    }
                    onInterviewDateChange={(date) => {
                      const existing = interviewBySubmission.get(row.submissionId);
                      if (existing) {
                        updateInterview.mutate({ id: existing.id, data: { interviewDate: date } });
                      } else {
                        createInterview.mutate({
                          data: {
                            submissionId: row.submissionId,
                            roundLabel: 'Interview',
                            interviewDate: date,
                          },
                        });
                      }
                    }}
                    onInterviewOutcome={(outcome) => {
                      const existing = interviewBySubmission.get(row.submissionId);
                      if (existing) updateInterview.mutate({ id: existing.id, data: { outcome } });
                    }}
                    onAccept={() => {
                      // Checking CDD Accepted directly is a shortcut through the
                      // earlier gates — backfill Shortlisted and a Passed
                      // interview (creating one if the candidate never had one)
                      // instead of requiring them ticked in order first.
                      updateSubmission.mutate({
                        id: row.submissionId,
                        data: { shortlisted: true, cddAccepted: true },
                      });
                      const existingInterview = interviewBySubmission.get(row.submissionId);
                      if (existingInterview) {
                        if (existingInterview.outcome !== 'PASSED') {
                          updateInterview.mutate({
                            id: existingInterview.id,
                            data: { outcome: 'PASSED' },
                          });
                        }
                      } else {
                        createInterview.mutate({
                          data: {
                            submissionId: row.submissionId,
                            roundLabel: 'Interview',
                            interviewDate: new Date().toISOString().slice(0, 10),
                            outcome: 'PASSED',
                          },
                        });
                      }
                      createPlacement.mutate({ data: { submissionId: row.submissionId } });
                    }}
                    onDecline={(cddAccepted) =>
                      updateSubmission.mutate({ id: row.submissionId, data: { cddAccepted } })
                    }
                    onStartDateChange={(date) => {
                      const placement = placementBySubmission.get(row.submissionId);
                      if (placement)
                        updatePlacement.mutate({ id: placement.id, data: { startDate: date } });
                    }}
                    onRemove={() => setConfirmingRemove(row)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ConfirmDeleteDialog
        open={confirmingRemove !== null}
        onOpenChange={(open) => !open && setConfirmingRemove(null)}
        title="Remove from pipeline?"
        description="You can undo this from the toast right after, or it's gone for good."
        confirmLabel="Remove"
        onConfirm={() => confirmingRemove && handleRemove(confirmingRemove)}
      />
    </Card>
  );
}
