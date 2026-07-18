'use client';

import type { PipelineTimelineEventEntity } from '@/lib/api/generated/types';

const STAGE_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  INTERVIEWING: 'Interviewing',
  REJECTED: 'Rejected',
  PLACED: 'Placed',
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function stageLabel(stage: string | null) {
  if (!stage) return stage;
  return STAGE_LABELS[stage] ?? stage;
}

function eventLabel(event: PipelineTimelineEventEntity) {
  if (event.kind === 'SUBMITTED') return `Submitted (${stageLabel(event.newStage)})`;
  if (event.kind === 'REMOVED') return 'Removed from job order';
  if (event.kind === 'RESTORED') return 'Restored to job order';
  return `${stageLabel(event.previousStage)} → ${stageLabel(event.newStage)}`;
}

interface PipelineTimelineProps {
  events: PipelineTimelineEventEntity[] | undefined;
  isLoading?: boolean;
  /** Show which candidate each event belongs to — for the Job Order page (many candidates share one timeline). */
  showCandidate?: boolean;
  /** Show which job order each event belongs to — for the Candidate page (one candidate can be on many job orders). */
  showJobOrder?: boolean;
  emptyState?: string;
}

/**
 * Read-only stage-transition history for CandidateSubmission — no dedicated
 * write-side table backs this, it's CandidateSubmission's own generic audit
 * trail (AuditLog) reshaped server-side (see AuditService.getPipelineTimeline).
 */
export function PipelineTimeline({
  events,
  isLoading,
  showCandidate,
  showJobOrder,
  emptyState = 'No pipeline activity yet.',
}: PipelineTimelineProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyState}</p>;
  }

  return (
    <div className="flex flex-col gap-4 border-l border-border pl-4">
      {events.map((event, i) => (
        <div key={`${event.submissionId}-${i}`} className="relative flex flex-col text-sm">
          <span className="absolute top-1.5 left-[-21px] size-2 rounded-full bg-primary/60" />
          <span className="font-medium">{eventLabel(event)}</span>
          {showCandidate || showJobOrder ? (
            <span className="text-muted-foreground">
              {showCandidate ? (event.candidateName ?? 'Unknown candidate') : null}
              {showCandidate && showJobOrder ? ' · ' : null}
              {showJobOrder ? (event.jobOrderTitle ?? 'Unknown job order') : null}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground/80">
            {dateFormatter.format(new Date(event.occurredAt))} · {event.actorName ?? 'Unknown'}
          </span>
        </div>
      ))}
    </div>
  );
}
