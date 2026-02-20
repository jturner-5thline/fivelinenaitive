import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbTrailProps {
  category?: string | null;
  itemName?: string | null;
  onNavigateHome: () => void;
  onNavigateCategory?: () => void;
}

export function BreadcrumbTrail({ category, itemName, onNavigateHome, onNavigateCategory }: BreadcrumbTrailProps) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground overflow-hidden">
      <button
        onClick={onNavigateHome}
        className="flex items-center gap-1 hover:text-foreground transition-colors shrink-0"
      >
        <Home className="h-3 w-3" />
        <span>Data Room</span>
      </button>
      {category && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <button
            onClick={onNavigateCategory}
            className={cn(
              "truncate hover:text-foreground transition-colors",
              !itemName && "text-foreground font-medium"
            )}
          >
            {category}
          </button>
        </>
      )}
      {itemName && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate text-foreground font-medium">{itemName}</span>
        </>
      )}
    </nav>
  );
}
