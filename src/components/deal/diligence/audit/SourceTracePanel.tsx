import { useState } from 'react';
import { FileSpreadsheet, FileText, ChevronRight, ExternalLink, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { SourceReference, TimePeriodValue } from '../types';

export interface SourceTraceData {
  metricLabel: string;
  metricValue: string;
  formula?: string;
  transformations?: string[];
  lineage: LineageStep[];
  sourceRef: SourceReference;
  rawValue?: number | null;
  periodValue?: TimePeriodValue;
}

export interface LineageStep {
  label: string;
  type: 'output' | 'intermediate' | 'source';
  detail: string;
  sourceRef?: SourceReference;
}

interface SourceTracePanelProps {
  trace: SourceTraceData | null;
  onClose: () => void;
  className?: string;
}

export function SourceTracePanel({ trace, onClose, className }: SourceTracePanelProps) {
  const [copied, setCopied] = useState(false);

  if (!trace) return null;

  const handleCopy = () => {
    const text = [
      `Metric: ${trace.metricLabel}`,
      `Value: ${trace.metricValue}`,
      trace.formula ? `Formula: ${trace.formula}` : '',
      `Source: ${trace.sourceRef.fileName}${trace.sourceRef.sheetName ? ` > ${trace.sourceRef.sheetName}` : ''}${trace.sourceRef.cellAddress ? ` > ${trace.sourceRef.cellAddress}` : ''}`,
      trace.rawValue != null ? `Raw: ${trace.rawValue}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn(
      "rounded-xl border border-primary/20 bg-card shadow-lg overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <ExternalLink className="h-3 w-3 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold">Source Trace</p>
            <p className="text-[10px] text-muted-foreground">{trace.metricLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            <Copy className={cn("h-3 w-3", copied && "text-emerald-400")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="max-h-[400px]">
        <div className="p-4 space-y-4">
          {/* Value */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Current Value</span>
            <span className="text-lg font-mono font-bold">{trace.metricValue}</span>
          </div>

          {/* Formula */}
          {trace.formula && (
            <div className="rounded-lg bg-muted/30 border border-border/20 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Formula</p>
              <p className="text-xs font-mono">{trace.formula}</p>
            </div>
          )}

          {/* Breadcrumb Lineage */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lineage</p>
            <div className="space-y-0">
              {trace.lineage.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-1">
                    <div className={cn(
                      "h-2.5 w-2.5 rounded-full border-2 flex-shrink-0",
                      step.type === 'output' ? "border-primary bg-primary/30" :
                      step.type === 'intermediate' ? "border-amber-400 bg-amber-400/30" :
                      "border-emerald-400 bg-emerald-400/30"
                    )} />
                    {i < trace.lineage.length - 1 && (
                      <div className="w-px h-6 bg-border/40" />
                    )}
                  </div>
                  <div className="pb-2 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{step.label}</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                        {step.type}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Source Details */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Source Details</p>
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                {trace.sourceRef.fileName?.endsWith('.pdf') ?
                  <FileText className="h-3.5 w-3.5 text-blue-400" /> :
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                }
                <span className="font-medium">{trace.sourceRef.fileName}</span>
              </div>
              {trace.sourceRef.sheetName && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-5">
                  <ChevronRight className="h-2.5 w-2.5" />
                  Sheet: {trace.sourceRef.sheetName}
                </div>
              )}
              {trace.sourceRef.cellAddress && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-5">
                  <ChevronRight className="h-2.5 w-2.5" />
                  Cell: <span className="font-mono">{trace.sourceRef.cellAddress}</span>
                </div>
              )}
              {trace.sourceRef.pageNumber != null && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-5">
                  <ChevronRight className="h-2.5 w-2.5" />
                  Page: {trace.sourceRef.pageNumber}
                </div>
              )}
              {trace.rawValue != null && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-5">
                  <ChevronRight className="h-2.5 w-2.5" />
                  Raw Value: <span className="font-mono">{trace.rawValue}</span>
                </div>
              )}
              {trace.sourceRef.excerpt && (
                <div className="mt-2 ml-5 p-2 rounded bg-muted/30 border border-border/20">
                  <p className="text-[10px] italic text-muted-foreground">"{trace.sourceRef.excerpt}"</p>
                </div>
              )}
            </div>
          </div>

          {/* Transformations */}
          {trace.transformations && trace.transformations.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Transformations Applied</p>
              <div className="space-y-1">
                {trace.transformations.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-primary/60 flex-shrink-0" />
                    {t}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
