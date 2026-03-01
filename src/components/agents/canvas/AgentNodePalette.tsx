import { useState } from 'react';
import { AGENT_NODE_REGISTRY, AGENT_NODE_CATEGORIES } from './agentNodeRegistry';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleLibraryPanel } from './ModuleManager';
import type { ModuleDefinition } from './types';
import type { AdminBuilderConfig } from './AdminConfigModal';

interface AgentNodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
  modules?: ModuleDefinition[];
  onDeleteModule?: (id: string) => void;
  onInsertModule?: (module: ModuleDefinition) => void;
  adminConfig?: AdminBuilderConfig;
  isAdmin?: boolean;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function AgentNodePalette({ onDragStart, modules = [], onDeleteModule, onInsertModule, adminConfig, isAdmin }: AgentNodePaletteProps) {
  const [search, setSearch] = useState('');

  // Filter by admin config (enabled categories)
  const visibleRegistry = AGENT_NODE_REGISTRY.filter(n => {
    if (isAdmin) return true;
    if (!adminConfig) return true;
    return adminConfig.enabledCategories[n.category] !== false;
  });

  const filteredRegistry = search.trim()
    ? visibleRegistry.filter(n =>
        fuzzyMatch(n.label, search) ||
        fuzzyMatch(n.description, search) ||
        fuzzyMatch(n.category, search) ||
        (n.tags || []).some(tag => fuzzyMatch(tag, search))
      )
    : visibleRegistry;

  const visibleCategories = AGENT_NODE_CATEGORIES.filter(cat => {
    if (isAdmin) return true;
    if (!adminConfig) return true;
    return adminConfig.enabledCategories[cat.key] !== false;
  });

  return (
    <div className="w-64 min-w-[256px] border-r border-border bg-card flex flex-col">
      <div className="px-3 py-2 border-b border-border space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Components</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes, tags..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {visibleCategories.map(cat => {
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
                        'hover:bg-muted/50 transition-colors group'
                      )}
                    >
                      <span className="text-base">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.description}</p>
                        {item.tags && item.tags.length > 0 && search.trim() && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {item.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[9px] px-1 rounded bg-muted text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Custom Modules */}
          {modules.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider px-2 mb-1.5 text-primary">
                Your Modules
              </h4>
              <ModuleLibraryPanel
                modules={modules}
                onDelete={onDeleteModule || (() => {})}
                onInsert={onInsertModule || (() => {})}
              />
            </div>
          )}

          {filteredRegistry.length === 0 && modules.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              No matching components
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
