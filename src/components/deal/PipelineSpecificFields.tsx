import { format, parse, isValid } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
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
  PIPELINE_FIELD_SCHEMAS,
  type PipelineFieldDef,
} from '@/config/pipelineFieldSchemas';
import type { Deal } from '@/types/deal';

interface PipelineSpecificFieldsProps {
  deal: Deal;
  onUpdate: (field: keyof Deal, value: any) => void;
}

/**
 * Shared field renderer used both by the default schema-driven layout
 * (PipelineSpecificFields) and by callers that want to interleave
 * pipeline-specific fields with shared Deal Information fields in a
 * single custom grid (currently the FinServ deal page).
 */
function renderPipelineFieldInput(
  field: PipelineFieldDef,
  deal: Deal,
  onUpdate: (field: keyof Deal, value: any) => void,
) {
  const value: any = (deal as any)[field.key];

  switch (field.type) {
    case 'text':
    case 'email':
      return (
        <DebouncedTextField
          type={field.type === 'email' ? 'email' : 'text'}
          remoteValue={value || ''}
          onCommit={(next) => onUpdate(field.key as keyof Deal, next)}
          placeholder={field.placeholder}
        />
      );
    case 'currency':
      return (
        <DebouncedCurrencyField
          remoteValue={value as number | null | undefined}
          onCommit={(next) => onUpdate(field.key as keyof Deal, next)}
          placeholder={field.placeholder}
        />
      );
    case 'date': {
      return (
        <DateFieldWithInput
          value={value}
          onCommit={(iso) => onUpdate(field.key as keyof Deal, iso)}
        />
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
        <div className="flex w-full min-w-0 flex-wrap gap-1.5">
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
                  'min-h-7 max-w-full px-2.5 py-1 rounded-full text-xs font-medium border transition-colors text-left whitespace-normal break-words leading-tight',
                  checked
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-muted',
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
}

function lookupPipelineField(dealClass: string | undefined | null, fieldKey: string): PipelineFieldDef | null {
  if (!dealClass) return null;
  const schema = PIPELINE_FIELD_SCHEMAS[dealClass];
  return schema?.fields.find((f) => f.key === fieldKey) ?? null;
}

/**
 * Renders a single pipeline-specific field.
 *
 * Default (`stacked={false}`) keeps the legacy inline label + input row used
 * by wide layouts. Pass `stacked` inside narrow containers (e.g. the FinServ
 * deal detail left rail) to get a strict "label above full-width control"
 * block that never re-flows unpredictably.
 */
export function PipelineFieldRow({
  deal,
  fieldKey,
  onUpdate,
  stacked = false,
}: {
  deal: Deal;
  fieldKey: string;
  onUpdate: (field: keyof Deal, value: any) => void;
  stacked?: boolean;
}) {
  const field = lookupPipelineField(deal.dealClass, fieldKey);
  if (!field) return null;

  if (stacked) {
    // Switches read best as an explicit single row: label left, control right.
    if (field.type === 'switch') {
      return (
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 text-xs font-medium text-muted-foreground break-words">{field.label}</span>
          <div className="shrink-0">{renderPipelineFieldInput(field, deal, onUpdate)}</div>
        </div>
      );
    }
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground break-words">{field.label}</span>
        <div className="w-full min-w-0">{renderPipelineFieldInput(field, deal, onUpdate)}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 md:grid md:grid-cols-[minmax(5rem,6.5rem)_minmax(0,1fr)] md:items-center md:gap-2 min-w-0">
      <span className="text-muted-foreground text-sm break-words">{field.label}</span>
      <div className="min-w-0 w-full">{renderPipelineFieldInput(field, deal, onUpdate)}</div>
    </div>
  );
}

/**
 * Renders a single pipeline-specific field as a stacked full-width row
 * (label above input). Used for wide controls like multi-select chips.
 */
export function PipelineFullFieldRow({
  deal,
  fieldKey,
  onUpdate,
}: {
  deal: Deal;
  fieldKey: string;
  onUpdate: (field: keyof Deal, value: any) => void;
}) {
  const field = lookupPipelineField(deal.dealClass, fieldKey);
  if (!field) return null;
  if (field.type === 'switch') {
    return (
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-muted-foreground break-words">{field.label}</span>
        <div className="shrink-0">{renderPipelineFieldInput(field, deal, onUpdate)}</div>
      </div>
    );
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground break-words">{field.label}</span>
      <div className="w-full min-w-0">{renderPipelineFieldInput(field, deal, onUpdate)}</div>
    </div>
  );
}


const parseISODate = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  // Accept both "yyyy-MM-dd" and ISO timestamps
  const direct = parse(value.slice(0, 10), 'yyyy-MM-dd', new Date());
  if (isValid(direct)) return direct;
  const d = new Date(value);
  return isValid(d) ? d : undefined;
};

const TYPED_DATE_FORMATS = [
  'MM/dd/yyyy',
  'M/d/yyyy',
  'M/d/yy',
  'yyyy-MM-dd',
  'yyyy/MM/dd',
  'MMddyyyy',
];

const parseTypedDate = (s: string): Date | null => {
  const trimmed = s.trim();
  if (!trimmed) return null;
  for (const f of TYPED_DATE_FORMATS) {
    const d = parse(trimmed, f, new Date());
    if (isValid(d)) return d;
  }
  return null;
};

/**
 * Date input that supports BOTH manual typing (MM/DD/YYYY or YYYY-MM-DD)
 * AND a calendar popup. Typing auto-inserts slashes for MM/DD/YYYY,
 * keeps the calendar in sync, and commits on Enter / Tab / blur / pick.
 */
function DateFieldWithInput({
  value,
  onCommit,
}: {
  value: any;
  onCommit: (iso: string | null) => void;
}) {
  const externalDate = parseISODate(value);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(externalDate ? format(externalDate, 'MM/dd/yyyy') : '');
  const [error, setError] = useState(false);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      const d = parseISODate(value);
      setText(d ? format(d, 'MM/dd/yyyy') : '');
      setError(false);
    }
  }, [value]);

  const handleChange = (raw: string) => {
    let next = raw;
    // Auto-insert slashes when user types digits only (MM/DD/YYYY), but
    // leave ISO-style yyyy-... alone so YYYY-MM-DD typing still works.
    if (!/[-]/.test(raw) && /^[\d/]*$/.test(raw)) {
      const digits = raw.replace(/\D/g, '').slice(0, 8);
      if (digits.length >= 5) {
        next = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      } else if (digits.length >= 3) {
        next = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      } else {
        next = digits;
      }
    }
    setText(next);
    if (!next.trim()) {
      setError(false);
      return;
    }
    setError(!parseTypedDate(next));
  };

  const commit = (): boolean => {
    if (!text.trim()) {
      if (value) onCommit(null);
      setError(false);
      return true;
    }
    const d = parseTypedDate(text);
    if (d) {
      const iso = format(d, 'yyyy-MM-dd');
      lastValueRef.current = iso;
      onCommit(iso);
      setText(format(d, 'MM/dd/yyyy'));
      setError(false);
      return true;
    }
    setError(true);
    return false;
  };

  const previewDate = parseTypedDate(text) || externalDate;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Input
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (commit()) setOpen(false);
            } else if (e.key === 'Tab') {
              commit();
              setOpen(false);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          onBlur={() => commit()}
          placeholder="MM/DD/YYYY"
          aria-invalid={error}
          className={cn(
            'h-8 pr-8 text-sm',
            error && 'border-destructive focus-visible:ring-destructive',
          )}
        />
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            aria-label="Open calendar"
            className="absolute right-0 top-0 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((o) => !o)}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Calendar
          mode="single"
          selected={previewDate}
          defaultMonth={previewDate}
          onSelect={(d) => {
            if (d) {
              const iso = format(d, 'yyyy-MM-dd');
              lastValueRef.current = iso;
              onCommit(iso);
              setText(format(d, 'MM/dd/yyyy'));
              setError(false);
            } else {
              lastValueRef.current = null;
              onCommit(null);
              setText('');
              setError(false);
            }
            setOpen(false);
          }}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

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
        return (
          <DateFieldWithInput
            value={value}
            onCommit={(iso) => onUpdate(field.key as keyof Deal, iso)}
          />
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
    <div className="flex flex-col gap-1 md:grid md:grid-cols-[minmax(6rem,8.5rem)_minmax(0,1fr)] md:items-center md:gap-2 min-w-0">
      <span className="text-muted-foreground text-sm break-words">{field.label}</span>
      <div className="min-w-0 w-full">{renderField(field)}</div>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 pt-2">
        <div className="space-y-2 min-w-0">
          {leftFields.map((f) => (
            <FieldRow key={f.key} field={f} />
          ))}
        </div>
        <div className="space-y-2 min-w-0">
          {rightFields.map((f) => (
            <FieldRow key={f.key} field={f} />
          ))}
        </div>
      </div>
      {fullFields.length > 0 && (
        <div className="space-y-2 pt-1">
          {fullFields.map((f) => (
            <FullFieldRow key={f.key} field={f} />
          ))}
        </div>
      )}
    </div>
  );
}