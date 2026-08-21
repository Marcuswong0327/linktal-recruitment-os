'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { downloadFile } from '@/lib/api/fetcher';
import type { ImportResultEntity } from '@/lib/api/generated/types';

type Stage = 'pick' | 'checking' | 'errors' | 'ready' | 'committing';

interface ImportDialogProps {
  /** Plural, e.g. "Companies" — used in the dialog title and toasts. */
  entityLabel: string;
  /** From the generated client, e.g. getGetClientImportTemplateUrl(). */
  templateUrl: string;
  /** The generated mutation's async call, e.g. (file, commit) => importClients({ data: { file, commit } }).then(r => r.data) — every entity's import endpoint returns the same ImportResultEntity shape, so one dialog covers all four. */
  upload: (file: File, commit: boolean) => Promise<ImportResultEntity>;
  /** Called once after a real commit succeeds — the caller invalidates its own list query. */
  onImported: () => void;
}

/**
 * Shared by every entity's table (Companies/Stakeholders/Candidates/Job
 * Orders) — one implementation rather than four, since the flow, the
 * preview/commit two-step, and the error-table shape are identical; only
 * `upload`/`templateUrl` differ per entity. Flow: pick a file → "Check file"
 * previews it (commit=false — nothing is written yet); a clean preview shows
 * a summary and a confirm step that re-uploads the same file with
 * commit=true. See ImportResultEntity's doc: the whole file is all-or-
 * nothing, so a clean preview and its commit either both succeed or (on a
 * rare race) both come back with the same error shape.
 */
export function ImportDialog({ entityLabel, templateUrl, upload, onImported }: ImportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [stage, setStage] = React.useState<Stage>('pick');
  const [result, setResult] = React.useState<ImportResultEntity | null>(null);

  function reset() {
    setFile(null);
    setStage('pick');
    setResult(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleDownloadTemplate() {
    try {
      await downloadFile(templateUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download template');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setStage('pick');
  }

  async function handleCheck() {
    if (!file) return;
    setStage('checking');
    try {
      const res = await upload(file, false);
      setResult(res);
      setStage(res.errors.length > 0 ? 'errors' : 'ready');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check file');
      setStage('pick');
    }
  }

  async function handleCommit() {
    if (!file) return;
    setStage('committing');
    try {
      const res = await upload(file, true);
      if (res.committed) {
        toast.success(`Imported: ${res.insertCount} new, ${res.updateCount} updated`);
        handleOpenChange(false);
        onImported();
      } else {
        // Shouldn't normally happen (the file just validated cleanly a
        // moment ago) — defensive handling for something changing
        // in-between (e.g. a catalog entry deleted by someone else).
        setResult(res);
        setStage(res.errors.length > 0 ? 'errors' : 'ready');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setStage('ready');
    }
  }

  const busy = stage === 'checking' || stage === 'committing';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="lg" variant="outline">
            <Upload />
            Import
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {entityLabel}</DialogTitle>
          <DialogDescription>
            Adding new {entityLabel.toLowerCase()}? Download the template below, leave the Display ID column blank
            on every row, fill in the rest, and upload it here. Updating existing ones instead? Don&apos;t use this
            template — use &quot;Export to Excel&quot; on the main page to download your current data (it already
            has each row&apos;s Display ID filled in), edit values there, and upload that file here instead. A
            filled-in Display ID always matches that exact existing record, and every other column becomes its
            complete new state — so an optional column left blank on an update row clears it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={handleDownloadTemplate}>
            <Download />
            Download template
          </Button>

          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            disabled={busy}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-50"
          />

          {stage === 'errors' && result ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {result.errors.length} issue{result.errors.length === 1 ? '' : 's'} found — nothing was imported.
                Fix these in the file and re-upload.
              </p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Column</th>
                      <th className="px-3 py-2 font-medium">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums">{e.row}</td>
                        <td className="px-3 py-2">{e.column}</td>
                        <td className="px-3 py-2">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {stage === 'ready' && result ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4 shrink-0" />
              Looks good — {result.insertCount} new, {result.updateCount} updated. Confirm to import.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {stage === 'ready' || stage === 'committing' ? (
            <Button type="button" onClick={handleCommit} disabled={busy}>
              {stage === 'committing' ? 'Importing…' : 'Confirm import'}
            </Button>
          ) : (
            <Button type="button" onClick={handleCheck} disabled={!file || busy}>
              {stage === 'checking' ? 'Checking…' : 'Check file'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
