import { Button } from '@/components/ui/button';
import { FUNDING_SOURCE_TYPE_OPTIONS } from './FundingSourceTypeSelect';

interface Props {
  selectedTypes: string[];
  onChange: (types: string[]) => void;
}

export function FundingSourceTypeQuickFilters({ selectedTypes, onChange }: Props) {
  return (
    <div role="group" aria-label="Funding source types" className="flex w-full min-w-0 shrink-0 gap-2 overflow-x-auto px-3 py-1">
      {['All', ...FUNDING_SOURCE_TYPE_OPTIONS].map((type) => {
        const selected = type === 'All'
          ? selectedTypes.length === 0
          : selectedTypes.length === 1 && selectedTypes[0].toLowerCase() === type.toLowerCase();
        return (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={selected}
            className={`h-8 shrink-0 whitespace-nowrap ${selected ? 'lg-cta' : 'lg-pill'}`}
            onClick={() => onChange(type === 'All' || selected ? [] : [type])}
          >
            {type}
          </Button>
        );
      })}
    </div>
  );
}