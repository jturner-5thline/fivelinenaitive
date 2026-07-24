import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type EditableFieldType =
  | 'text'
  | 'email'
  | 'url'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select';

export interface EditableFieldOption {
  value: string;
  label: string;
}

interface EditableFieldProps {
  label: string;
  value: string | number | null | undefined;
  /** Called when the user saves a new value. Empty strings are normalized to null. */
  onSave: (next: string | number | null) => void | Promise<void>;
  type?: EditableFieldType;
  /** Required when type === 'select' */
  options?: EditableFieldOption[];
  placeholder?: string;
  /** Whether the field can be edited (defaults to true) */
  editable?: boolean;
  /** When true, render link styling for the display value if it's a URL/email */
  asLink?: boolean;
  /** Optional className for the wrapper */
  className?: string;
  /** Optional saving state from the caller (overrides internal) */
  saving?: boolean;
}

function normalize(value: string, type: EditableFieldType): string | number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (type === 'number') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return trimmed;
}

/**
 * Inline editable detail-row field. Click to edit; Enter to save; Esc to cancel.
 * Multi-line + select variants render explicit Save/Cancel buttons.
 */
export function EditableField({
  label,
  value,
  onSave,
  type = 'text',
  options,
  placeholder,
  editable = true,
  asLink = false,
  className,
  saving = false,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value));
  const [selectQuery, setSelectQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value == null ? '' : String(value));
      setSelectQuery('');
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) inputRef.current.select?.();
    }
  }, [editing]);

  const currentStr = value == null || value === '' ? '' : String(value);

  const commit = async () => {
    const next = normalize(draft, type);
    const prev = value == null || value === '' ? null : (type === 'number' ? Number(value) : String(value));
    if (next === prev) {
      setEditing(false);
      return;
    }
    await onSave(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(currentStr);
    setEditing(false);
  };

  const renderDisplay = () => {
    if (!currentStr) {
      return (
        <p className={cn('text-xs italic text-muted-foreground/60', editable && 'group-hover:text-muted-foreground')}>
          {editable ? (placeholder || 'Add value…') : '—'}
        </p>
      );
    }
    if (asLink && (type === 'url' || type === 'email')) {
      const href = type === 'email' ? `mailto:${currentStr}` : currentStr;
      const text = type === 'url' ? currentStr.replace(/^https?:\/\//, '').replace(/\/$/, '') : currentStr;
      return (
        <a
          href={href}
          target={type === 'url' ? '_blank' : undefined}
          rel={type === 'url' ? 'noopener noreferrer' : undefined}
          className="text-primary text-sm hover:underline truncate block"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </a>
      );
    }
    if (type === 'select' && options) {
      const match = options.find((o) => o.value === currentStr);
      return <p className="text-xs break-words">{match?.label ?? currentStr}</p>;
    }
    return <p className="text-xs break-words whitespace-pre-wrap">{currentStr}</p>;
  };

  if (!editable) {
    return (
      <div className={cn('group', className)}>
        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
        {renderDisplay()}
      </div>
    );
  }

  if (editing) {
    if (type === 'select' && options) {
      const q = selectQuery.trim().toLowerCase();
      const filtered = q
        ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
        : options;
      return (
        <div className={cn('group', className)}>
          <p className="text-[10px] text-muted-foreground uppercase mb-1">{label}</p>
          <Select
            value={draft || ''}
            onValueChange={async (v) => {
              setDraft(v);
              const prev = value == null || value === '' ? null : String(value);
              if (v !== prev) await onSave(v === '' ? null : v);
              setEditing(false);
            }}
            open
            onOpenChange={(o) => { if (!o) setEditing(false); }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={placeholder || 'Select…'} /></SelectTrigger>
            <SelectContent>
              {options.length > 8 && (
                <div className="p-1 sticky top-0 bg-popover z-10">
                  <Input
                    autoFocus
                    value={selectQuery}
                    onChange={(e) => setSelectQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search…"
                    className="h-7 text-xs"
                  />
                </div>
              )}
              {filtered.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No results</div>
              ) : (
                filtered.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (type === 'textarea') {
      return (
        <div className={cn('group', className)}>
          <p className="text-[10px] text-muted-foreground uppercase mb-1">{label}</p>
          <Textarea
            ref={inputRef as any}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="text-xs"
            placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
          />
          <div className="flex justify-end gap-1 mt-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel} aria-label="Cancel">
              <X className="h-3 w-3" />
            </Button>
            <Button size="icon" className="h-6 w-6" onClick={commit} disabled={saving} aria-label="Save">
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    }

    const inputType = type === 'tel' ? 'tel' : type === 'email' ? 'email' : type === 'url' ? 'url' : type === 'number' ? 'number' : 'text';
    return (
      <div className={cn('group', className)}>
        <p className="text-[10px] text-muted-foreground uppercase mb-1">{label}</p>
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef as any}
            type={inputType}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 text-xs"
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }}
            onBlur={() => { commit(); }}
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onMouseDown={(e) => { e.preventDefault(); cancel(); }} aria-label="Cancel">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('group cursor-text', className)}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
        <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
      </div>
      {renderDisplay()}
    </div>
  );
}
