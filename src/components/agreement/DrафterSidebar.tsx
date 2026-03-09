import { useState, useCallback } from 'react';
import { Search, GripVertical, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AgreementSection } from './types';

const CATEGORY_STYLES: Record<string, string> = {
  staple: 'bg-destructive/15 text-destructive border-destructive/30',
  configurable: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  optional: 'bg-muted text-muted-foreground border-border',
};

const CATEGORY_LABELS: Record<string, string> = {
  staple: 'Required',
  configurable: 'Configurable',
  optional: 'Optional',
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
  onReorderSections: (sections: AgreementSection[]) => void;
  values: Record<string, string>;
}

function isSectionComplete(section: AgreementSection, values: Record<string, string>): boolean {
  for (const field of section.fields) {
    const val = values[field.key];
    if (!val || val.trim() === '') return false;
  }
  if (section.subsections) {
    for (const sub of section.subsections) {
      if (!sub.enabled) continue;
      for (const field of sub.fields) {
        const val = values[field.key];
        if (!val || val.trim() === '') return false;
      }
    }
  }
  return true;
}

export function DrафterSidebar({ sections, activeSection, onSelectSection, onToggleSection, onReorderSections, values }: Props) {
  const [search, setSearch] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const filtered = sections.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = GROUP_ORDER.map(cat => ({
    category: cat,
    label: GROUP_LABELS[cat],
    items: filtered.filter(s => s.category === cat).sort((a, b) => a.sort_order - b.sort_order),
  })).filter(g => g.items.length > 0);

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const newSections = [...sections];
    const dragIdx = newSections.findIndex(s => s.section_id === draggedId);
    const targetIdx = newSections.findIndex(s => s.section_id === targetId);
    if (dragIdx === -1 || targetIdx === -1) return;

    // Only allow reorder within same category
    if (newSections[dragIdx].category !== newSections[targetIdx].category) return;

    const [removed] = newSections.splice(dragIdx, 1);
    newSections.splice(targetIdx, 0, removed);

    // Update sort_order
    const category = removed.category;
    let order = 0;
    for (const s of newSections) {
      if (s.category === category) {
        s.sort_order = order++;
      }
    }

    onReorderSections(newSections);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  return (
    <>
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter sections..."
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">
          {grouped.map((group, gi) => (
            <div key={group.category}>
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest px-4 mb-2">
                {group.label}
              </p>
              <Separator className="mb-2 mx-4 opacity-30" />
              <div className="space-y-1">
                {group.items.map(s => {
                  const complete = s.enabled && isSectionComplete(s, values);
                  const needsInput = s.enabled && !complete;
                  const subCount = s.subsections ? `${s.subsections.filter(ss => ss.enabled).length}/${s.subsections.length} tiers` : null;
                  const qualCount = s.qualifiers ? `${s.qualifiers.filter(q => q.enabled).length} items` : null;
                  const meta = subCount || qualCount;

                  return (
                    <div
                      key={s.section_id}
                      draggable
                      onDragStart={e => handleDragStart(e, s.section_id)}
                      onDragOver={e => handleDragOver(e, s.section_id)}
                      onDragEnd={handleDragEnd}
                      className={`group flex items-center gap-2 px-4 py-3 rounded-lg cursor-pointer text-xs transition-all duration-150 ${
                        activeSection === s.section_id
                          ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                          : 'hover:bg-muted/50'
                      } ${!s.enabled ? 'opacity-50' : ''} ${draggedId === s.section_id ? 'opacity-30' : ''}`}
                      onClick={() => onSelectSection(s.section_id)}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 shrink-0 cursor-grab active:cursor-grabbing transition-opacity duration-150" />
                      <Checkbox
                        checked={s.enabled}
                        onCheckedChange={(v) => { onToggleSection(s.section_id, !!v); }}
                        onClick={e => e.stopPropagation()}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`truncate block ${!s.enabled ? 'line-through' : ''}`}>{s.title}</span>
                        {s.enabled && (
                          <span className="text-[9px] text-muted-foreground/50 block mt-0.5">
                            {s.enabled ? (s.enabled && complete ? 'Included' : 'Included') : 'Excluded'}
                          </span>
                        )}
                        {!s.enabled && (
                          <span className="text-[9px] text-muted-foreground/50 block mt-0.5">Excluded</span>
                        )}
                      </div>
                      {s.enabled && complete && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      )}
                      {needsInput && (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      {meta && (
                        <span className="text-[9px] text-muted-foreground/60 shrink-0">{meta}</span>
                      )}
                      <Badge variant="outline" className={`text-[8px] px-1.5 py-0 shrink-0 ${CATEGORY_STYLES[s.category]}`}>
                        {CATEGORY_LABELS[s.category]}
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
