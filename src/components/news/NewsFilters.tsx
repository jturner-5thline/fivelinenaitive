import { useMemo } from 'react';
import { Search, Building2, Users, Calendar, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { NewsChannel } from '@/hooks/useNewsChannels';

export type NewsCategory = 'all' | 'lenders' | 'clients';
export type DateRange = 'all' | 'today' | 'week' | 'month';
export type ViewLayout = 'grid' | 'list' | 'magazine';

interface NewsFiltersProps {
  selectedCategory: NewsCategory;
  onCategoryChange: (category: NewsCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  channels: NewsChannel[];
  activeChannelId: string | null;
  onChannelSelect: (id: string | null) => void;
}

const categories: { id: NewsCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'lenders', label: 'Lenders', icon: <Building2 className="h-3.5 w-3.5" /> },
  { id: 'clients', label: 'Clients', icon: <Users className="h-3.5 w-3.5" /> },
];

const dateRanges: { id: DateRange; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

export function NewsFilters({ 
  selectedCategory, 
  onCategoryChange, 
  searchQuery, 
  onSearchChange,
  dateRange,
  onDateRangeChange,
  channels,
  activeChannelId,
  onChannelSelect,
}: NewsFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id && !activeChannelId ? 'default' : 'outline'}
              size="sm"
              onClick={() => { onCategoryChange(category.id); onChannelSelect(null); }}
              className={cn(
                'h-8 gap-1.5 transition-all',
                selectedCategory === category.id && !activeChannelId && 'shadow-md'
              )}
            >
              {category.icon}
              {category.label}
            </Button>
          ))}
          
          {channels.filter(c => c.is_active).map((channel) => (
            <Button
              key={channel.id}
              variant={activeChannelId === channel.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onChannelSelect(activeChannelId === channel.id ? null : channel.id)}
              className={cn(
                'h-8 gap-1.5 transition-all',
                activeChannelId === channel.id && 'shadow-md'
              )}
            >
              {channel.name}
              {channel.keywords.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {channel.keywords.length}
                </Badge>
              )}
            </Button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {dateRanges.find(d => d.id === dateRange)?.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Time Period</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dateRanges.map((range) => (
                <DropdownMenuCheckboxItem
                  key={range.id}
                  checked={dateRange === range.id}
                  onCheckedChange={() => onDateRangeChange(range.id)}
                >
                  {range.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search news..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-8"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
