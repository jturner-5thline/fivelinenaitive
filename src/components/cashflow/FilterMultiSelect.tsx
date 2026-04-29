import { useMemo, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterMultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  /** Threshold above which selected values become "N selected" instead of inline list */
  inlineSummaryMax?: number;
  className?: string;
  align?: 'start' | 'center' | 'end';
  emptyText?: string;
}

export function FilterMultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  inlineSummaryMax = 2,
  className,
  align = 'start',
  emptyText = 'No options',
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    if (!selected.length) return 'All';
    if (selected.length <= inlineSummaryMax) return selected.join(', ');
    return `${selected.length} selected`;
  }, [selected, inlineSummaryMax]);

  const toggle = (val: string) => {
    onChange(
      selected.includes(val)
        ? selected.filter(v => v !== val)
        : [...selected, val]
    );
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const hasSelection = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center h-8 gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 text-xs font-medium text-foreground hover:bg-muted/40 hover:border-border transition-colors max-w-[260px]',
            hasSelection && 'border-primary/40 bg-primary/5',
            className
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="text-muted-foreground font-normal">{label}</span>
          <span className="truncate text-foreground">{summary}</span>
          {hasSelection ? (
            <span
              role="button"
              tabIndex={-1}
              onClick={clear}
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
              aria-label={`Clear ${label}`}
            >
              <X className="h-3 w-3" />
            </span>
          ) : (
            <ChevronDown className="ml-0.5 h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[240px] p-0 border-border/60 bg-popover/95 backdrop-blur-xl"
        sideOffset={6}
      >
        <Command>
          {searchable && (
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9 text-xs" />
          )}
          <CommandList className="max-h-[280px]">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {options.map(opt => {
                const isSelected = selected.includes(opt);
                return (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => toggle(opt)}
                    className="text-xs cursor-pointer gap-2"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-sm border border-border/70 transition-colors',
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'bg-transparent'
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {hasSelection && (
              <div className="border-t border-border/60 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs justify-center"
                  onClick={() => onChange([])}
                >
                  Clear all
                </Button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}