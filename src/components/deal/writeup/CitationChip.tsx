import { FileText, StickyNote, Database, Users, Flag, Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SourceReference {
  source_index?: number;
  source_type: 'document' | 'spreadsheet' | 'note' | 'memo' | 'structured_data' | 'flag_note' | 'lender';
  source_name: string;
  source_id?: string;
  location?: string | null;
  excerpt?: string;
}

interface CitationChipProps {
  sources: SourceReference[];
  confidence?: 'high' | 'medium' | 'low';
  className?: string;
}

const SOURCE_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  spreadsheet: FileText,
  note: StickyNote,
  memo: StickyNote,
  structured_data: Database,
  lender: Users,
  flag_note: Flag,
};

const SOURCE_LABELS: Record<string, string> = {
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  note: 'Note',
  memo: 'Memo',
  structured_data: 'Deal Record',
  lender: 'Funding Source',
  flag_note: 'Flag Note',
};

function formatSourceLabel(source: SourceReference): string {
  const type = SOURCE_LABELS[source.source_type] || 'Source';
  if (source.location) {
    return `${type}: ${source.source_name}, ${source.location}`;
  }
  return `${type}: ${source.source_name}`;
}

function getShortLabel(sources: SourceReference[]): string {
  if (sources.length === 0) return 'No source';
  if (sources.length === 1) {
    const s = sources[0];
    const name = s.source_name.length > 20 ? s.source_name.substring(0, 18) + '…' : s.source_name;
    if (s.location) return `${name} ${s.location}`;
    return name;
  }
  return `${sources.length} sources`;
}

export function CitationChip({ sources, confidence = 'high', className }: CitationChipProps) {
  if (!sources || sources.length === 0) return null;

  const Icon = sources.length === 1 ? (SOURCE_ICONS[sources[0].source_type] || Info) : Info;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
            "hover:bg-muted/80 max-w-[200px]",
            confidence === 'high' && "bg-muted/50 text-muted-foreground border border-border/50",
            confidence === 'medium' && "bg-amber-500/10 text-amber-600 border border-dashed border-amber-400/40",
            confidence === 'low' && "bg-red-500/10 text-red-500 border border-dashed border-red-400/40",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{getShortLabel(sources)}</span>
          {confidence === 'medium' && <span className="ml-0.5">~</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-0" 
        side="bottom" 
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b bg-muted/30">
          <p className="text-xs font-medium text-foreground">
            {sources.length === 1 ? 'Source' : `${sources.length} Sources`}
          </p>
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {sources.map((source, i) => {
            const SrcIcon = SOURCE_ICONS[source.source_type] || Info;
            return (
              <div key={i} className={cn("px-3 py-2", i > 0 && "border-t border-border/50")}>
                <div className="flex items-center gap-1.5 mb-1">
                  <SrcIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate">
                    {formatSourceLabel(source)}
                  </span>
                </div>
                {source.excerpt && (
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3 italic pl-4">
                    "{source.excerpt}"
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
