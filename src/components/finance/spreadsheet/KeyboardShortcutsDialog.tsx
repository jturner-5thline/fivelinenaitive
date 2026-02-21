import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUT_GROUPS = [
  {
    label: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'S'], description: 'Save workbook' },
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Y'], description: 'Redo' },
      { keys: ['Ctrl', 'F'], description: 'Find & Replace' },
      { keys: ['Ctrl', '/'], description: 'Keyboard shortcuts' },
    ],
  },
  {
    label: 'Navigation',
    shortcuts: [
      { keys: ['↑ ↓ ← →'], description: 'Move between cells' },
      { keys: ['Tab'], description: 'Move to next cell' },
      { keys: ['Enter'], description: 'Move down / confirm edit' },
      { keys: ['Shift', 'Click'], description: 'Extend selection' },
      { keys: ['F2'], description: 'Edit current cell' },
    ],
  },
  {
    label: 'Editing',
    shortcuts: [
      { keys: ['Ctrl', 'C'], description: 'Copy' },
      { keys: ['Ctrl', 'X'], description: 'Cut' },
      { keys: ['Ctrl', 'V'], description: 'Paste' },
      { keys: ['Delete'], description: 'Clear cell contents' },
      { keys: ['Backspace'], description: 'Clear and edit cell' },
    ],
  },
  {
    label: 'Formatting',
    shortcuts: [
      { keys: ['Ctrl', 'B'], description: 'Toggle bold' },
      { keys: ['Ctrl', 'I'], description: 'Toggle italic' },
      { keys: ['Ctrl', 'U'], description: 'Toggle underline' },
    ],
  },
  {
    label: 'Formulas',
    shortcuts: [
      { keys: ['='], description: 'Start formula' },
      { keys: ['Tab'], description: 'Accept autocomplete suggestion' },
      { keys: ['Esc'], description: 'Cancel editing' },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUT_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <Separator className="mb-3" />}
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.label}</h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut, si) => (
                  <div key={si} className="flex items-center justify-between py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki}>
                          {ki > 0 && <span className="text-muted-foreground text-xs mx-0.5">+</span>}
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5">
                            {key}
                          </Badge>
                        </span>
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
