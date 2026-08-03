'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export interface TagOption {
  label: string;
  value: string;
}

// Fixed-order categorical palette (--tag-1..8 in globals.css) — NOT the
// Badge status variants (success/warning/info/destructive). Those are
// reserved, meaning-bearing tokens; rotating arbitrary tags through them
// made unrelated tags look like states. Written out literally (not built
// from a template string) so Tailwind's scanner picks up every class.
const TAG_CLASSES = [
  'border-transparent bg-tag-1/12 text-tag-1',
  'border-transparent bg-tag-2/12 text-tag-2',
  'border-transparent bg-tag-3/12 text-tag-3',
  'border-transparent bg-tag-4/12 text-tag-4',
  'border-transparent bg-tag-5/12 text-tag-5',
  'border-transparent bg-tag-6/12 text-tag-6',
  'border-transparent bg-tag-7/12 text-tag-7',
  'border-transparent bg-tag-8/12 text-tag-8',
] as const;

/**
 * Deterministic color per tag id, Notion-style: the same tag is always the
 * same color everywhere it appears, with nothing to persist or configure.
 * Collisions are expected past 8 distinct tags (e.g. the ~774-row
 * Specialization catalog) — the palette is capped at 8 hues because more
 * than that stops being reliably distinguishable (see the dataviz skill).
 */
function colorFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return TAG_CLASSES[Math.abs(hash) % TAG_CLASSES.length];
}

/** Static, non-interactive pills — same coloring as the editable picker below. Nothing at all when empty. */
export function TagPills({ options, selected }: { options: TagOption[]; selected: string[] }) {
  if (selected.length === 0) return null;
  const byId = new Map(options.map((o) => [o.value, o.label]));
  return (
    <div className="flex flex-wrap gap-1">
      {selected.map((value) => (
        <Badge key={value} className={cn('rounded-md font-normal', colorFor(value))}>
          {byId.get(value) ?? value}
        </Badge>
      ))}
    </div>
  );
}

interface TagMultiSelectProps {
  title: string;
  options: TagOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  triggerClassName?: string;
}

/**
 * Notion-style multi-select property. Closed state shows nothing but the
 * selected tags (each with its own X to remove it directly) — a true-empty
 * cell when there's nothing selected, not a placeholder. Opening it reveals
 * a search box ("Search for an option…"), a separator, then the catalog:
 * clicking a row there toggles it on/off, same as any other Combobox list.
 */
export function TagMultiSelect({
  title,
  options,
  selected,
  onChange,
  disabled = false,
  triggerClassName,
}: TagMultiSelectProps) {
  const byId = React.useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const items = React.useMemo(() => options.map((o) => o.value), [options]);
  const [open, setOpen] = React.useState(false);

  function remove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  return (
    <Combobox.Root
      items={items}
      multiple
      value={selected}
      onValueChange={(next) => onChange(next)}
      itemToStringLabel={(value) => byId.get(value) ?? value}
      itemToStringValue={(value) => value}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      {/* Absolutely positioned against TableCell (`relative`, no offsets of
          its own) — spans the true cell box regardless of how the wrapper
          divs/measurement spans in between happen to size themselves, which
          percentage width/height didn't reliably do. Sits *behind* Trigger
          below (which is now `relative`, so it's positioned too and — being
          later in the DOM — stacks above this): only the cell's empty margin
          around the chips falls through to this, so a chip's own X still
          gets first claim on a click landing on it. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'absolute inset-0 rounded-md outline-none transition-colors hover:bg-accent/50 disabled:pointer-events-none',
          open && 'bg-accent/50',
        )}
      />
      <Combobox.Trigger
        aria-label={selected.length === 0 ? `Add ${title.toLowerCase()}` : undefined}
        className={cn(
          'relative inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-transparent px-1 py-0.5 text-left outline-none transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50',
          triggerClassName,
        )}
      >
        {selected.map((value) => (
          <Badge key={value} className={cn('gap-1 rounded-md pr-1 font-normal', colorFor(value))}>
            {byId.get(value) ?? value}
            {!disabled ? (
              // A <button> here would nest inside Combobox.Trigger's own
              // <button> — invalid HTML. The browser silently auto-closes
              // the outer button as soon as it parses the inner one, so the
              // real DOM (and everything hydration attaches to) ends up
              // nothing like what React thinks it rendered. role="button" +
              // manual key handling gets the same semantics without nesting
              // interactive elements.
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${byId.get(value) ?? value}`}
                // Trigger opens on bubble-phase click — stopping it here
                // keeps "remove this tag" from also opening the picker.
                onClick={(e) => {
                  e.stopPropagation();
                  remove(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(value);
                  }
                }}
                className="cursor-pointer rounded-full opacity-70 outline-none hover:opacity-100"
              >
                <X className="size-3" />
              </span>
            ) : null}
          </Badge>
        ))}
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner align="start" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-64 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:ring-foreground/10">
            <div className="p-1.5">
              <Combobox.Input
                placeholder="Search for an option…"
                className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Separator />
            {/* Darker than the search area above, so the catalog reads as its
                own region — a flat black/white wash works in both modes,
                unlike a semantic token (muted is *lighter* than popover in
                dark mode, the wrong direction here). */}
            <div className="bg-black/5 dark:bg-black/20">
              {/* Empty stays mounted even with matches (base-ui requires it,
                  for screen-reader announcements) — its *children* are what
                  actually disappear then, so the padding has to live on a
                  child too. Padding directly on Empty itself reserved space
                  even with nothing in it: a permanent ~24px gap between the
                  separator and the first real row. */}
              <Combobox.Empty className="text-sm text-muted-foreground">
                <p className="px-3 py-3 text-center">No matches.</p>
              </Combobox.Empty>
              <Combobox.List className="max-h-64 overflow-y-auto p-1">
                {(value: string) => (
                  <Combobox.Item
                    key={value}
                    value={value}
                    className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Badge className={cn('rounded-md font-normal', colorFor(value))}>
                      {byId.get(value) ?? value}
                    </Badge>
                    <Combobox.ItemIndicator className="ml-auto shrink-0">
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
