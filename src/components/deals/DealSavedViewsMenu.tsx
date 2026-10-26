import { useState } from 'react';
import { Bookmark, BookmarkPlus, Trash2, Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DealSavedView, DealViewConfig } from '@/hooks/useDealSavedViews';
import { cn } from '@/lib/utils';

interface DealSavedViewsMenuProps {
  views: DealSavedView[];
  onSave: (name: string, makeDefault?: boolean) => void;
  onRestore: (view: DealSavedView) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string | null) => void;
  hasActiveFilters: boolean;
  onSaveAsDefault?: () => void;
  isDefaultViewActive?: boolean;
  defaultViewName?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function DealSavedViewsMenu({
  views,
  onSave,
  onRestore,
  onDelete,
  onSetDefault,
  hasActiveFilters,
  onSaveAsDefault,
  isDefaultViewActive = false,
  defaultViewName = null,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: DealSavedViewsMenuProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => { setOpenState(v); onOpenChange?.(v); };
  const [newName, setNewName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);

  const handleSave = () => {
    if (!newName.trim()) return;
    onSave(newName.trim(), makeDefault);
    setNewName('');
    setMakeDefault(false);
  };

  const handleRestore = (view: DealSavedView) => {
    onRestore(view);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {hideTrigger ? (
        <PopoverAnchor asChild><span className="absolute right-0 bottom-0 h-0 w-0" aria-hidden /></PopoverAnchor>
      ) : (
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Saved views${views.length > 0 ? ` (${views.length})` : ''}`}
          title="Saved views"
          className="relative h-9 w-9 shrink-0 rounded-md"
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
      )}
      <PopoverContent className="w-80 p-0" align="end">
        {onSaveAsDefault && (
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Default view</p>
              <span className="text-[10px] text-muted-foreground truncate">
                {defaultViewName
                  ? (isDefaultViewActive ? `Showing "${defaultViewName}"` : 'Current view differs')
                  : 'None set'}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Loads for everyone in your account when they open Deals.
            </p>
            <Button
              size="sm"
              className="h-8 w-full gap-1.5"
              onClick={() => { onSaveAsDefault(); setOpen(false); }}
              disabled={isDefaultViewActive}
            >
              <Star className="h-3.5 w-3.5" />
              {isDefaultViewActive ? 'Current view is the default' : 'Save current view as default'}
            </Button>
          </div>
        )}
        <div className="p-3 border-b space-y-2">
          <p className="text-xs font-medium">Save as new view</p>
          <p className="text-[10px] text-muted-foreground">
            Saves current filters, sorting, grouping, and layout
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
              aria-label="Save view"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <Checkbox checked={makeDefault} onCheckedChange={(v) => setMakeDefault(v === true)} />
            Make this the default view
          </label>
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
