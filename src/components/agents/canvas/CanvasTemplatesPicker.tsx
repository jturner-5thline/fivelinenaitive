import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CANVAS_TEMPLATES, type CanvasTemplate } from './canvasTemplates';

interface CanvasTemplatesPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: CanvasTemplate) => void;
}

export function CanvasTemplatesPicker({ open, onOpenChange, onSelect }: CanvasTemplatesPickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start from a Template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          {CANVAS_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => {
                onSelect(template);
                onOpenChange(false);
              }}
              className="text-left p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{template.icon}</span>
                <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">{template.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{template.description}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/60">
                <span>{template.nodes.length} nodes</span>
                <span>·</span>
                <span>{template.edges.length} connections</span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
