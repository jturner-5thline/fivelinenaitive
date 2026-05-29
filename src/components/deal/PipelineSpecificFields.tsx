import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedFieldValue, flushOnEnterOrTab } from '@/hooks/useDebouncedFieldValue';
import {
  getPipelineSchema,
  type PipelineFieldDef,
} from '@/config/pipelineFieldSchemas';
import type { Deal } from '@/types/deal';

interface PipelineSpecificFieldsProps {
  deal: Deal;
  onUpdate: (field: keyof Deal, value: any) => void;
}

const parseISODate = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  // Accept both "yyyy-MM-dd" and ISO timestamps
  const direct = parse(value.slice(0, 10), 'yyyy-MM-dd', new Date());
  if (isValid(direct)) return direct;
  const d = new Date(value);
  return isValid(d) ? d : undefined;
};

const formatCurrencyInput = (n: number | null | undefined): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return Math.round(n).toLocaleString();
};

/**
 * Strip $/comma/whitespace, return numeric string acceptable to Number().
 * Empty string stays empty (so users can clear the field while editing).
 */
const sanitizeCurrencyInput = (raw: string): string =>
  raw.replace(/[$,\s]/g, '');

const parseCurrencyDraft = (draft: string): number | null => {
  const cleaned = sanitizeCurrencyInput(draft);
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * Locally-debounced text/email field that NEVER binds value directly to the
 * remote prop — prevents per-keystroke optimistic echoes from clobbering
 * what the user is typing.
 */
function DebouncedTextField({
  remoteValue,
  onCommit,
  type,
  placeholder,
}: {
  remoteValue: string;
  onCommit: (next: string) => void;
  type: 'text' | 'email';
  placeholder?: string;
}) {
  const { value, setValue, flush, onFocus, onBlur } = useDebouncedFieldValue<string>(
    remoteValue ?? '',
    { commit: onCommit, debounceMs: 500 },
  );
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={flushOnEnterOrTab(flush)}
      placeholder={placeholder}
      className="w-full h-8 text-sm"
    />
  );
}

/**
 * Currency field that keeps a raw STRING draft locally so users can clear
 * the field, paste, or type freely without server echoes corrupting input.
 * The numeric commit only fires on debounce, blur, Enter, or Tab.
 */
function DebouncedCurrencyField({
  remoteValue,
  onCommit,
  placeholder,
}: {
  remoteValue: number | null | undefined;
  onCommit: (next: number | null) => void;
  placeholder?: string;
}) {
  const remoteDraft = formatCurrencyInput(remoteValue);
  const { value, setValue, flush, onFocus, onBlur } = useDebouncedFieldValue<string>(
    remoteDraft,
    {
      // Compare on normalized numeric value so "9876543" and "9,876,543" don't
      // ping-pong against the formatted server echo.
      equals: (a, b) => sanitizeCurrencyInput(a) === sanitizeCurrencyInput(b),
      commit: (draft) => onCommit(parseCurrencyDraft(draft)),
      debounceMs: 500,
    },
  );

  return (
    <div className="relative w-full">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
      <Input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const cleaned = sanitizeCurrencyInput(raw);
          // Allow empty draft, only digits otherwise.
          if (cleaned === '' || /^\d+$/.test(cleaned)) {
            // Re-format with thousands separators for nicer display while
            // keeping the raw digits as the underlying draft.
            const display = cleaned === '' ? '' : Number(cleaned).toLocaleString();
            setValue(display);
          }
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={flushOnEnterOrTab(flush)}
        placeholder={placeholder ?? '0'}
        className="pl-5 h-8 text-sm w-full"
      />
    </div>
  );
}

/**
 * Renders the pipeline-specific section of the Deal Information panel.
 * Pulls its field list from the centralized schema in
 * `src/config/pipelineFieldSchemas.ts`, so the create form and detail view
 * stay in sync. Returns null when the deal's pipeline has no extra fields.
 */
export function PipelineSpecificFields({ deal, onUpdate }: PipelineSpecificFieldsProps) {
  const schema = getPipelineSchema(deal.dealClass);
  if (!schema) return null;

  const renderField = (field: PipelineFieldDef) => {
    const value: any = (deal as any)[field.key];

    switch (field.type) {
      case 'text':
      case 'email':
        return (
          <DebouncedTextField
            key={field.key}
            type={field.type === 'email' ? 'email' : 'text'}
            remoteValue={value || ''}
            onCommit={(next) => onUpdate(field.key as keyof Deal, next)}
            placeholder={field.placeholder}
          />
        );

      case 'currency': {
        return (
          <DebouncedCurrencyField
            key={field.key}
            remoteValue={value as number | null | undefined}
            onCommit={(next) => onUpdate(field.key as keyof Deal, next)}
            placeholder={field.placeholder}
          />
        );
      }

      case 'date': {
        const date = parseISODate(value);
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full h-8 px-3 justify-start font-normal text-sm',
                  !date && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {date ? format(date, 'MMM d, yyyy') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) =>
                  onUpdate(field.key as keyof Deal, d ? format(d, 'yyyy-MM-dd') : null)
                }
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        );
      }

      case 'select':
        return (
          <Select
            value={value || ''}
            onValueChange={(v) => onUpdate(field.key as keyof Deal, v)}
          >
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'multi-select': {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {(field.options || []).map((opt) => {
              const checked = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = checked
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt];
                    onUpdate(field.key as keyof Deal, next);
                  }}
                  className={cn(
                    'h-7 px-2.5 rounded-full text-xs font-medium border transition-colors',
                    checked
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-muted'
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }

      case 'switch':
        return (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(v) => onUpdate(field.key as keyof Deal, v)}
          />
        );

      default:
        return null;
    }
  };

  const leftFields = schema.fields.filter((f) => (f.column ?? 'left') === 'left');
  const rightFields = schema.fields.filter((f) => f.column === 'right');
  const fullFields = schema.fields.filter((f) => f.column === 'full');

  const FieldRow = ({ field }: { field: PipelineFieldDef }) => (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-2 min-w-0">
      <span className="text-muted-foreground text-sm">{field.label}</span>
      <div className="min-w-0">{renderField(field)}</div>
    </div>
  );

  const FullFieldRow = ({ field }: { field: PipelineFieldDef }) => {
    if (field.type === 'switch') {
      return (
        <div className="flex items-center justify-between gap-3 min-w-0">
          <span className="text-muted-foreground text-sm">{field.label}</span>
          {renderField(field)}
        </div>
      );
    }
    return (
      <div className="space-y-1.5 min-w-0">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        {renderField(field)}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/*
       * Rendered as a continuation of the Deal Information card — no
       * separator or section header — so FinServ deals show one cohesive
       * unified section instead of two stacked groups. Other pipelines
       * with their own schemas still get the same continuous layout.
       */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-3">
        <div className="space-y-3 min-w-0">
          {leftFields.map((f) => (
            <FieldRow key={f.key} field={f} />
          ))}
        </div>
        <div className="space-y-3 min-w-0">
          {rightFields.map((f) => (
            <FieldRow key={f.key} field={f} />
          ))}
        </div>
      </div>
      {fullFields.length > 0 && (
        <div className="space-y-3 pt-1">
          {fullFields.map((f) => (
            <FullFieldRow key={f.key} field={f} />
          ))}
        </div>
      )}
    </div>
  );
}