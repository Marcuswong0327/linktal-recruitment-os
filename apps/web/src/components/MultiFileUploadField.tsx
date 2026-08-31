'use client';

import * as React from 'react';
import { FileUp, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { fileViewUrl } from '@/components/FileUploadField';

export interface DocumentFile {
  key: string;
  fileName: string;
}

interface MultiFileUploadFieldProps {
  id: string;
  /** Currently attached files. */
  value: DocumentFile[];
  /** Called with the full updated list on every add/remove. */
  onChange: (files: DocumentFile[]) => void;
  /** Performs the actual upload (a generated orval mutation, injected so this component stays backend-agnostic — same pattern as FileUploadField's `upload` prop). */
  upload: (file: File) => Promise<{ key: string; fileName: string }>;
  disabled?: boolean;
  /** Native `accept` attribute for the file picker — should mirror the API's allow-list. */
  accept?: string;
  className?: string;
}

const DEFAULT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.rtf,.txt,.csv,.eml,.msg,.png,.jpg,.jpeg,.webp,.gif';

/** Multi-file variant of FileUploadField — an "Add file" button that appends to `value` rather than replacing a single slot, each row getting its own Replace/Remove affordance. */
export function MultiFileUploadField({
  id,
  value,
  onChange,
  upload,
  disabled,
  accept = DEFAULT_ACCEPT,
  className,
}: MultiFileUploadFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  // Index of the row being replaced, or null when the picker was opened via "Add file".
  const replaceIndexRef = React.useRef<number | null>(null);

  function openPicker(replaceIndex: number | null) {
    replaceIndexRef.current = replaceIndex;
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const replaceIndex = replaceIndexRef.current;
    setUploading(true);
    try {
      const result = await upload(file);
      const entry: DocumentFile = { key: result.key, fileName: result.fileName };
      if (replaceIndex === null) {
        onChange([...value, entry]);
      } else {
        onChange(value.map((f, i) => (i === replaceIndex ? entry : f)));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

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
      <div className="flex flex-col gap-1.5">
        {value.map((file, index) => (
          <div key={`${file.key}-${index}`} className="flex items-center gap-1.5">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <a
              href={fileViewUrl(file.key)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-sm hover:underline"
              title={file.fileName}
            >
              {file.fileName}
            </a>
            {!disabled ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Replace file"
                  onClick={() => openPicker(index)}
                >
                  <FileUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove file"
                  onClick={() => handleRemove(index)}
                >
                  <X />
                </Button>
              </>
            ) : null}
          </div>
        ))}
        {uploading ? (
          <div className="flex h-8 items-center gap-1.5 px-1 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            Uploading…
          </div>
        ) : !disabled ? (
          <Button type="button" variant="outline" size="sm" onClick={() => openPicker(null)}>
            <Upload />
            Add file
          </Button>
        ) : value.length === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : null}
      </div>
    </div>
  );
}
