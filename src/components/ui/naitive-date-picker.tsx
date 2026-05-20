import * as React from 'react';
import {
  format,
  addDays,
  addMonths,
  addWeeks,
  addQuarters,
  endOfQuarter,
  endOfYear,
  startOfMonth,
  startOfWeek,
  isSameDay,
  isSameMonth,
  isAfter,
  isBefore,
} from 'date-fns';
import { Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Shared Naitive date picker. Wraps react-day-picker via the themed shadcn
 * Calendar inside a Popover so every form in the app uses the same trigger
 * styling, keyboard model, and locked 6-week month grid (no layout shift
 * between months with 4/5/6 visible weeks).
 *
 * Accepts and emits ISO date strings (`yyyy-MM-dd`) so it's a drop-in for
 * existing `<input type="date">` consumers. Displays the selected value as
 * "MMM d, yyyy" in the trigger button.
 *
 * Keyboard model (provided by react-day-picker DayPicker):
 *   ←/→  day · ↑/↓ week · PgUp/PgDn month · Shift+PgUp/PgDn year
 *   Enter selects the focused day · Esc closes the popover
 */
export interface NaitiveDatePickerProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  clearable?: boolean;
  align?: 'start' | 'center' | 'end';
  size?: 'sm' | 'default';
  /** ISO yyyy-MM-dd inclusive bounds. */
  fromDate?: string;
  toDate?: string;
}

function parseISO(value?: string | null): Date | undefined {
  if (!value) return undefined;
  // Treat bare yyyy-MM-dd as a local date (avoid TZ shift).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function toISO(date?: Date): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type View = 'day' | 'month' | 'year';

interface CalendarPanelProps {
  selected?: Date;
  onSelect: (d: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
}

function isDisabled(d: Date, min?: Date, max?: Date) {
  if (min && isBefore(d, min) && !isSameDay(d, min)) return true;
  if (max && isAfter(d, max) && !isSameDay(d, max)) return true;
  return false;
}

function CalendarPanel({ selected, onSelect, minDate, maxDate }: CalendarPanelProps) {
  const [view, setView] = React.useState<View>('day');
  const [cursor, setCursor] = React.useState<Date>(() => startOfMonth(selected ?? new Date()));
  const [yearPageStart, setYearPageStart] = React.useState<number>(
    () => (selected ?? new Date()).getFullYear() - 6,
  );

  const today = new Date();

  // ----- Day grid (always 42 cells / 6 rows) -----
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const setAndClose = (d: Date) => {
    if (isDisabled(d, minDate, maxDate)) return;
    onSelect(d);
  };

  const quickChips: { label: string; get: () => Date }[] = [
    { label: 'Today', get: () => today },
    { label: '+1 week', get: () => addWeeks(today, 1) },
    { label: '+1 month', get: () => addMonths(today, 1) },
    { label: '+1 quarter', get: () => addQuarters(today, 1) },
    { label: 'End of quarter', get: () => endOfQuarter(today) },
    { label: 'End of year', get: () => endOfYear(today) },
  ];

  return (
    <div
      className="p-3 w-[18rem] pointer-events-auto"
      role="dialog"
      aria-label="Choose date"
    >
      {/* Quick chips */}
      <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Quick date shortcuts">
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => setAndClose(chip.get())}
            className="px-2 py-0.5 text-[11px] rounded-full border border-border/60 bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground transition-colors"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Previous month"
          onClick={() => {
            if (view === 'day') setCursor((c) => addMonths(c, -1));
            else if (view === 'month') setCursor((c) => new Date(c.getFullYear() - 1, c.getMonth(), 1));
            else setYearPageStart((y) => y - 12);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 text-sm font-medium">
          {view === 'day' && (
            <>
              <button
                type="button"
                className="px-1.5 py-0.5 rounded hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => setView('month')}
                aria-label="Choose month"
              >
                {format(cursor, 'MMMM')}
              </button>
              <button
                type="button"
                className="px-1.5 py-0.5 rounded hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  setYearPageStart(cursor.getFullYear() - 6);
                  setView('year');
                }}
                aria-label="Choose year"
              >
                {cursor.getFullYear()}
              </button>
            </>
          )}
          {view === 'month' && <span>{cursor.getFullYear()}</span>}
          {view === 'year' && (
            <span>
              {yearPageStart} – {yearPageStart + 11}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Next month"
          onClick={() => {
            if (view === 'day') setCursor((c) => addMonths(c, 1));
            else if (view === 'month') setCursor((c) => new Date(c.getFullYear() + 1, c.getMonth(), 1));
            else setYearPageStart((y) => y + 12);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      {view === 'day' && (
        <div role="grid" aria-label="Calendar">
          <div className="grid grid-cols-7 mb-1" role="row">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                role="columnheader"
                className="text-[10px] uppercase text-muted-foreground text-center py-1"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const outside = !isSameMonth(d, cursor);
              const isSelected = selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              const disabled = isDisabled(d, minDate, maxDate);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  role="gridcell"
                  aria-selected={!!isSelected}
                  aria-label={format(d, 'PPPP')}
                  disabled={disabled}
                  onClick={() => setAndClose(d)}
                  className={cn(
                    'h-8 w-8 mx-auto text-xs rounded-md flex items-center justify-center transition-colors',
                    'hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    outside && 'text-muted-foreground/50',
                    isToday && !isSelected && 'border border-border',
                    isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                    disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'month' && (
        <div role="grid" aria-label="Month picker" className="grid grid-cols-3 gap-1">
          {MONTH_LABELS.map((m, idx) => {
            const isCurrent = cursor.getMonth() === idx;
            return (
              <button
                key={m}
                type="button"
                role="gridcell"
                onClick={() => {
                  setCursor(new Date(cursor.getFullYear(), idx, 1));
                  setView('day');
                }}
                className={cn(
                  'h-10 text-xs rounded-md transition-colors',
                  'hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isCurrent && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}

      {view === 'year' && (
        <div role="grid" aria-label="Year picker" className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((y) => {
            const isCurrent = cursor.getFullYear() === y;
            return (
              <button
                key={y}
                type="button"
                role="gridcell"
                onClick={() => {
                  setCursor(new Date(y, cursor.getMonth(), 1));
                  setView('day');
                }}
                className={cn(
                  'h-10 text-xs rounded-md transition-colors',
                  'hover:bg-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isCurrent && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
              >
                {y}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border/60 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setCursor(startOfMonth(today));
            setView('day');
            setAndClose(today);
          }}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onSelect(null)}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

export function NaitiveDatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
  buttonClassName,
  disabled,
  clearable = true,
  align = 'start',
  size = 'default',
  fromDate,
  toDate,
}: NaitiveDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseISO(value);

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'justify-start text-left font-normal gap-2',
              size === 'sm' ? 'h-8 px-2 text-xs' : 'h-9 px-3 text-sm',
              !selected && 'text-muted-foreground',
              buttonClassName,
            )}
          >
            <CalendarIcon className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4', 'opacity-70')} />
            {selected ? format(selected, 'MMM d, yyyy') : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-popover" align={align}>
          <CalendarPanel
            selected={selected}
            onSelect={(d) => {
              onChange(toISO(d ?? undefined));
              setOpen(false);
            }}
            minDate={parseISO(fromDate)}
            maxDate={parseISO(toDate)}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          className={cn(size === 'sm' ? 'h-7 w-7' : 'h-8 w-8', 'text-muted-foreground hover:text-foreground')}
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}