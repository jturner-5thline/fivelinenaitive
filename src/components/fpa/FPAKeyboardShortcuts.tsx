import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Shortcut {
  keys: string[];
  label: string;
  group: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], label: 'Command palette', group: 'General' },
  { keys: ['⌘', 'S'], label: 'Save current view', group: 'General' },
  { keys: ['⌘', 'Z'], label: 'Undo', group: 'General' },
  { keys: ['⌘', '⇧', 'Z'], label: 'Redo', group: 'General' },
  { keys: ['⌘', '/'], label: 'Keyboard shortcuts', group: 'General' },
  { keys: ['1'], label: 'Go to Data', group: 'Navigation' },
  { keys: ['2'], label: 'Go to Sheets', group: 'Navigation' },
  { keys: ['3'], label: 'Go to Dashboards', group: 'Navigation' },
  { keys: ['4'], label: 'Go to AI', group: 'Navigation' },
  { keys: ['5'], label: 'Go to Automations', group: 'Navigation' },
  { keys: ['⌘', 'E'], label: 'Export current view', group: 'Actions' },
  { keys: ['⌘', 'U'], label: 'Upload file', group: 'Actions' },
];

interface FPAKeyboardShortcutsProps {
  onNavigateToTab: (tab: string) => void;
  onAction?: (actionId: string) => void;
}

const TAB_MAP: Record<string, string> = {
  '1': 'data',
  '2': 'sheets',
  '3': 'dashboards',
  '4': 'ai',
  '5': 'automations',
};

export function FPAKeyboardShortcuts({ onNavigateToTab, onAction }: FPAKeyboardShortcutsProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setOpen(prev => !prev);
        return;
      }

      // Number keys for navigation (only when not in input)
      if (!isInput && !e.metaKey && !e.ctrlKey && TAB_MAP[e.key]) {
        onNavigateToTab(TAB_MAP[e.key]);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        onAction?.('export-pdf');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
        e.preventDefault();
        onAction?.('upload-workbook');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNavigateToTab, onAction]);

  const groups = [...new Set(SHORTCUTS.map(s => s.group))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Keyboard className="h-4 w-4" /> Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-xs font-medium text-muted-foreground mb-2">{group}</p>
              <div className="space-y-1.5">
                {SHORTCUTS.filter(s => s.group === group).map(s => (
                  <div key={s.label} className="flex items-center justify-between py-1">
                    <span className="text-xs">{s.label}</span>
                    <div className="flex gap-1">
                      {s.keys.map(k => (
                        <Badge key={k} variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-mono">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutHintBar() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">⌘K</Badge> Search
      </span>
      <span className="flex items-center gap-1">
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">⌘/</Badge> Shortcuts
      </span>
      <span className="flex items-center gap-1">
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">⌘Z</Badge> Undo
      </span>
    </div>
  );
}
