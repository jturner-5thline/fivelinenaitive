import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MessageSquarePlus, X } from 'lucide-react';

export interface Annotation {
  id: string;
  dataKey: string;
  text: string;
  createdAt: string;
}

interface ChartAnnotationLayerProps {
  annotations: Annotation[];
  onAdd: (annotation: Omit<Annotation, 'id' | 'createdAt'>) => void;
  onRemove: (id: string) => void;
}

export function ChartAnnotationLayer({ annotations, onAdd, onRemove }: ChartAnnotationLayerProps) {
  const [newText, setNewText] = useState('');
  const [newKey, setNewKey] = useState('');

  const handleAdd = () => {
    if (!newText.trim() || !newKey.trim()) return;
    onAdd({ dataKey: newKey.trim(), text: newText.trim() });
    setNewText('');
    setNewKey('');
  };

  return (
    <div className="mt-2 space-y-1">
      {annotations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {annotations.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 text-[10px] bg-muted px-2 py-0.5 rounded-full"
            >
              <span className="font-medium">{a.dataKey}:</span> {a.text}
              <button onClick={() => onRemove(a.id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
            <MessageSquarePlus className="h-3 w-3" />
            Add Note
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2">
          <Input
            placeholder="Data point (e.g. Jan-25)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="h-7 text-xs"
          />
          <Input
            placeholder="Note text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="h-7 text-xs"
          />
          <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd}>
            Add
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
