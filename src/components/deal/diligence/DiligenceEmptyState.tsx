import { Upload, BarChart3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DiligenceEmptyStateProps {
  mode: 'ingestion' | 'dashboard';
  hasFiles: boolean;
  hasMetrics: boolean;
  onUpload?: () => void;
  className?: string;
}

const STEPS = [
  { id: 1, label: 'Upload financials', icon: Upload, description: 'Drop your CIM, financial model, or VDR exports' },
  { id: 2, label: 'AI extracts data', icon: Sparkles, description: 'Statements, metrics, and issues are auto-detected' },
  { id: 3, label: 'Analyze & report', icon: BarChart3, description: 'Dashboard, scenarios, covenants, and IC-ready reports' },
];

export function DiligenceEmptyState({ mode, hasFiles, hasMetrics, onUpload, className }: DiligenceEmptyStateProps) {
  if (mode === 'ingestion' && !hasFiles) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Start your diligence</h3>
        <p className="text-sm text-muted-foreground max-w-md mb-8">
          Upload financial models, CIMs, or VDR documents. The AI will automatically extract statements, calculate key metrics, and flag data issues.
        </p>

        <div className="flex items-center gap-8 mb-8">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-2 max-w-[140px]">
                <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
                  <step.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium">{step.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{step.description}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px w-8 bg-border/50 mt-[-20px]" />
              )}
            </div>
          ))}
        </div>

        {onUpload && (
          <Button onClick={onUpload} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Files
          </Button>
        )}
      </div>
    );
  }

  if (mode === 'dashboard' && !hasMetrics) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 px-6 text-center rounded-xl border border-dashed border-border/40", className)}>
        <div className="h-12 w-12 rounded-xl bg-muted/30 flex items-center justify-center mb-4">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <h4 className="text-sm font-semibold mb-1">No metrics extracted yet</h4>
        <p className="text-xs text-muted-foreground max-w-sm">
          Upload financial files and run extraction to populate your dashboard with key metrics, variance analysis, and covenant monitoring.
        </p>
      </div>
    );
  }

  return null;
}
