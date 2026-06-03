import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';

interface MultiSelectChipsProps {
  value: string; // comma-joined
  onChange: (next: string) => void;
  options: readonly string[];
  placeholder?: string;
  searchPlaceholder?: string;
}

export function MultiSelectChips({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
}: MultiSelectChipsProps) {
  const [search, setSearch] = useState('');
  const current = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-auto min-h-[2.5rem] text-sm font-normal"
        >
          {current.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {current.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2 z-[1400] bg-popover"
        align="start"
        onKeyDown={(e) => { if (e.key === 'Escape') e.stopPropagation(); }}
      >
        <div className="mb-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div
          className="space-y-0.5 max-h-[260px] overflow-y-auto overscroll-contain pr-1"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {filtered.map((opt) => {
            const isSelected = current.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-muted/50 text-left"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const next = isSelected
                    ? current.filter((t) => t !== opt)
                    : [...current, opt];
                  onChange(next.join(','));
                }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <Checkbox checked={isSelected} className="pointer-events-none h-3.5 w-3.5" />
                {opt}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}