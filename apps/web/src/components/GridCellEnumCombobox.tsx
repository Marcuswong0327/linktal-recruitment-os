'use client';

import * as React from 'react';

import { GridCellCombobox } from '@/components/GridCellCombobox';

export interface EnumChoice {
  value: string;
  label: string;
}

interface GridCellEnumComboboxProps {
  id?: string;
  /** Selected option's `value` — '' for none. */
  value: string;
  onValueChange: (value: string) => void;
  options: EnumChoice[];
  disabled?: boolean;
  placeholder?: string;
}

/**
 * A fixed set of choices as a type-first cell — "act" then Enter picks Active.
 *
 * A `Select` would be the obvious control for an enum, and is what the saved
 * rows use. In the new row it's the wrong one: it can only be opened, not
 * typed into, so tabbing across the row hits a full stop at every enum column
 * and the keyboard-only pass that the rest of the row supports breaks down.
 *
 * The trade is that a chosen value shows as plain text here rather than the
 * colour-coded pill the saved row renders. That only lasts until the row is
 * committed, and it buys a row you can fill without reaching for the mouse.
 */
export function GridCellEnumCombobox({
  id,
  value,
  onValueChange,
  options,
  disabled,
  placeholder,
}: GridCellEnumComboboxProps) {
  // GridCellCombobox works in {id, name}; an enum's own wire value is its id.
  const asOptions = React.useMemo(
    () => options.map((o) => ({ id: o.value, name: o.label })),
    [options],
  );

  return (
    <GridCellCombobox
      id={id}
      value={value}
      onValueChange={onValueChange}
      options={asOptions}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}
