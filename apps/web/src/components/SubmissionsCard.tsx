'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { EnumSelect } from '@/components/EnumSelect';
import { CandidateCombobox } from '@/components/CandidateCombobox';
import { JobOrderCombobox } from '@/components/JobOrderCombobox';
import { deleteWithUndo } from '@/lib/delete-with-undo';
import {
  getGetSubmissionsQueryKey,
  useCreateSubmission,
  useDeleteSubmission,
  useGetSubmissions,
  useUpdateSubmission,
} from '@/lib/api/generated/submissions/submissions';
import type {
  CandidateEntity,
  CreateSubmissionDto,
  JobOrderEntity,
  SubmissionEntity,
  UpdateSubmissionDto,
} from '@/lib/api/generated/types';

const statusOptions = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'INTERVIEWING', label: 'Interviewing' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'PLACED', label: 'Placed' },
];

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

type SubmissionsCardProps =
  | {
      /** Shows every job order this candidate is submitted to. */
      mode: 'candidate';
      candidateId: string;
      jobOrders: JobOrderEntity[];
      /** This candidate's own industry — compared against the picked job order's client industry for a non-blocking mismatch warning. */
      candidateIndustryId?: string;
      /** This candidate's own location — compared against the picked job order's location for the same warning. */
      candidateLocationId?: string;
      /** A job order carries no industry of its own (only via its client), so the caller resolves it. Its location is on the entity directly, no resolver needed. */
      jobOrderClientIndustryId?: (jobOrderId: string) => string | undefined;
      /** Also refetch e.g. the pipeline timeline, which shares the same underlying audit trail. */
      onChanged?: () => void;
    }
  | {
      /** Shows every candidate submitted to this job order. */
      mode: 'jobOrder';
      jobOrderId: string;
      candidates: CandidateEntity[];
      /** This job order's client's industry — compared against the picked candidate's industry for a non-blocking mismatch warning. */
      clientIndustryId?: string;
      /** This job order's own location — compared against the picked candidate's location for the same warning. */
      jobOrderLocationId?: string | null;
      onChanged?: () => void;
    };

/**
 * Minimal submission management — submit/move/remove — so there's a live
 * write path that actually produces Pipeline Timeline events (before this,
 * CandidateSubmission had no controller at all: nothing could create or move
 * one through the app).
 */
export function SubmissionsCard(props: SubmissionsCardProps) {
  const queryClient = useQueryClient();
  const subjectId = props.mode === 'candidate' ? props.candidateId : props.jobOrderId;

  const { data, isLoading } = useGetSubmissions(
    props.mode === 'candidate' ? { candidateId: subjectId } : { jobOrderId: subjectId },
  );
  const submissions: SubmissionEntity[] = data?.status === 200 ? data.data : [];

  const [adding, setAdding] = React.useState(false);
  const [pickerValue, setPickerValue] = React.useState('');
  const [confirmingRemove, setConfirmingRemove] = React.useState<SubmissionEntity | null>(null);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() });
    props.onChanged?.();
  }

  const createSubmission = useCreateSubmission({
    mutation: {
      // The success toast itself (plain "Submitted" vs. the industry/location
      // mismatch warning) is decided per-call in `handleAdd` — it depends on
      // the picked candidate/job order, which this hook-level callback can't
      // see. Never fire both: a second toast stacking on the first just
      // buries the warning behind a redundant "Submitted".
      onSuccess: () => {
        invalidateAll();
        setPickerValue('');
        setAdding(false);
      },
      onError: (err) => toast.error(err.message || 'Failed to submit'),
    },
  });

  const updateSubmission = useUpdateSubmission({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast.success('Stage updated');
      },
      onError: (err) => toast.error(err.message || 'Failed to update stage'),
    },
  });

  const deleteSubmission = useDeleteSubmission();

  // Non-blocking: does the picked candidate's industry and/or location differ
  // from the job order's (industry via its client; location on the job order
  // itself)? There's no gate on submitting across either — both are a
  // legitimate part of the workflow — this is purely a heads-up so whoever's
  // submitting notices and can double-check it's intentional.
  function mismatchedFields(pickedId: string): Array<'industry' | 'location'> {
    const fields: Array<'industry' | 'location'> = [];
    if (props.mode === 'jobOrder') {
      const candidate = props.candidates.find((c) => c.id === pickedId);
      if (!candidate) return fields;
      if (props.clientIndustryId && candidate.industryId !== props.clientIndustryId) fields.push('industry');
      if (props.jobOrderLocationId && candidate.locationId !== props.jobOrderLocationId) fields.push('location');
      return fields;
    }
    const jobOrder = props.jobOrders.find((j) => j.id === pickedId);
    if (!jobOrder) return fields;
    const jobOrderClientIndustryId = props.jobOrderClientIndustryId?.(pickedId);
    if (props.candidateIndustryId && jobOrderClientIndustryId && jobOrderClientIndustryId !== props.candidateIndustryId) {
      fields.push('industry');
    }
    if (props.candidateLocationId && jobOrder.locationId && jobOrder.locationId !== props.candidateLocationId) {
      fields.push('location');
    }
    return fields;
  }

  function mismatchWarning(fields: Array<'industry' | 'location'>): string {
    const label = fields.length === 2 ? 'industry and location' : fields[0];
    return `This candidate's ${label} doesn't match the job order's — still fine to submit, just a heads-up to double-check the fit.`;
  }

  function handleAdd() {
    if (!pickerValue) return;
    const data: CreateSubmissionDto =
      props.mode === 'candidate'
        ? { candidateId: subjectId, jobOrderId: pickerValue }
        : { candidateId: pickerValue, jobOrderId: subjectId };
    const mismatches = mismatchedFields(pickerValue);
    createSubmission.mutate(
      { data },
      {
        onSuccess: () => {
          if (mismatches.length > 0) {
            toast.warning(mismatchWarning(mismatches));
          } else {
            toast.success('Submitted');
          }
        },
      },
    );
  }

  function handleRemove(submission: SubmissionEntity) {
    setConfirmingRemove(null);
    const name = props.mode === 'candidate' ? (submission.jobOrderTitle ?? 'this job order') : (submission.candidateName ?? 'this candidate');
    // No restore endpoint for Submission — delayed mode: nothing is sent to
    // the server until the undo window elapses, so Undo is exact.
    deleteWithUndo({
      label: `submission to ${name}`,
      deleteFn: () => deleteSubmission.mutateAsync({ id: submission.id }),
      onCommitted: invalidateAll,
      onUndo: invalidateAll,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {submissions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {submissions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <Link
                  href={props.mode === 'candidate' ? `/job-orders/${s.jobOrderId}` : `/candidates/${s.candidateId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {props.mode === 'candidate' ? (s.jobOrderTitle ?? 'Unknown job order') : (s.candidateName ?? 'Unknown candidate')}
                </Link>
                <span className="text-xs text-muted-foreground">
                  Submitted {dateFormatter.format(new Date(s.submittedAt))}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <EnumSelect
                  value={s.status}
                  onValueChange={(v) =>
                    updateSubmission.mutate({ id: s.id, data: { status: v } as UpdateSubmissionDto })
                  }
                  options={statusOptions}
                  disabled={updateSubmission.isPending}
                  size="badge"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmingRemove(s)}
                  aria-label="Remove"
                  title="Remove"
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : !isLoading ? (
        <p className="text-sm text-muted-foreground">
          {props.mode === 'candidate' ? 'Not submitted to any job orders yet.' : 'No candidates submitted yet.'}
        </p>
      ) : null}

      {adding ? (
        <div className="flex items-center gap-2">
          {props.mode === 'candidate' ? (
            <JobOrderCombobox
              value={pickerValue}
              onValueChange={setPickerValue}
              jobOrders={props.jobOrders}
              className="flex-1"
            />
          ) : (
            <CandidateCombobox
              value={pickerValue}
              onValueChange={setPickerValue}
              candidates={props.candidates}
              className="flex-1"
            />
          )}
          <Button size="sm" disabled={!pickerValue || createSubmission.isPending} onClick={handleAdd}>
            Submit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setPickerValue('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus />
          {props.mode === 'candidate' ? 'Submit to a job order' : 'Submit a candidate'}
        </Button>
      )}

      <ConfirmDeleteDialog
        open={confirmingRemove !== null}
        onOpenChange={(open) => !open && setConfirmingRemove(null)}
        title="Remove submission?"
        description="You can undo this from the toast right after, or it's gone for good."
        confirmLabel="Remove"
        onConfirm={() => confirmingRemove && handleRemove(confirmingRemove)}
      />
    </div>
  );
}
