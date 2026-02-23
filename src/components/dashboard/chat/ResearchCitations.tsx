import { ExternalLink, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  citations: string[];
}

export function ResearchCitations({ citations }: Props) {
  if (!citations.length) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <BookOpen className="h-3 w-3 text-primary/70" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Sources ({citations.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((url, i) => {
          let domain = url;
          try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-0.5',
                'text-[10px] text-primary/80 bg-primary/5 border border-primary/10',
                'hover:bg-primary/10 hover:border-primary/20 transition-colors'
              )}
            >
              <span className="text-muted-foreground">[{i + 1}]</span>
              <span className="truncate max-w-[120px]">{domain}</span>
              <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
