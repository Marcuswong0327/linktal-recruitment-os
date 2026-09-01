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
import { ConfirmSubmitCandidateDialog } from '@/components/ConfirmSubmitCandidateDialog';
import { LinkedinIcon } from '@/components/BrandIcons';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import { cn } from '@/lib/utils';
import { snapToQuarterHour, toDateOnly } from '@/lib/datetime';
import { DateTimeField } from '@/components/DateTimeField';
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
  useDeletePlacement,
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
  UpdateSubmissionDto,
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
  onCdd,
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
  /** true = accepted (creates the placement), false = declined, null = undecided (deletes it again). */
  onCdd: (next: boolean | null) => void;
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
  // Ticking CDD Accepted creates the Placement; un-ticking deletes it again.
  // Nothing in this row locks after that — the API's placement delete fully
  // reverses its own side effects (submission back to INTERVIEWING, candidate
  // to WARM, the job order's filledCount decremented and un-PLACED, the client
  // back to WARM if that was its only placement), so a mis-click here is
  // correctable rather than permanent.
  const accepted = row.cddAccepted === true;
  // The candidate can't start before they interviewed — gates the Starting
  // date input's floor (both via the native date picker's `min` and an
  // explicit check, since a typed-in date can bypass `min`).
  // Date part only: the interview is now a datetime while the start date below
  // stays date-only, and comparing the two raw strings would make a same-day
  // start look "earlier" than its interview.
  const interviewDateValue = toDateOnly(interview?.interviewDate);

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
          disabled={saving}
          onTick={() => onShortlist(shortlistState === 'tick' ? null : true)}
          onCross={() => onShortlist(shortlistState === 'cross' ? null : false)}
          tickLabel="Shortlisted for interview"
          crossLabel="Not shortlisted"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <DateTimeField
            value={interview?.interviewDate}
            onChange={(iso) => iso && onInterviewDateChange(iso)}
            disabled={saving || !interviewGateOpen}
            size="sm"
            dateAriaLabel="Interview date"
            hourAriaLabel="Interview hour"
            minuteAriaLabel="Interview minute"
          />
          <TickCrossPair
            state={outcomeState}
            disabled={saving || !interviewGateOpen || !interview}
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
            disabled={saving}
            onTick={() => onCdd(cddState === 'tick' ? null : true)}
            onCross={() => onCdd(cddState === 'cross' ? null : false)}
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
          title={
            accepted
              ? 'Un-tick CDD accepted first — that deletes the placement'
              : 'Remove from pipeline'
          }
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
  clientIndustryId,
  clientIndustry,
}: {
  jobOrder: JobOrderEntity;
  clientIndustryId?: string | null;
  /** Resolved industry name, for the mismatch copy in the confirm dialog. */
  clientIndustry?: string | null;
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
  const deletePlacement = useDeletePlacement({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to undo the placement'),
    },
  });

  const updatePlacement = useUpdatePlacement({
    mutation: {
      onSuccess: invalidateAll,
      onError: (err) => toast.error(err.message || 'Failed to update placement'),
    },
  });

  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [pickedCandidate, setPickedCandidate] = React.useState<CandidateEntity | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = React.useState(false);
  const createSubmission = useCreateSubmission({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setPickedCandidate(null);
        setConfirmSubmitOpen(false);
        setSubmitOpen(false);
        toast.success('Submitted');
      },
      // Leaves the dialog open so the message is read next to what caused it —
      // notably the ALREADY_SUBMITTED conflict when someone else got there
      // first between opening the picker and confirming.
      onError: (err) => toast.error(err.message || 'Failed to submit'),
    },
  });

  // Everyone already in the pipeline, so the picker can grey them out. Live
  // rows only, which is right: the API revives a soft-deleted submission
  // rather than rejecting it, and those aren't in `pipelineSubmissions`.
  const submittedCandidateIds = React.useMemo(
    () => new Set(jobOrder.pipelineSubmissions.map((s) => s.candidateId)),
    [jobOrder.pipelineSubmissions],
  );

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

  // Close the popover before opening the dialog rather than stacking the two:
  // the modal dialog's focus trap would dismiss the popover at an
  // unpredictable moment otherwise, and focus needs to land back on the
  // trigger when the dialog closes.
  function handleSubmitClick() {
    if (!pickedCandidate) return;
    setSubmitOpen(false);
    setConfirmSubmitOpen(true);
  }

  function handleConfirmSubmit() {
    if (!pickedCandidate) return;
    createSubmission.mutate({ data: { candidateId: pickedCandidate.id, jobOrderId: jobOrder.id } });
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


  /**
   * Drops the placement backing a row, if there is one. The API's delete
   * reverses everything its create did — submission back to INTERVIEWING,
   * candidate to WARM, the job order's filledCount decremented (and un-PLACED
   * if it had filled), and the client back to WARM when that was its only
   * placement — so this is a genuine undo, not a dangling delete.
   */
  function clearPlacement(row: JobOrderPipelineCandidateEntity) {
    const placement = placementBySubmission.get(row.submissionId);
    if (placement) deletePlacement.mutate({ id: placement.id });
  }

  /**
   * Pushes a stage failure onto the interview round, or takes it back off.
   * Only ever touches an interview that already exists: inventing a round
   * purely to stamp FAILED on it would put a meeting in the record that never
   * happened. With no round scheduled there's nothing to fail.
   */
  function cascadeInterviewOutcome(row: JobOrderPipelineCandidateEntity, failed: boolean) {
    const existing = interviewBySubmission.get(row.submissionId);
    if (!existing) return;
    if (failed) {
      if (existing.outcome !== 'FAILED') {
        updateInterview.mutate({ id: existing.id, data: { outcome: 'FAILED' } });
      }
    } else if (existing.outcome === 'FAILED') {
      updateInterview.mutate({ id: existing.id, data: { outcome: 'SCHEDULED' } });
    }
  }

  const mutating =
    updateSubmission.isPending ||
    createInterview.isPending ||
    updateInterview.isPending ||
    createPlacement.isPending ||
    updatePlacement.isPending ||
    deletePlacement.isPending;

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
                value={pickedCandidate}
                onChange={setPickedCandidate}
                disabledIds={submittedCandidateIds}
              />
              <Button type="button" size="sm" disabled={!pickedCandidate} onClick={handleSubmitClick}>
                Submit
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
                    onShortlist={(shortlisted) => {
                      // A failed stage fails everything after it — the client
                      // saying no to an interview settles the CDD question
                      // too, so leaving the later columns blank would just be
                      // a to-do nobody can action. Both fields go in one
                      // update rather than two, so the second can't clobber
                      // the first.
                      const data: UpdateSubmissionDto = { shortlisted };
                      if (shortlisted === false) data.cddAccepted = false;
                      else if (row.cddAccepted === false) data.cddAccepted = null;
                      updateSubmission.mutate({ id: row.submissionId, data });
                      cascadeInterviewOutcome(row, shortlisted === false);
                      if (shortlisted === false) clearPlacement(row);
                    }}
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
                      // Same cascade one stage further down.
                      if (outcome === 'FAILED') {
                        clearPlacement(row);
                        updateSubmission.mutate({
                          id: row.submissionId,
                          data: { cddAccepted: false },
                        });
                      } else if (row.cddAccepted === false) {
                        updateSubmission.mutate({ id: row.submissionId, data: { cddAccepted: null } });
                      }
                    }}
                    onCdd={(next) => {
                      if (next === true) {
                        // Checking CDD Accepted directly is a shortcut through
                        // the earlier gates — backfill Shortlisted and a Passed
                        // interview (creating one if the candidate never had
                        // one) instead of requiring them ticked in order first.
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
                              interviewDate: snapToQuarterHour(new Date()).toISOString(),
                              outcome: 'PASSED',
                            },
                          });
                        }
                        createPlacement.mutate({ data: { submissionId: row.submissionId } });
                        return;
                      }
                      // Declining or clearing both mean "not placed", so the
                      // placement goes either way. Its delete endpoint undoes
                      // the candidate/job-order/client side effects the create
                      // applied, which is what makes this reversible at all.
                      clearPlacement(row);
                      updateSubmission.mutate({ id: row.submissionId, data: { cddAccepted: next } });
                    }}
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

      <ConfirmSubmitCandidateDialog
        open={confirmSubmitOpen}
        candidate={pickedCandidate}
        jobOrder={jobOrder}
        clientIndustryId={clientIndustryId}
        clientIndustry={clientIndustry}
        isSubmitting={createSubmission.isPending}
        onCancel={() => setConfirmSubmitOpen(false)}
        onConfirm={handleConfirmSubmit}
      />

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
