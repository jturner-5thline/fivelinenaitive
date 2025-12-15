import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
}: MultiSelectFilterProps) {
  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const displayText = selected.length === 0
    ? label
    : selected.length === 1
    ? options.find((o) => o.value === selected[0])?.label || selected[0]
    : `${selected.length} selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-between gap-2 font-normal',
            selected.length > 0 && 'border-primary/50 bg-primary/5',
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0 bg-popover z-50" align="start">
        <div className="max-h-[300px] overflow-auto p-1">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <div
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                  isSelected && 'bg-accent/50'
                )}
                onClick={() => toggleOption(option.value)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleOption(option.value)}
                  className="pointer-events-none"
                />
                <span className="flex-1">{option.label}</span>
                {isSelected && <Check className="h-4 w-4 text-primary" />}
              </div>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs"
              onClick={() => onChange([])}
            >
              Clear selection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
