import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

export const FUNDING_SOURCE_TYPE_OPTIONS = [
  'Alternative',
  'Asset-Based Lender',
  'Bank',
  'Distressed / Specialty',
  'Equipment Financing',
  'Equity',
  'Mezzanine',
  'Real Estate',
  'SBA',
];

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

/** Multi-select of standard funding source type tags; stored comma-separated. */
export function FundingSourceTypeSelect({ id, value, onChange }: Props) {
  const current = value ? value.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const toggle = (type: string) => {
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    onChange(next.join(','));
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="w-full justify-between h-auto min-h-[2.25rem] text-sm font-normal">
          {current.length ? (
            <span className="flex flex-wrap gap-1">
              {current.map((t) => (
                <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">Select funding source types</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-60 p-2 z-[9999]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-1 max-h-[300px] overflow-y-auto overscroll-contain pr-1" onWheel={(e) => e.stopPropagation()}>
          {[...FUNDING_SOURCE_TYPE_OPTIONS, ...current.filter((t) => !FUNDING_SOURCE_TYPE_OPTIONS.includes(t))].map((type) => {
            const isSelected = current.includes(type);
            return (
              <button
                key={type}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 text-left"
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); toggle(type); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(type); } }}
              >
                <Checkbox checked={isSelected} className="pointer-events-none" />
                {type}
                {!FUNDING_SOURCE_TYPE_OPTIONS.includes(type) && (
                  <span className="ml-auto text-[10px] text-muted-foreground">legacy</span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
