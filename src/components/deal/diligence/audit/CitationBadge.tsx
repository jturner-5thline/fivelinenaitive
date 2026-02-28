import { ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SourceReference } from '../types';

interface CitationBadgeProps {
  source: SourceReference;
  confidence?: number;
  onClick?: () => void;
  className?: string;
}

export function CitationBadge({ source, confidence, onClick, className }: CitationBadgeProps) {
  const confColor = confidence != null
    ? confidence >= 0.9 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : confidence >= 0.7 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-primary/10 text-primary border-primary/20';

  const shortName = source.fileName
    ? source.fileName.length > 20 ? source.fileName.slice(0, 18) + '…' : source.fileName
    : 'Unknown';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-mono transition-all",
              "hover:ring-1 hover:ring-primary/40 cursor-pointer",
              confColor,
              className
            )}
          >
            <ShieldCheck className="h-2.5 w-2.5" />
            {source.cellAddress || shortName}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <FileSpreadsheet className="h-3 w-3" />
              {source.fileName}
            </div>
            {source.sheetName && (
              <p className="text-[10px] text-muted-foreground">Sheet: {source.sheetName}</p>
            )}
            {source.cellAddress && (
              <p className="text-[10px] text-muted-foreground">Cell: <span className="font-mono">{source.cellAddress}</span></p>
            )}
            {source.pageNumber != null && (
              <p className="text-[10px] text-muted-foreground">Page: {source.pageNumber}</p>
            )}
            {confidence != null && (
              <p className="text-[10px]">Confidence: {Math.round(confidence * 100)}%</p>
            )}
            {source.excerpt && (
              <p className="text-[10px] italic text-muted-foreground mt-1">"{source.excerpt}"</p>
            )}
            <p className="text-[10px] text-primary">Click for full trace</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
