import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NODE_REGISTRY, NODE_CATEGORIES } from './nodeRegistry';
import { cn } from '@/lib/utils';

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

const categoryBg: Record<string, string> = {
  trigger: 'bg-chart-1/10 border-chart-1/30 hover:bg-chart-1/20',
  condition: 'bg-chart-3/10 border-chart-3/30 hover:bg-chart-3/20',
  data: 'bg-chart-2/10 border-chart-2/30 hover:bg-chart-2/20',
  integration: 'bg-chart-4/10 border-chart-4/30 hover:bg-chart-4/20',
  utility: 'bg-chart-5/10 border-chart-5/30 hover:bg-chart-5/20',
};

export function NodePalette({ onDragStart }: NodePaletteProps) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? NODE_REGISTRY.filter(
        n =>
          n.label.toLowerCase().includes(search.toLowerCase()) ||
          n.description.toLowerCase().includes(search.toLowerCase())
      )
    : NODE_REGISTRY;

  return (
    <div className="w-56 border-r border-border bg-card flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold mb-2">Nodes</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {NODE_CATEGORIES.map(cat => {
            const items = filtered.filter(n => n.category === cat.key);
            if (items.length === 0) return null;

            return (
              <div key={cat.key}>
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {cat.label}
                  </span>
                </div>

                <div className="space-y-1">
                  {items.map(node => (
                    <div
                      key={node.type}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md border cursor-grab transition-colors text-sm',
                        categoryBg[cat.key]
                      )}
                      draggable
                      onDragStart={e => onDragStart(e, node.type)}
                    >
                      <span className="text-base leading-none">{node.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{node.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
