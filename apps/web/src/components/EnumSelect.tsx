'use client';

import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface EnumSelectOption {
  value: string;
  label: string;
  /** Applied to the trigger when this option is selected — e.g. semantic color tokens. */
  triggerClassName?: string;
}

interface EnumSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: EnumSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Overrides the trigger's default `w-full` sizing — e.g. `w-fit` for a compact, centered table cell. */
  className?: string;
}

/** Thin wrapper over the Select primitive for fixed enum choices. */
export function EnumSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: EnumSelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as string)} disabled={disabled}>
      <SelectTrigger id={id} className={cn('w-full', className, selected?.triggerClassName)}>
        <SelectValue placeholder={placeholder}>
          {(current: string) =>
            options.find((o) => o.value === current)?.label ?? current
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
