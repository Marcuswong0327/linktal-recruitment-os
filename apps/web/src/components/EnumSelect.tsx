'use client';

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
}

interface EnumSelectProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: EnumSelectOption[];
  placeholder?: string;
}

/** Thin wrapper over the Select primitive for fixed enum choices. */
export function EnumSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
}: EnumSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as string)}>
      <SelectTrigger id={id} className="w-full">
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
