import { useState, useRef, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENT_NODE_REGISTRY } from './agentNodeRegistry';
import type { AgentNodePaletteItem } from './types';

interface InlineAddButtonProps {
  position: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string;
  onAddNode: (item: AgentNodePaletteItem, sourceNodeId: string, sourceHandleId: string) => void;
  onClose: () => void;
}

export function InlineAddButton({ position, sourceNodeId, sourceHandleId, onAddNode, onClose }: InlineAddButtonProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = search.trim()
    ? AGENT_NODE_REGISTRY.filter(n =>
        n.label.toLowerCase().includes(search.toLowerCase()) ||
        n.description.toLowerCase().includes(search.toLowerCase()) ||
        n.category.toLowerCase().includes(search.toLowerCase()) ||
        (n.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : AGENT_NODE_REGISTRY;

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-card border border-border rounded-lg shadow-lg w-56 overflow-hidden"
      style={{ left: position.x, top: position.y }}
    >
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Add next step..."
            className="w-full h-7 pl-7 pr-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {filtered.slice(0, 12).map(item => (
          <button
            key={item.type}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors text-left"
            onClick={() => { onAddNode(item, sourceNodeId, sourceHandleId); onClose(); }}
          >
            <span className="text-sm">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{item.label}</p>
              <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No matches</p>
        )}
      </div>
    </div>
  );
}

/** Small "+" button that appears near output handles */
export function AddNodeHandle({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={cn(
        'w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center',
        'opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110',
        className
      )}
    >
      <Plus className="h-3 w-3" />
    </button>
  );
}
