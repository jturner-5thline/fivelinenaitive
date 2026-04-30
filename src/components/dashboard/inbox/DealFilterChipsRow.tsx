import { useMemo } from 'react';
import { useDealsContext } from '@/contexts/DealsContext';
import { cn } from '@/lib/utils';
import { Briefcase, X } from 'lucide-react';
import type { Deal } from '@/types/deal';
import { isDealExcluded } from '@/utils/excludedDeals';

interface Props {
  selectedDealId: string | null;
  onSelect: (dealId: string | null) => void;
  /** Optional set of deal ids that have at least one matching email currently
   * loaded in the inbox. Used to surface those deals first. */
  dealIdsWithEmails?: Set<string>;
}

/**
 * Secondary filter row rendered directly under the category chips
 * (All / Clients & Deals / Calendar …) inside the naitive inbox.
 *
 * Lists active naitive deals as clickable chips. Clicking a chip filters
 * the inbox to emails whose best deal-match resolves to that deal — the
 * same matching engine that powers the inline "Likely: …" badges on
 * email rows. Picking another chip swaps the filter; the explicit "Clear"
 * pill removes it.
 */
export function DealFilterChipsRow({ selectedDealId, onSelect, dealIdsWithEmails }: Props) {
  const { deals } = useDealsContext();

  const activeDeals = useMemo(() => {
    const list = (deals || []).filter((d: Deal) => {
      if (isDealExcluded(d.name)) return false;
      // "Active" = not archived / off-track / on-hold so the chip row stays focused.
      if (d.status === 'archived' || d.status === 'on-hold') return false;
      return true;
    });
    // Surface deals with matching loaded emails first, then the rest alphabetically.
    return list.sort((a, b) => {
      const aHas = dealIdsWithEmails?.has(a.id) ? 1 : 0;
      const bHas = dealIdsWithEmails?.has(b.id) ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return (a.company || a.name).localeCompare(b.company || b.name);
    });
  }, [deals, dealIdsWithEmails]);

  if (activeDeals.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30 overflow-x-auto">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mr-1 shrink-0">
        Deals
      </span>
      {selectedDealId && (
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0',
            'bg-muted/40 text-muted-foreground border-border hover:bg-muted/70 hover:text-foreground',
          )}
          aria-label="Clear deal filter"
        >
          <X className="h-2.5 w-2.5" />
          Clear
        </button>
      )}
      {activeDeals.map((d) => {
        const active = selectedDealId === d.id;
        const label = d.company || d.name;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(active ? null : d.id)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors shrink-0 max-w-[180px]',
              active
                ? 'bg-[hsl(var(--outlook-blue))] text-white border-[hsl(var(--outlook-blue))]'
                : 'bg-[hsl(var(--outlook-blue)/0.08)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)] hover:bg-[hsl(var(--outlook-blue)/0.16)]',
            )}
            title={label}
          >
            <Briefcase className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}