import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useContactTypes } from '@/hooks/useContactTypes';
import { contactTypeBadgeClass } from './contactTypeBadge';
import { cn } from '@/lib/utils';

const SEPARATOR = ' ; ';

export function splitContactTypes(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*;\s*/g)
    .map(s => s.trim())
    .filter(Boolean);
}

export function joinContactTypes(tags: string[]): string | null {
  const cleaned = Array.from(new Set(tags.map(t => t.trim()).filter(Boolean)));
  return cleaned.length ? cleaned.join(SEPARATOR) : null;
}

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
}

export function ContactTypeMultiSelect({ value, onChange, className }: Props) {
  const { data: types = [] } = useContactTypes();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => splitContactTypes(value), [value]);

  const toggle = (name: string) => {
    const set = new Set(selected);
    if (set.has(name)) set.delete(name); else set.add(name);
    onChange(joinContactTypes(Array.from(set)));
  };

  const remove = (name: string) => {
    onChange(joinContactTypes(selected.filter(s => s !== name)));
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {selected.map(tag => (
        <span key={tag} className={cn(contactTypeBadgeClass(tag), 'group gap-1 pr-1')}>
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="rounded-full p-0.5 hover:bg-foreground/10"
            aria-label={`Remove ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-border"
          >
            <Plus className="h-3 w-3" /> {selected.length ? 'Add' : 'Add type'}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-64" align="start">
          <Command>
            <CommandInput placeholder="Search types..." />
            <CommandList>
              <CommandEmpty>No types found.</CommandEmpty>
              <CommandGroup>
                {types.map(t => {
                  const isSelected = selected.includes(t.name);
                  return (
                    <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t.name)}>
                      <Check className={cn('mr-2 h-3.5 w-3.5', isSelected ? 'opacity-100' : 'opacity-0')} />
                      {t.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}