import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Filter } from 'lucide-react';

interface Props {
  allQuarters: string[];
  visibleQuarters: Set<string>;
  onChange: (visible: Set<string>) => void;
}

export function QuarterFilter({ allQuarters, visibleQuarters, onChange }: Props) {
  const [open, setOpen] = useState(false);

  // Group quarters by year
  const years = new Map<string, string[]>();
  allQuarters.forEach(q => {
    const year = '20' + q.split('-')[1];
    if (!years.has(year)) years.set(year, []);
    years.get(year)!.push(q);
  });

  const toggleQuarter = (q: string) => {
    const next = new Set(visibleQuarters);
    next.has(q) ? next.delete(q) : next.add(q);
    if (next.size > 0) onChange(next);
  };

  const toggleYear = (yearQuarters: string[]) => {
    const allVisible = yearQuarters.every(q => visibleQuarters.has(q));
    const next = new Set(visibleQuarters);
    yearQuarters.forEach(q => allVisible ? next.delete(q) : next.add(q));
    if (next.size > 0) onChange(next);
  };

  const selectAll = () => onChange(new Set(allQuarters));

  const hiddenCount = allQuarters.length - visibleQuarters.size;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
          <Filter className="h-3.5 w-3.5" />
          Quarters
          {hiddenCount > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 rounded-full font-medium">
              {visibleQuarters.size}/{allQuarters.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-foreground">Visible Quarters</span>
          <button onClick={selectAll} className="text-[10px] text-primary hover:underline">
            Show All
          </button>
        </div>
        <div className="space-y-2">
          {Array.from(years.entries()).map(([year, quarters]) => {
            const allChecked = quarters.every(q => visibleQuarters.has(q));
            const someChecked = quarters.some(q => visibleQuarters.has(q));
            return (
              <div key={year}>
                <div className="flex items-center gap-2 mb-1">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                    onCheckedChange={() => toggleYear(quarters)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[11px] font-semibold text-foreground">{year}</span>
                </div>
                <div className="ml-5 grid grid-cols-2 gap-x-3 gap-y-1">
                  {quarters.map(q => (
                    <label key={q} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={visibleQuarters.has(q)}
                        onCheckedChange={() => toggleQuarter(q)}
                        className="h-3 w-3"
                      />
                      <span className="text-[10px] text-muted-foreground">{q}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Given full quarters array and visible set, return indices of visible quarters */
export function getVisibleIndices(allQuarters: string[], visibleQuarters: Set<string>): number[] {
  return allQuarters.map((q, i) => visibleQuarters.has(q) ? i : -1).filter(i => i !== -1);
}
