import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { CompanyMember } from '@/hooks/useCompany';

interface Props {
  /** Comma-separated names, kept for backwards-compat with the existing column. */
  value: string;
  onChange: (next: string) => void;
  members: CompanyMember[];
  currentUserEmail?: string | null;
}

function parse(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function memberLabel(m: CompanyMember, currentUserEmail?: string | null): string {
  const name = (m.display_name || '').trim();
  if (name) return name;
  if (m.email) return m.email;
  if (currentUserEmail && m.user_id) return currentUserEmail;
  return 'Unknown user';
}

export function RelationshipOwnersPicker({ value, onChange, members, currentUserEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => parse(value), [value]);
  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected],
  );

  const options = useMemo(() => {
    const seen = new Set<string>();
    const list = members
      .map((m) => ({ member: m, label: memberLabel(m, currentUserEmail) }))
      .filter(({ label }) => {
        const key = label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(({ label }) => label.toLowerCase().includes(q));
  }, [members, query, currentUserEmail]);

  const toggle = (label: string) => {
    const key = label.toLowerCase();
    let next: string[];
    if (selectedSet.has(key)) {
      next = selected.filter((s) => s.toLowerCase() !== key);
    } else {
      next = [...selected, label];
    }
    onChange(next.join(', '));
  };

  const remove = (label: string) => {
    const key = label.toLowerCase();
    onChange(selected.filter((s) => s.toLowerCase() !== key).join(', '));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
              {selected.length === 0
                ? 'Select relationship owner(s)…'
                : `${selected.length} selected`}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b border-border/40">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teammates…"
              className="h-8"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {members.length === 0
                  ? 'No teammates found in your workspace.'
                  : 'No matches.'}
              </div>
            ) : (
              options.map(({ member, label }) => {
                const checked = selectedSet.has(label.toLowerCase());
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggle(label)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors',
                      checked && 'bg-muted/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border border-border',
                        checked && 'bg-primary border-primary text-primary-foreground',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate flex-1">{label}</span>
                    {member.role && (
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {member.role}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((label) => (
            <Badge
              key={label}
              variant="secondary"
              className="gap-1 pr-1 text-xs"
            >
              {label}
              <button
                type="button"
                onClick={() => remove(label)}
                className="rounded-sm hover:bg-foreground/10 p-0.5"
                aria-label={`Remove ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}