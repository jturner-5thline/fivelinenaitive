import { useState, useEffect } from 'react';
import { Widget, METRIC_OPTIONS, COLOR_OPTIONS } from '@/contexts/WidgetsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WidgetEditorProps {
  widget?: Widget;
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: Omit<Widget, 'id'>) => void;
}

export function WidgetEditor({ widget, isOpen, onClose, onSave }: WidgetEditorProps) {
  const [label, setLabel] = useState('');
  const [metric, setMetric] = useState<Widget['metric']>('active-deals');
  const [color, setColor] = useState<Widget['color']>('primary');

  useEffect(() => {
    if (widget) {
      setLabel(widget.label);
      setMetric(widget.metric);
      setColor(widget.color);
    } else {
      setLabel('');
      setMetric('active-deals');
      setColor('primary');
    }
  }, [widget, isOpen]);

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({ label: label.trim(), metric, color });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{widget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Widget label"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric">Metric</Label>
            <Select value={metric} onValueChange={(v) => setMetric(v as Widget['metric'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`h-8 w-8 rounded-full ${option.className} ${
                    color === option.value ? 'ring-2 ring-offset-2 ring-foreground' : ''
                  }`}
                  onClick={() => setColor(option.value)}
                  title={option.label}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!label.trim()}>
            {widget ? 'Save Changes' : 'Add Widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
