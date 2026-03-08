import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Check, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface EntityOption {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

interface EntitySearchModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  placeholder?: string;
  options: EntityOption[];
  isLoading?: boolean;
  multiSelect?: boolean;
  onConfirm: (selectedIds: string[]) => void;
  confirming?: boolean;
}

export function EntitySearchModal({
  open,
  onClose,
  title,
  placeholder = 'Search...',
  options,
  isLoading,
  multiSelect = false,
  onConfirm,
  confirming,
}: EntitySearchModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected(new Set());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      o => o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
    );
  }, [options, search]);

  const toggle = (id: string) => {
    if (multiSelect) {
      const next = new Set(selected);
      next.has(id) ? next.delete(id) : next.add(id);
      setSelected(next);
    } else {
      setSelected(new Set([id]));
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>

        <ScrollArea className="max-h-[300px] -mx-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
          ) : (
            <div className="space-y-1 px-1">
              {filtered.map(option => {
                const isSelected = selected.has(option.id);
                return (
                  <button
                    key={option.id}
                    onClick={() => toggle(option.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors',
                      isSelected
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted/50 border border-transparent'
                    )}
                  >
                    {option.icon && <div className="flex-shrink-0">{option.icon}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{option.label}</p>
                      {option.sublabel && (
                        <p className="text-xs text-muted-foreground truncate">{option.sublabel}</p>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0 || confirming}
          >
            {confirming ? 'Linking...' : `Link${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
