import { Search, TrendingUp, DollarSign, Globe, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type NewsCategory = 'all' | 'market' | 'deals' | 'regulation' | 'company';

interface NewsFiltersProps {
  selectedCategory: NewsCategory;
  onCategoryChange: (category: NewsCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const categories: { id: NewsCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'market', label: 'Market', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: 'deals', label: 'Deals', icon: <DollarSign className="h-3.5 w-3.5" /> },
  { id: 'regulation', label: 'Regulation', icon: <Globe className="h-3.5 w-3.5" /> },
  { id: 'company', label: 'Company', icon: <Building2 className="h-3.5 w-3.5" /> },
];

export function NewsFilters({ 
  selectedCategory, 
  onCategoryChange, 
  searchQuery, 
  onSearchChange 
}: NewsFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((category) => (
          <Button
            key={category.id}
            variant={selectedCategory === category.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => onCategoryChange(category.id)}
            className={cn(
              'h-8 gap-1.5 transition-all',
              selectedCategory === category.id && 'shadow-md'
            )}
          >
            {category.icon}
            {category.label}
          </Button>
        ))}
      </div>
      
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search news..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
    </div>
  );
}
