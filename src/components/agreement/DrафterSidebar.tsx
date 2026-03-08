import { useState } from 'react';
import { Search, GripVertical, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgreementSection } from './types';

const CATEGORY_STYLES: Record<string, string> = {
  staple: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  configurable: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  optional: 'bg-muted text-muted-foreground border-border',
};

const GROUP_ORDER = ['staple', 'configurable', 'optional'] as const;
const GROUP_LABELS: Record<string, string> = {
  staple: 'STAPLE SECTIONS',
  configurable: 'CONFIGURABLE',
  optional: 'OPTIONAL',
};

interface Props {
  sections: AgreementSection[];
  activeSection: string | null;
  onSelectSection: (id: string) => void;
  onToggleSection: (id: string, enabled: boolean) => void;
}

export function DrафterSidebar({ sections, activeSection, onSelectSection, onToggleSection }: Props) {
  const [search, setSearch] = useState('');

  const filtered = sections.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = GROUP_ORDER.map(cat => ({
    category: cat,
    label: GROUP_LABELS[cat],
    items: filtered.filter(s => s.category === cat).sort((a, b) => a.sort_order - b.sort_order),
  })).filter(g => g.items.length > 0);

  return (
    <>
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter sections..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-4">
          {grouped.map(group => (
            <div key={group.category}>
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(s => {
                  const subCount = s.subsections ? `${s.subsections.filter(ss => ss.enabled).length}/${s.subsections.length} tiers` : null;
                  const qualCount = s.qualifiers ? `${s.qualifiers.filter(q => q.enabled).length} items` : null;
                  const meta = subCount || qualCount;

                  return (
                    <div
                      key={s.section_id}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-all ${
                        activeSection === s.section_id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted/50'
                      } ${!s.enabled ? 'opacity-50' : ''}`}
                      onClick={() => onSelectSection(s.section_id)}
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 shrink-0" />
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={v => { onToggleSection(s.section_id, v); }}
                        onClick={e => e.stopPropagation()}
                        className="scale-[0.65] shrink-0"
                      />
                      <span className={`truncate flex-1 ${!s.enabled ? 'line-through' : ''}`}>{s.title}</span>
                      {meta && (
                        <span className="text-[9px] text-muted-foreground/60 shrink-0">{meta}</span>
                      )}
                      <Badge variant="outline" className={`text-[8px] px-1 py-0 shrink-0 ${CATEGORY_STYLES[s.category]}`}>
                        {s.category.charAt(0).toUpperCase()}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  );
}
