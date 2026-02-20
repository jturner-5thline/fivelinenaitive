import { useState } from 'react';
import { AGENT_NODE_REGISTRY, AGENT_NODE_CATEGORIES } from './agentNodeRegistry';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentNodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

export function AgentNodePalette({ onDragStart }: AgentNodePaletteProps) {
  const [search, setSearch] = useState('');

  const filteredRegistry = search.trim()
    ? AGENT_NODE_REGISTRY.filter(n =>
        n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.description.toLowerCase().includes(search.toLowerCase()) ||
        n.category.toLowerCase().includes(search.toLowerCase())
      )
    : AGENT_NODE_REGISTRY;

  return (
    <div className="w-64 min-w-[256px] border-r border-border bg-card flex flex-col">
      <div className="px-3 py-2 border-b border-border space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Components</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {AGENT_NODE_CATEGORIES.map(cat => {
            const items = filteredRegistry.filter(n => n.category === cat.key);
            if (items.length === 0) return null;

            return (
              <div key={cat.key}>
                <h4
                  className="text-[11px] font-semibold uppercase tracking-wider px-2 mb-1.5"
                  style={{ color: cat.color }}
                >
                  {cat.label}
                </h4>
                <div className="space-y-1">
                  {items.map(item => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={e => onDragStart(e, item.type)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-grab active:cursor-grabbing',
                        'hover:bg-muted/50 transition-colors'
                      )}
                    >
                      <span className="text-base">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filteredRegistry.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              No matching components
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
