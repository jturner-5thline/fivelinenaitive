import { useState, useEffect, useCallback } from 'react';
import { Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Shortcut {
  keys: string[];
  label: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], label: 'Command palette', category: 'Navigation' },
  { keys: ['⌘', 'E'], label: 'Run extraction', category: 'Actions' },
  { keys: ['⌘', 'A'], label: 'Toggle audit mode', category: 'Actions' },
  { keys: ['⌘', 'P'], label: 'Export PDF', category: 'Export' },
  { keys: ['⌘', '?'], label: 'Show shortcuts', category: 'Help' },
];

interface KeyboardShortcutsProps {
  onSwitchMode: (mode: string) => void;
  onExtract: () => void;
  onToggleAudit: () => void;
  onExportPDF?: () => void;
}

export function useKeyboardShortcuts({ onSwitchMode, onExtract, onToggleAudit, onExportPDF }: KeyboardShortcutsProps) {
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      switch (e.key) {
        case 'e': e.preventDefault(); onExtract(); break;
        case 'a': e.preventDefault(); onToggleAudit(); break;
        case 'p': e.preventDefault(); onExportPDF?.(); break;
        case '?': e.preventDefault(); setShowCheatSheet(s => !s); break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSwitchMode, onExtract, onToggleAudit, onExportPDF]);

  return { showCheatSheet, setShowCheatSheet };
}

export function ShortcutCheatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  const categories = [...new Set(SHORTCUTS.map(s => s.category))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border/50 shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-4">
          {categories.map(cat => (
            <div key={cat}>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{cat}</h4>
              <div className="space-y-1.5">
                {SHORTCUTS.filter(s => s.category === cat).map(s => (
                  <div key={s.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <div className="flex items-center gap-0.5">
                      {s.keys.map(k => (
                        <Badge key={k} variant="outline" className="h-5 min-w-[22px] text-[10px] font-mono justify-center px-1">
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

        <p className="text-[10px] text-muted-foreground mt-4 text-center">
          Press <Badge variant="outline" className="h-4 text-[9px] px-1 font-mono">⌘?</Badge> to toggle
        </p>
      </div>
    </div>
  );
}
