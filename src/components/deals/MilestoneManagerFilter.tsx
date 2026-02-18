import { useMemo } from 'react';
import { MultiSelectFilter } from './MultiSelectFilter';
import { useDealsContext } from '@/contexts/DealsContext';

interface MilestoneManagerFilterProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function MilestoneManagerFilter({ selected, onChange }: MilestoneManagerFilterProps) {
  const { deals } = useDealsContext();

  const managerOptions = useMemo(() => {
    const managers = new Set<string>();
    deals.forEach(deal => {
      if (deal.manager && deal.manager.trim()) {
        managers.add(deal.manager);
      }
    });
    return Array.from(managers).sort().map(manager => ({
      value: manager,
      label: manager,
    }));
  }, [deals]);

  return (
    <MultiSelectFilter
      label="Manager"
      options={managerOptions}
      selected={selected}
      onChange={onChange}
      className="w-[150px]"
    />
  );
}
