'use client';

import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export interface TagOption {
  label: string;
  value: string;
  /**
   * Groups this tag's color with its ancestors/descendants instead of its
   * own id — e.g. a Specialization's root category, so "Food" and
   * "Food - Bakery" render the same color. Defaults to `value` (its own
   * color) when omitted, which is correct for anything without a hierarchy.
   */
  colorKey?: string;
}

const CREATE_SENTINEL = '__create__';

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
  const byId = new Map(options.map((o) => [o.value, o]));
  return (
    <div className="flex flex-wrap gap-1">
      {selected.map((value) => {
        const option = byId.get(value);
        return (
          <Badge
            key={value}
            className={cn('rounded-md font-normal', colorFor(option?.colorKey ?? value))}
          >
            {option?.label ?? value}
          </Badge>
        );
      })}
    </div>
  );
}

interface TagMultiSelectProps {
  title: string;
  options: TagOption[];
  /**
   * Subset of `options` offered in the dropdown to pick from — e.g.
   * Specializations narrowed to whichever Industries a consultant already
   * holds. `options` itself still resolves the label/color for anything
   * already `selected`, so a value that's no longer selectable (its parent
   * industry got dropped) still renders correctly as a chip and can still be
   * removed — it just can't be picked again. Defaults to `options` when
   * omitted, i.e. everything is selectable.
   */
  selectableOptions?: TagOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  triggerClassName?: string;
  /**
   * Offers `+ Create "<name>"` when the typed text matches no existing
   * option — must persist it and return the created (or already-existing)
   * row, same contract as `CreatableCombobox`'s `onCreate`. Omit to disable
   * inline creation and keep this a plain picker over a fixed catalog.
   */
  onCreate?: (name: string) => Promise<TagOption>;
  /**
   * Per-tag "…" menu for managing the underlying catalog row itself — not
   * just this field's selection. Each action is independently optional, so
   * e.g. an update-only caller can show Edit without Delete. Omit entirely
   * to keep tags plain (no menu, no restyle).
   */
  tagActions?: {
    onEdit?: (option: TagOption) => void;
    onDelete?: (option: TagOption) => void;
  };
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
  selectableOptions,
  selected,
  onChange,
  disabled = false,
  triggerClassName,
  onCreate,
  tagActions,
}: TagMultiSelectProps) {
  // Rows created through this picker before `options`/`selectableOptions`
  // (owned by the caller's own query) has refetched to include them — merged
  // in so the new tag renders with its real name immediately instead of a
  // bare id.
  const [justCreated, setJustCreated] = React.useState<TagOption[]>([]);
  const allOptions = React.useMemo(() => {
    const pending = justCreated.filter((jc) => !options.some((o) => o.value === jc.value));
    return pending.length ? [...options, ...pending] : options;
  }, [options, justCreated]);
  const byId = React.useMemo(() => new Map(allOptions.map((o) => [o.value, o])), [allOptions]);

  // What the dropdown actually offers to pick — narrower than `allOptions`
  // when the caller passes `selectableOptions`; `byId` above (built from the
  // full `options`) is what resolves a selected chip's label regardless.
  const catalog = selectableOptions ?? options;
  const allSelectable = React.useMemo(() => {
    const pending = justCreated.filter((jc) => !catalog.some((o) => o.value === jc.value));
    return pending.length ? [...catalog, ...pending] : catalog;
  }, [catalog, justCreated]);

  const [open, setOpen] = React.useState(false);
  // The popup's own search text — separate from the closed trigger's tags,
  // and reset each time the popup opens so it always starts as a fresh
  // search. Controlled (rather than left to Combobox's own filtering) so a
  // "+ Create" row can be appended after the real matches.
  const [inputValue, setInputValue] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const trimmed = inputValue.trim();
  const hasExactMatch = allSelectable.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const filtered = trimmed
    ? allSelectable.filter((o) => o.label.toLowerCase().includes(trimmed.toLowerCase()))
    : allSelectable;
  const items =
    onCreate && trimmed && !hasExactMatch
      ? [...filtered.map((o) => o.value), CREATE_SENTINEL]
      : filtered.map((o) => o.value);

  function remove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  async function handleValueChange(next: string[]) {
    if (next.includes(CREATE_SENTINEL)) {
      const name = trimmed;
      if (!name || !onCreate) return;
      setCreating(true);
      try {
        const created = await onCreate(name);
        setJustCreated((prev) => [...prev, created]);
        onChange([...selected.filter((v) => v !== CREATE_SENTINEL), created.value]);
        setInputValue('');
      } catch {
        // Caller's own mutation already surfaces the error (toast); just
        // stop treating this as in flight so the user can retry.
      } finally {
        setCreating(false);
      }
      return;
    }
    onChange(next);
  }

  return (
    <Combobox.Root
      items={items}
      filter={null} // items are already filtered against inputValue above
      multiple
      value={selected}
      onValueChange={handleValueChange}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={(value: string) => byId.get(value)?.label ?? value}
      itemToStringValue={(value: string) => value}
      disabled={disabled || creating}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setInputValue('');
      }}
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
        {selected.map((value) => {
          const option = byId.get(value) ?? { value, label: value };
          return (
            <Badge
              key={value}
              className={cn(
                'gap-1 rounded-md pr-1 font-normal',
                colorFor(option.colorKey ?? value),
              )}
            >
              {option.label}
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
                  aria-label={`Remove ${option.label}`}
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
          );
        })}
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
                <p className="px-3 py-3 text-center">
                  {onCreate ? 'No matches — keep typing to add a new value.' : 'No matches.'}
                </p>
              </Combobox.Empty>
              <Combobox.List className="max-h-64 overflow-y-auto p-1">
                {(value: string) => {
                  const isCreate = value === CREATE_SENTINEL;
                  if (isCreate) {
                    return (
                      <Combobox.Item
                        key={value}
                        value={value}
                        className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      >
                        <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          Create &quot;{trimmed}&quot;
                        </span>
                      </Combobox.Item>
                    );
                  }
                  const listOption = byId.get(value);
                  const hasTagMenu = tagActions?.onEdit || tagActions?.onDelete;
                  return (
                    <Combobox.Item
                      key={value}
                      value={value}
                      className="flex min-h-9 cursor-default items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      {/* No selected-state checkmark here — the trigger's own
                          chips above already show what's selected. */}
                      <Badge
                        className={cn(
                          'rounded-md font-normal',
                          colorFor(listOption?.colorKey ?? value),
                        )}
                      >
                        {listOption?.label ?? value}
                      </Badge>
                      {hasTagMenu ? (
                        // Direct icon buttons, not a dropdown — a Menu popup
                        // nested inside this Combobox's own popup fights it
                        // for outside-click/dismiss handling (two floating
                        // layers, each deciding independently whether a click
                        // landed "outside" itself), so the menu could open
                        // and immediately get dismissed before a click on it
                        // registered. Lives on the catalog row here, not the
                        // trigger's selected chip (which only has the X to
                        // remove it from this field) — separate targets so
                        // there's no fat-finger conflict between "remove from
                        // selection" and "manage the underlying row".
                        <span className="ml-auto flex shrink-0 items-center gap-0.5">
                          {tagActions?.onEdit ? (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Edit ${listOption?.label ?? value}`}
                              // Item selection also fires on click — stop it
                              // here so this doesn't also toggle the row
                              // in/out of the selection.
                              onClick={(e) => {
                                e.stopPropagation();
                                tagActions.onEdit!(listOption ?? { value, label: value });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  tagActions.onEdit!(listOption ?? { value, label: value });
                                }
                              }}
                              className="cursor-pointer rounded-full p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
                            >
                              <Pencil className="size-3.5" />
                            </span>
                          ) : null}
                          {tagActions?.onDelete ? (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Delete ${listOption?.label ?? value}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                tagActions.onDelete!(listOption ?? { value, label: value });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  tagActions.onDelete!(listOption ?? { value, label: value });
                                }
                              }}
                              className="cursor-pointer rounded-full p-1 text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
