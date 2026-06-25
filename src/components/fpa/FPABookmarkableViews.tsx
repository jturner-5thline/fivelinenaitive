import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bookmark, BookmarkPlus, Trash2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface SavedView {
  id: string;
  name: string;
  module: string;
  dashboardTab?: string;
  comparisonMode?: string;
  dateRange?: string;
  createdAt: string;
}

const STORAGE_KEY = 'fpa-saved-views';

function loadViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveViews(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

interface BookmarkableViewsProps {
  currentModule: string;
  currentState: Partial<SavedView>;
  onRestoreView: (view: SavedView) => void;
}

export function BookmarkableViews({ currentModule, currentState, onRestoreView }: BookmarkableViewsProps) {
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleSave = () => {
    if (!newName.trim()) return;
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      module: currentModule,
      ...currentState,
      createdAt: new Date().toISOString(),
    };
    const updated = [...views, view];
    setViews(updated);
    saveViews(updated);
    setNewName('');
    toast.success(`View "${view.name}" saved`);
  };

  const handleDelete = (id: string) => {
    const updated = views.filter(v => v.id !== id);
    setViews(updated);
    saveViews(updated);
  };

  const handleRestore = (view: SavedView) => {
    onRestoreView(view);
    setOpen(false);
    toast.info(`Restored view: ${view.name}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 relative" aria-label="Views" title="Views">
          <Bookmark className="h-3.5 w-3.5" />
          {views.length > 0 && (
            <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px]">{views.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b space-y-2">
          <p className="text-xs font-medium">Saved Views</p>
          <div className="flex gap-1.5">
            <Input
              placeholder="Name this view..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <Button size="sm" className="h-7 px-2" onClick={handleSave} disabled={!newName.trim()}>
              <BookmarkPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-48">
          {views.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No saved views yet</p>
          ) : (
            views.map(v => (
              <div
                key={v.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0"
                onClick={() => handleRestore(v)}
              >
                <Star className="h-3 w-3 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{v.name}</p>
                  <p className="text-[9px] text-muted-foreground">{v.module} · {v.dashboardTab || 'overview'}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
