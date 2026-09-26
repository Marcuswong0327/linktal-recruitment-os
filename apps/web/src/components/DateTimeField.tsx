'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { noBrowserAutofill } from '@/lib/no-browser-autofill';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_HOUR,
  businessHourOptions,
  formatHourLabel,
  hourOptions,
  joinDateTimeParts,
  minuteOptions,
  splitDateTimeParts,
} from '@/lib/datetime';

/**
 * One datetime value, edited as a native date field plus an hour roll and a
 * minute roll.
 *
 * The time is split into two selects rather than left as
 * `<input type="datetime-local">` so the minute roll can offer *only* the
 * quarter hours. A native control's minute spinner always runs 00–59: `step`
 * constrains arrow-key stepping (and Firefox ignores it), never the list
 * itself, and it can't stop a typed `:37` either. A select with four entries
 * makes "on the quarter hour" true by construction, with nothing to correct
 * after the fact.
 *
 * Emits a UTC ISO string, or null once the date is cleared. Picking a date
 * before any time defaults to {@link DEFAULT_HOUR}:00 rather than withholding
 * the change — callers here save on change, so a date-only selection would
 * otherwise never commit.
 */
export function DateTimeField({
  value,
  onChange,
  disabled,
  size = 'default',
  layout = 'inline',
  hourMode = '24h',
  className,
  dateClassName,
  dateAriaLabel = 'Date',
  hourAriaLabel = 'Hour',
  minuteAriaLabel = 'Minute',
  dateId,
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  size?: 'sm' | 'default';
  /** `stacked` puts the date on its own row above the hour:minute rolls. */
  layout?: 'inline' | 'stacked';
  /**
   * `business12h` offers 6 AM–9 PM with AM/PM labels (values still 24h `HH`).
   * Legacy hours outside that window are appended so an existing value still
   * appears selected.
   */
  hourMode?: '24h' | 'business12h';
  className?: string;
  dateClassName?: string;
  dateAriaLabel?: string;
  hourAriaLabel?: string;
  minuteAriaLabel?: string;
  dateId?: string;
}) {
  const { date, hour, minute } = splitDateTimeParts(value);
  const isSm = size === 'sm';
  // Without a date there's nothing to hang a time on — picking one first would
  // silently emit a timestamp for today.
  const timeDisabled = disabled || !date;

  const hourRollOptions = React.useMemo(() => {
    if (hourMode !== 'business12h') {
      return hourOptions.map((h) => ({ value: h, label: h }));
    }
    const base = businessHourOptions.map((h) => ({
      value: h,
      label: formatHourLabel(h),
    }));
    // Keep a legacy out-of-window hour selectable so the roll doesn't go blank.
    if (hour && !businessHourOptions.includes(hour)) {
      return [...base, { value: hour, label: formatHourLabel(hour) }];
    }
    return base;
  }, [hourMode, hour]);

  function emit(nextDate: string, nextHour: string, nextMinute: string) {
    onChange(joinDateTimeParts(nextDate, nextHour, nextMinute));
  }

  return (
    <div
      className={cn(
        layout === 'stacked' ? 'flex flex-col items-start gap-1' : 'flex items-center gap-1.5',
        className,
      )}
    >
      <input
        id={dateId}
        type="date"
        aria-label={dateAriaLabel}
        value={date}
        onChange={(e) => emit(e.target.value, hour || DEFAULT_HOUR, minute || '00')}
        disabled={disabled}
        {...noBrowserAutofill}
        className={cn(dateInputClass, isSm && dateInputSmClass, dateClassName)}
      />
      <div className="flex items-center gap-0.5">
        <TimeRoll
          value={hour}
          options={hourRollOptions}
          onValueChange={(v) => emit(date, v, minute || '00')}
          disabled={timeDisabled}
          ariaLabel={hourAriaLabel}
          isSm={isSm}
          wide={hourMode === 'business12h'}
        />
        <span className={cn('text-muted-foreground', isSm ? 'text-xs' : 'text-sm')}>:</span>
        <TimeRoll
          value={minute}
          options={minuteOptions.map((m) => ({ value: m, label: m }))}
          onValueChange={(v) => emit(date, hour || DEFAULT_HOUR, v)}
          disabled={timeDisabled}
          ariaLabel={minuteAriaLabel}
          isSm={isSm}
        />
      </div>
    </div>
  );
}

function TimeRoll({
  value,
  options,
  onValueChange,
  disabled,
  ariaLabel,
  isSm,
  wide = false,
}: {
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  isSm: boolean;
  /** Wider trigger for AM/PM hour labels (`6 AM`). */
  wide?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as string)} disabled={disabled}>
      <SelectTrigger
        size={isSm ? 'sm' : 'default'}
        aria-label={ariaLabel}
        className={cn(
          'tabular-nums',
          isSm ? 'px-1.5 text-xs' : null,
          wide ? (isSm ? 'w-[4.5rem]' : 'w-20') : isSm ? 'w-14' : 'w-16',
        )}
      >
        <SelectValue placeholder="--">
          {value
            ? (options.find((o) => o.value === value)?.label ?? value)
            : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-0">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="tabular-nums">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const dateInputClass =
  'rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 h-8 w-36';

/** Table-cell density — matches the h-7/text-xs controls the pipeline row uses. */
const dateInputSmClass = 'h-7 w-32 px-1.5 text-xs';
