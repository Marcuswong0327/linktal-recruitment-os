'use client';

import * as React from 'react';
import { FileUp, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

// The uploaded object's key embeds a UUID prefix for uniqueness (see the
// API's UploadsService.buildKey) — strip it back off so the link shows the
// original filename a recruiter recognizes, not an opaque key.
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

export function filenameFromKey(key: string): string {
  const last = key.split('/').pop() ?? key;
  const decoded = decodeURIComponent(last);
  return decoded.replace(UUID_PREFIX, '');
}

// R2 stays private (see UploadsService's doc) — every view goes back through
// this same-origin path, which apps/web/src/proxy.ts rewrites to the API
// with the session's Bearer token attached, so the API can re-check the
// owning entity's read permission on every request rather than trusting a
// long-lived public URL. Exported because a stored key is also rendered as a
// link outside this component (e.g. the TOB table's ID column, which links
// to `tob.sourceFileLink`).
export function fileViewUrl(key: string): string {
  return `/api/backend/uploads/view?key=${encodeURIComponent(key)}`;
}

interface FileUploadFieldProps {
  id: string;
  /** Currently attached file's object key, or null/empty for "nothing attached". */
  value: string | null | undefined;
  /** Display name for `value`. Falls back to deriving one from the key (see filenameFromKey) when omitted — pass this when the owning record has its own filename column (e.g. Tob.fileName). */
  fileName?: string | null;
  /** Called with the new key once an upload finishes, or null on remove. `newFileName` mirrors it for callers with their own filename column. */
  onChange: (key: string | null, newFileName: string | null) => void;
  /** Performs the actual upload (a generated orval mutation, injected so this component stays backend-agnostic — same pattern as ImportDialog's `upload` prop). */
  upload: (file: File) => Promise<{ key: string; fileName: string }>;
  disabled?: boolean;
  /** Native `accept` attribute for the file picker — should mirror the API's allow-list. */
  accept?: string;
  className?: string;
}

const DEFAULT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.rtf,.txt,.csv,.eml,.msg,.png,.jpg,.jpeg,.webp,.gif';

/** Replaces a paste-a-link `UrlField`/`Input` with a real file picker that uploads to R2 (via `upload`) and stores the resulting object key. */
export function FileUploadField({
  id,
  value,
  fileName,
  onChange,
  upload,
  disabled,
  accept = DEFAULT_ACCEPT,
  className,
}: FileUploadFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later (replace, retry after error)
    if (!file) return;

    setUploading(true);
    try {
      const result = await upload(file);
      onChange(result.key, result.fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const displayName = value ? (fileName ?? filenameFromKey(value)) : null;

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        id={id}
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />
      {uploading ? (
        <div className="flex h-8 items-center gap-1.5 px-1 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          Uploading…
        </div>
      ) : value ? (
        <div className="flex items-center gap-1.5">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <a
            href={fileViewUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm hover:underline"
            title={displayName ?? undefined}
          >
            {displayName}
          </a>
          {!disabled ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Replace file"
                onClick={() => inputRef.current?.click()}
              >
                <FileUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove file"
                onClick={() => onChange(null, null)}
              >
                <X />
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          Upload file
        </Button>
      )}
    </div>
  );
}
