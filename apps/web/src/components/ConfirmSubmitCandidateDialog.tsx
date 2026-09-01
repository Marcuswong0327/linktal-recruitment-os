'use client';

import { AlertTriangle, ArrowDown, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CandidateEntity, JobOrderEntity } from '@/lib/api/generated/types';
import { candidateFullName } from '@/features/candidates/schema';

interface ConfirmSubmitCandidateDialogProps {
  open: boolean;
  /**
   * Held separately from `open` on purpose: the dialog animates out over
   * ~150ms, and clearing the candidate at the same moment blanks the recap
   * mid-animation.
   */
  candidate: CandidateEntity | null;
  jobOrder: Pick<JobOrderEntity, 'jobTitle' | 'displayId' | 'locationId' | 'location'>;
  /** The job order's client's industry — heads-up only, never a gate. */
  clientIndustryId?: string | null;
  clientIndustry?: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The "are you sure?" step before a candidate is added to a job order's
 * pipeline.
 *
 * Submitting isn't destructive, so this isn't `ConfirmDeleteDialog` — but it
 * also isn't free: it writes a row, and undoing it means finding and removing
 * that row afterwards. The dialog earns its place by restating *which* person
 * is about to go to *which* job order, which the picker alone can't (two
 * candidates often share a name).
 *
 * It's also where the industry/location mismatch is surfaced. That warning
 * used to fire as a toast after the submission already existed, at which point
 * the only remedy was to delete what you'd just created; here it's still
 * actionable. It never blocks — submitting across industry or location is a
 * legitimate part of the workflow.
 */
export function ConfirmSubmitCandidateDialog({
  open,
  candidate,
  jobOrder,
  clientIndustryId,
  clientIndustry,
  isSubmitting,
  onCancel,
  onConfirm,
}: ConfirmSubmitCandidateDialogProps) {
  const industryMismatch = !!clientIndustryId && !!candidate && candidate.industryId !== clientIndustryId;
  const locationMismatch = !!jobOrder.locationId && !!candidate && candidate.locationId !== jobOrder.locationId;
  const mismatch = industryMismatch || locationMismatch;
  const name = candidate ? candidateFullName(candidate) || 'Unnamed candidate' : 'This candidate';
  const candidateMeta = [candidate?.jobRoleType ?? candidate?.currentRole ?? candidate?.industry, candidate?.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader
          icon={mismatch ? AlertTriangle : UserPlus}
          iconVariant={mismatch ? 'warning' : 'default'}
        >
          {/* The name lives in the card below, not here — repeating it in the
              title just reads as duplication. */}
          <AlertDialogTitle>Submit candidate?</AlertDialogTitle>
          <AlertDialogDescription>
            They&rsquo;re added to the pipeline straight away. You can remove them again from the table.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Two cards rather than label/value rows: a long job title has room to
            wrap instead of truncating, and no label column means nothing
            reflows into "Job / order" when the value beside it is wide. */}
        <div className="mt-5 flex flex-col gap-1.5">
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{name}</span>
              {candidate ? (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {candidate.displayId}
                </span>
              ) : null}
            </div>
            {candidateMeta ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{candidateMeta}</p>
            ) : null}
          </div>

          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <ArrowDown className="size-3.5 shrink-0" />
            submitting to
          </p>

          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <p className="font-medium">{jobOrder.jobTitle ?? 'Untitled role'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span className="font-mono">{jobOrder.displayId}</span>
              {jobOrder.location ? ` · ${jobOrder.location}` : null}
            </p>
          </div>
        </div>

        {/* Amber carries the signal via the border and icon; the text stays
            `foreground`. `text-warning-foreground` is the on-solid-fill token
            (near-black in *both* themes) and would be unreadable over this 10%
            tint on a dark popover. */}
        {mismatch ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              {mismatchCopy(industryMismatch, locationMismatch, clientIndustry, jobOrder.location)} Still
              fine to submit &mdash; just worth a look.
            </span>
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction: that primitive is a Close,
              so it would dismiss the dialog on click — the pending state would
              never be seen and an error would surface with the dialog already
              gone. It also defaults to the destructive variant. */}
          <Button size="lg" disabled={isSubmitting || !candidate} onClick={onConfirm}>
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function mismatchCopy(
  industry: boolean,
  location: boolean,
  clientIndustry?: string | null,
  jobOrderLocation?: string | null,
): string {
  if (industry && location) {
    return "This candidate's industry and location both differ from the job order's.";
  }
  if (industry) {
    return clientIndustry
      ? `This candidate isn't in ${clientIndustry}, the client's industry.`
      : "This candidate's industry differs from the client's.";
  }
  return jobOrderLocation
    ? `This candidate isn't in ${jobOrderLocation}, the job order's location.`
    : "This candidate's location differs from the job order's.";
}
