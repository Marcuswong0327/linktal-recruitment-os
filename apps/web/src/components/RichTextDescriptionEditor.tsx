'use client';

import * as React from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import DOMPurify from 'isomorphic-dompurify';
import {
  Columns3,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  descriptionToEditorHtml,
  isEmptyRichTextHtml,
  tableToTsv,
  toOutlookFriendlyTableHtml,
  transformOfficePastedHtml,
} from '@/components/rich-text-description';

const OfficePasteExtension = Extension.create({
  name: 'officePaste',
  transformPastedHTML(html) {
    return transformOfficePastedHtml(html);
  },
});

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
];

export function sanitizeDescriptionHtml(html: string): string {
  if (isEmptyRichTextHtml(html)) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['colspan', 'rowspan', 'colwidth'],
  });
}

type RichTextDescriptionEditorProps = {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

export function RichTextDescriptionEditor({
  id,
  value,
  onChange,
  disabled = false,
  className,
  'aria-label': ariaLabel = 'Description',
}: RichTextDescriptionEditorProps) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      TableKit.configure({
        table: { resizable: false },
      }),
      OfficePasteExtension,
    ],
    content: descriptionToEditorHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        id: id ?? '',
        'aria-label': ariaLabel,
        class: cn(
          'prose prose-sm max-w-none min-h-[20rem] px-3 py-2 outline-none focus-visible:outline-none',
          '[&_table]:w-full [&_table]:border-collapse [&_table]:overflow-x-auto',
          '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
          '[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
        ),
      },
      handleDOMEvents: {
        copy: (_view, event) => handleOutlookCopy(event),
        cut: (_view, event) => handleOutlookCopy(event),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChangeRef.current(isEmptyRichTextHtml(html) ? '' : html);
    },
  });

  // Sync external value (e.g. after save / remount key) without fighting typing.
  React.useEffect(() => {
    if (!editor) return;
    const next = descriptionToEditorHtml(value);
    const current = editor.getHTML();
    if (isEmptyRichTextHtml(value) && isEmptyRichTextHtml(current)) return;
    if (sanitizeDescriptionHtml(current) === sanitizeDescriptionHtml(next)) return;
    // Only reset when the parent value diverged (undo / remote) — skip while focused.
    if (editor.isFocused) return;
    editor.commands.setContent(next || '', { emitUpdate: false });
  }, [editor, value]);

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30',
        'focus-within:ring-2 focus-within:ring-ring/40',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <ToolbarButton
          label="Insert table"
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <Columns3 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Add row"
          disabled={disabled || !editor?.can().addRowAfter()}
          onClick={() => editor?.chain().focus().addRowAfter().run()}
        >
          <BetweenHorizontalStart className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Add column"
          disabled={disabled || !editor?.can().addColumnAfter()}
          onClick={() => editor?.chain().focus().addColumnAfter().run()}
        >
          <BetweenVerticalStart className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Delete table"
          disabled={disabled || !editor?.can().deleteTable()}
          onClick={() => editor?.chain().focus().deleteTable().run()}
        >
          <Trash2 className="size-3.5" />
        </ToolbarButton>
      </div>
      <div className="max-h-[32rem] min-h-[20rem] overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

/**
 * Outlook Classic ignores CSS classes — rewrite copied tables as inline-border
 * HTML + TSV plain text so paste keeps shape and data.
 */
function handleOutlookCopy(event: ClipboardEvent): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  // Only rewrite when the caret/selection is inside a table — don't steal
  // clipboard for ordinary paragraph copies on the same page.
  const startEl =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  const table = (startEl?.closest('table') as HTMLTableElement | null) ?? null;
  if (!table || !event.clipboardData) return false;

  const outlookHtml = toOutlookFriendlyTableHtml(table);
  const tsv = tableToTsv(table);
  event.clipboardData.setData('text/html', outlookHtml);
  event.clipboardData.setData('text/plain', tsv);
  event.preventDefault();
  return true;
}
