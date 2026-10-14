import { useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

interface Group {
  key: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}

interface Props {
  groups: Group[];
  onClearAll: () => void;
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** Single compact "Filters" button that merges all Cash Flow dropdown filters. */
export function CashFlowFiltersMenu({ groups, onClearAll }: Props) {
  const [open, setOpen] = useState(false);
  const visible = groups.filter((g) => g.options.length > 0);
  const activeCount = visible.reduce((n, g) => n + g.selected.length, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center h-8 gap-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors',
            activeCount > 0 && 'border-primary/40 bg-primary/5',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-0">
        <div className="max-h-[420px] overflow-y-auto">
          {visible.map((g) => (
            <div key={g.key} className="border-b border-border/50 px-3 py-2.5 last:border-b-0">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</span>
                {g.selected.length > 0 && (
                  <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => g.onChange([])}>
                    Clear
                  </button>
                )}
              </div>
              {g.searchable ? (
                <Command className="rounded-md border border-border/50 bg-transparent">
                  <CommandInput placeholder={`Search ${g.label.toLowerCase()}…`} className="h-8 text-xs" />
                  <CommandList className="max-h-[140px]">
                    <CommandEmpty className="py-3 text-center text-xs">No matches</CommandEmpty>
                    <CommandGroup>
                      {g.options.map((o) => {
                        const on = g.selected.includes(o);
                        return (
                          <CommandItem key={o} value={o} onSelect={() => g.onChange(toggle(g.selected, o))} className="gap-2 text-xs">
                            <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border', on && 'border-primary bg-primary text-primary-foreground')}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <span className="truncate">{o}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {g.options.map((o) => {
                    const on = g.selected.includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => g.onChange(toggle(g.selected, o))}
                        className={cn(
                          'h-7 rounded-md border px-2.5 text-xs transition-colors',
                          on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        {activeCount > 0 && (
          <div className="flex justify-end border-t border-border/50 px-3 py-2">
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onClearAll}>
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
