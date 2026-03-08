import { useRef } from 'react';
import { Search, SlidersHorizontal, Bell, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

export type NewsCategory = 'all' | 'watchlist' | 'active-deals' | 'lenders' | 'borrowers' | 'competitors' | 'market' | 'regulatory' | 'sectors';
export type DateRange = 'all' | '24h' | '7d' | '30d' | '90d';
export type SourceTierFilter = 'all' | '1' | '2' | '3';
export type EntityTypeFilter = 'all' | 'company' | 'person' | 'topic' | 'deal';
export type ViewLayout = 'grid' | 'list' | 'magazine';
export type NewsTab = 'for-you' | 'all' | 'watchlist-alerts' | 'saved';

const categories: { id: NewsCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'active-deals', label: 'Active Deals' },
  { id: 'lenders', label: 'Lenders' },
  { id: 'borrowers', label: 'Borrowers / Clients' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'market', label: 'Market & Macro' },
  { id: 'regulatory', label: 'Regulatory' },
  { id: 'sectors', label: 'Sectors' },
];

const dateRanges: { id: DateRange; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: '24h', label: 'Last 24 Hours' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
];

const sourceTiers: { id: SourceTierFilter; label: string }[] = [
  { id: 'all', label: 'All Sources' },
  { id: '1', label: 'Tier 1 (WSJ, Bloomberg, Reuters, FT)' },
  { id: '2', label: 'Tier 2 (Industry Publications)' },
  { id: '3', label: 'Tier 3 (Blogs, PR)' },
];

const entityTypes: { id: EntityTypeFilter; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'company', label: 'Company' },
  { id: 'person', label: 'Person' },
  { id: 'topic', label: 'Topic' },
  { id: 'deal', label: 'Deal' },
];

interface NewsFiltersProps {
  selectedCategory: NewsCategory;
  onCategoryChange: (category: NewsCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  sourceTierFilter: SourceTierFilter;
  onSourceTierChange: (tier: SourceTierFilter) => void;
  entityTypeFilter: EntityTypeFilter;
  onEntityTypeChange: (type: EntityTypeFilter) => void;
  categoryCounts: Record<string, number>;
}

export function NewsFilters({
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  sourceTierFilter,
  onSourceTierChange,
  entityTypeFilter,
  onEntityTypeChange,
  categoryCounts,
}: NewsFiltersProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollPills = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Category Pills - horizontal scroll */}
      <div className="relative flex items-center gap-1">
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 flex-shrink-0 hidden sm:flex"
          onClick={() => scrollPills('left')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div
          ref={scrollRef}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide scroll-smooth flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categories.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            return (
              <Button
                key={cat.id}
                variant="outline"
                size="sm"
                onClick={() => onCategoryChange(cat.id)}
                className={cn(
                  'h-7 gap-1 text-xs whitespace-nowrap flex-shrink-0 transition-all',
                  selectedCategory === cat.id
                    ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {cat.label}
                {count > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px] min-w-[16px] justify-center">
                    {count}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 flex-shrink-0 hidden sm:flex"
          onClick={() => scrollPills('right')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Enhanced Search Bar */}
      <div className="relative flex items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, keyword, lender, deal name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-10 h-10 text-sm"
          />
          {/* Filter button inside search bar */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-3" align="end">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Date Range</p>
                <div className="flex flex-wrap gap-1">
                  {dateRanges.map(r => (
                    <Button
                      key={r.id}
                      variant={dateRange === r.id ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => onDateRangeChange(r.id)}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Source Tier</p>
                <div className="flex flex-wrap gap-1">
                  {sourceTiers.map(t => (
                    <Button
                      key={t.id}
                      variant={sourceTierFilter === t.id ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => onSourceTierChange(t.id)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Entity Type</p>
                <div className="flex flex-wrap gap-1">
                  {entityTypes.map(e => (
                    <Button
                      key={e.id}
                      variant={entityTypeFilter === e.id ? 'secondary' : 'outline'}
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => onEntityTypeChange(e.id)}
                    >
                      {e.label}
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
