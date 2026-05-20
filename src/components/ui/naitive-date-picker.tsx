import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(toISO(d));
              setOpen(false);
            }}
            // Always render 6 week rows so the popover height never shifts
            // between months that have 4/5/6 visible weeks. Trailing days
            // from the adjacent month are rendered muted via
            // `day_outside` styles in the Calendar component.
            fixedWeeks
            showOutsideDays
            defaultMonth={selected ?? undefined}
            fromDate={parseISO(fromDate)}
            toDate={parseISO(toDate)}
            initialFocus
            className="p-3 pointer-events-auto"
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