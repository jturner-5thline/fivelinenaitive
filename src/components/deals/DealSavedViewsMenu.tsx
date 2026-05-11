import { useState } from 'react';
import { Bookmark, BookmarkPlus, Trash2, Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DealSavedView, DealViewConfig } from '@/hooks/useDealSavedViews';
import { cn } from '@/lib/utils';

interface DealSavedViewsMenuProps {
  views: DealSavedView[];
  onSave: (name: string) => void;
  onRestore: (view: DealSavedView) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string | null) => void;
  hasActiveFilters: boolean;
}

export function DealSavedViewsMenu({
  views,
  onSave,
  onRestore,
  onDelete,
  onSetDefault,
  hasActiveFilters,
}: DealSavedViewsMenuProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleSave = () => {
    if (!newName.trim()) return;
    onSave(newName.trim());
    setNewName('');
  };

  const handleRestore = (view: DealSavedView) => {
    onRestore(view);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Saved views${views.length > 0 ? ` (${views.length})` : ''}`}
          title="Saved views"
          className="relative h-8 w-8 shrink-0"
        >
          <Bookmark className="h-3.5 w-3.5" />
          {views.length > 0 && (
            <Badge
              variant="secondary"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px]"
            >
              {views.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b space-y-2">
          <p className="text-xs font-medium">Saved Views</p>
          <p className="text-[10px] text-muted-foreground">
            Save your current filters, sorting, and view mode
          </p>
          <div className="flex gap-1.5">
            <Input
              placeholder="Name this view..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <Button
              size="sm"
              className="h-7 px-2"
              onClick={handleSave}
              disabled={!newName.trim()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-56">
          {views.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No saved views yet
            </p>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0"
                onClick={() => handleRestore(v)}
              >
                <Bookmark className="h-3 w-3 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{v.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {v.config.viewMode} · {v.config.sortField} {v.config.sortDirection}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDefault(v.isDefault ? null : v.id);
                    }}
                  >
                    {v.isDefault ? (
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    ) : (
                      <StarOff className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(v.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
        {views.some(v => v.isDefault) && (
          <div className="p-2 border-t">
            <p className="text-[9px] text-muted-foreground text-center">
              ⭐ Default view loads automatically on page visit
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
