import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Undo2, Redo2, History, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export interface UndoAction {
  id: string;
  label: string;
  module: string;
  timestamp: Date;
  undo: () => void;
  redo: () => void;
}

interface UndoRedoState {
  past: UndoAction[];
  future: UndoAction[];
  push: (action: UndoAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const UndoRedoContext = createContext<UndoRedoState | null>(null);

export function UndoRedoProvider({ children }: { children: React.ReactNode }) {
  const [past, setPast] = useState<UndoAction[]>([]);
  const [future, setFuture] = useState<UndoAction[]>([]);

  const push = useCallback((action: UndoAction) => {
    setPast(prev => [...prev.slice(-49), action]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      last.undo();
      setFuture(f => [...f, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      last.redo();
      setPast(p => [...p, last]);
      return prev.slice(0, -1);
    });
  }, []);

  // Global undo/redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <UndoRedoContext.Provider value={{ past, future, push, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }}>
      {children}
    </UndoRedoContext.Provider>
  );
}

export function useUndoRedo() {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) throw new Error('useUndoRedo must be used inside UndoRedoProvider');
  return ctx;
}

export function UndoRedoToolbar() {
  const { past, future, undo, redo, canUndo, canRedo } = useUndoRedo();
  const [historyOpen, setHistoryOpen] = useState(false);

  const allActions = [...past.map(a => ({ ...a, type: 'past' as const })), ...future.map(a => ({ ...a, type: 'future' as const }))].reverse();

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Undo (⌘Z)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Redo (⌘⇧Z)</TooltipContent>
      </Tooltip>

      <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <History className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-2 border-b">
            <p className="text-xs font-medium">Action History</p>
            <p className="text-[10px] text-muted-foreground">{past.length} undo · {future.length} redo</p>
          </div>
          <ScrollArea className="max-h-48">
            {allActions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No actions yet</p>
            ) : (
              allActions.map((a, i) => (
                <div
                  key={`${a.id}-${i}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs border-b last:border-0",
                    a.type === 'future' && "opacity-50"
                  )}
                >
                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{a.label}</p>
                    <p className="text-[9px] text-muted-foreground">{a.module} · {formatDistanceToNow(a.timestamp, { addSuffix: true })}</p>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
