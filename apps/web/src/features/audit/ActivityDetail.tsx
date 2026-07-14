'use client';

import { ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  type AuditLog,
  auditActionLabels,
  auditActionVariants,
  changeRows,
  describeAction,
  metadataRows,
  requestIdOf,
} from './schema';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Side sheet showing one audit entry in plain language (no raw JSON). */
export function ActivityDetail({ entry, onClose }: { entry: AuditLog | null; onClose: () => void }) {
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {entry && <Body entry={entry} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ entry }: { entry: AuditLog }) {
  const sentence = describeAction(entry.action);
  const rows = changeRows(entry.changes);
  const meta = metadataRows(entry.metadata);
  const requestId = requestIdOf(entry.metadata);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Badge variant={auditActionVariants[entry.action] ?? 'secondary'}>
            {auditActionLabels[entry.action] ?? entry.action}
          </Badge>
          <span>{entry.entityType}</span>
        </SheetTitle>
        <SheetDescription>{entry.entityLabel ?? entry.entityId}</SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-6 text-sm">
        <Field label="When" value={dateFormatter.format(new Date(entry.createdAt))} />
        <Field label="Who" value={entry.actorName ?? entry.actorId ?? 'System'} />

        <div className="flex flex-col gap-1.5">
          <SectionLabel>What happened</SectionLabel>
          {sentence && <p className="text-muted-foreground">{sentence}</p>}
          {rows.length > 0 && (
            <div className="divide-y rounded-md border">
              {rows.map((r) => (
                <div key={r.field} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-32 shrink-0 font-medium text-foreground">{r.field}</span>
                  {r.from === null ? (
                    <span className="truncate">{r.to}</span>
                  ) : (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-muted-foreground line-through">{r.from}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.to}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!sentence && rows.length === 0 && <span className="text-muted-foreground">—</span>}
        </div>

        {meta.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Details</SectionLabel>
            {meta.map((m) => (
              <Field key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        )}

        {/* De-emphasised technical refs, for support/debugging only. */}
        <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          <div className="break-all">
            Entity ID: <span className="font-mono">{entry.entityId}</span>
          </div>
          {requestId && (
            <div className="break-all">
              Reference: <span className="font-mono">{requestId}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium uppercase text-muted-foreground">{children}</span>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel>{label}</SectionLabel>
      <span>{value}</span>
    </div>
  );
}
