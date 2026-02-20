import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { keys: ['Ctrl', 'Z'], description: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
  { keys: ['Ctrl', 'Y'], description: 'Redo (alt)' },
  { keys: ['Ctrl', 'C'], description: 'Copy selected node' },
  { keys: ['Ctrl', 'V'], description: 'Paste copied node' },
  { keys: ['Ctrl', 'D'], description: 'Duplicate selected node' },
  { keys: ['Delete'], description: 'Delete selected node/edge' },
  { keys: ['Backspace'], description: 'Delete selected node/edge' },
  { keys: ['Shift', 'Click'], description: 'Multi-select nodes' },
];

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.description}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((key, j) => (
                  <span key={j}>
                    {j > 0 && <span className="text-muted-foreground/50 mx-0.5">+</span>}
                    <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono">
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
