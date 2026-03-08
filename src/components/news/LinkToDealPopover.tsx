import { useState } from 'react';
import { Link2, Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

// Mock active deals
const MOCK_DEALS = [
  { id: '1', name: 'Athyna' },
  { id: '2', name: 'TechFlow Capital' },
  { id: '3', name: 'Summit Healthcare Partners' },
  { id: '4', name: 'Meridian Software Group' },
  { id: '5', name: 'Apex Infrastructure Fund' },
];

interface LinkToDealPopoverProps {
  articleTitle: string;
  onLink?: (dealId: string, dealName: string) => void;
  variant?: 'icon' | 'button';
  className?: string;
}

export function LinkToDealPopover({ articleTitle, onLink, variant = 'icon', className }: LinkToDealPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [linked, setLinked] = useState<string | null>(null);

  const filtered = MOCK_DEALS.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleLink = (deal: typeof MOCK_DEALS[0]) => {
    setLinked(deal.id);
    onLink?.(deal.id, deal.name);
    toast.success(`Article linked to ${deal.name}`);
    setTimeout(() => setOpen(false), 600);
  };

  const trigger = variant === 'icon' ? (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${className}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Link to Deal</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <Button variant="outline" size="sm" className={`gap-1.5 ${className}`} onClick={(e) => e.stopPropagation()}>
      <Link2 className="h-3.5 w-3.5" />
      Link to Deal
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.preventDefault()}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium text-foreground mb-2 px-1">Link to Deal</p>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="max-h-[160px] overflow-y-auto space-y-0.5">
          {filtered.map(deal => (
            <button
              key={deal.id}
              onClick={() => handleLink(deal)}
              className="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-muted flex items-center justify-between transition-colors"
            >
              <span className="text-foreground">{deal.name}</span>
              {linked === deal.id && <Check className="h-3 w-3 text-primary" />}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">No deals found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
