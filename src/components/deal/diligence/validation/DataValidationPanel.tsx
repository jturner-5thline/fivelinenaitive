import { useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Info, XCircle, ChevronDown, ChevronRight,
  ShieldCheck, BarChart3, Gauge, Lightbulb,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { DetectedStatement, FinancialMetric, DataIssue } from '../types';
import {
  ValidationResult,
  ConfidenceScore,
  runReconciliationChecks,
  runCompletenessChecks,
  calculateConfidenceScores,
} from './validationEngine';

interface DataValidationPanelProps {
  statements: DetectedStatement[];
  metrics: FinancialMetric[];
  issues: DataIssue[];
  className?: string;
}

const SEVERITY_CONFIG = {
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Error' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Warning' },
  info: { icon: Info, color: 'text-primary', bg: 'bg-primary/10', label: 'Info' },
};

function getOverallHealth(results: ValidationResult[]): { score: number; label: string; color: string } {
  const errors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warning').length;
  if (errors > 0) return { score: Math.max(0, 60 - errors * 15), label: 'Issues Found', color: 'text-destructive' };
  if (warnings > 1) return { score: Math.max(50, 80 - warnings * 10), label: 'Needs Review', color: 'text-amber-500' };
  if (warnings === 1) return { score: 85, label: 'Good', color: 'text-amber-500' };
  return { score: 95, label: 'Excellent', color: 'text-emerald-500' };
}

function getConfidenceColor(score: number): string {
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-amber-500';
  return 'text-destructive';
}

function getConfidenceBarClass(score: number): string {
  if (score >= 80) return '[&>div]:bg-emerald-500';
  if (score >= 60) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-destructive';
}

export function DataValidationPanel({ statements, metrics, issues, className }: DataValidationPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('reconciliation');
  const [expandedConfidence, setExpandedConfidence] = useState<string | null>(null);

  const reconciliationResults = useMemo(() => runReconciliationChecks(statements), [statements]);
  const completenessResults = useMemo(() => runCompletenessChecks(statements), [statements]);
  const confidenceScores = useMemo(() => calculateConfidenceScores(statements, metrics), [statements, metrics]);

  const allResults = [...reconciliationResults, ...completenessResults];
  const health = getOverallHealth(allResults);
  const avgConfidence = confidenceScores.length > 0
    ? Math.round(confidenceScores.reduce((s, c) => s + c.score, 0) / confidenceScores.length)
    : 0;

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  return (
    <div className={cn("rounded-xl border border-border/30 bg-card", className)}>
      {/* Header with overall health */}
      <div className="px-4 py-3 border-b border-border/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Data Validation</h3>
          </div>
          <div className="flex items-center gap-2">
            {allResults.filter(r => r.severity === 'error').length > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5">
                {allResults.filter(r => r.severity === 'error').length} errors
              </Badge>
            )}
            {allResults.filter(r => r.severity === 'warning').length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 bg-amber-500/10 text-amber-500">
                {allResults.filter(r => r.severity === 'warning').length} warnings
              </Badge>
            )}
          </div>
        </div>

        {/* Health gauge */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Quality</span>
              <span className={cn("text-xs font-semibold", health.color)}>{health.score}% — {health.label}</span>
            </div>
            <Progress value={health.score} className={cn("h-2", health.score >= 80 ? '[&>div]:bg-emerald-500' : health.score >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-destructive')} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Confidence</span>
              <span className={cn("text-xs font-semibold", getConfidenceColor(avgConfidence))}>{avgConfidence}%</span>
            </div>
            <Progress value={avgConfidence} className={cn("h-2", getConfidenceBarClass(avgConfidence))} />
          </div>
        </div>
      </div>

      {/* Reconciliation checks */}
      <Collapsible open={expandedSection === 'reconciliation'} onOpenChange={() => toggleSection('reconciliation')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Reconciliation Checks</span>
            <Badge variant="outline" className="text-[10px] h-4 ml-1">
              {reconciliationResults.length}
            </Badge>
          </div>
          {expandedSection === 'reconciliation'
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          }
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 space-y-2">
            {reconciliationResults.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-emerald-500">All cross-statement checks passed</span>
              </div>
            ) : (
              reconciliationResults.map(result => {
                const cfg = SEVERITY_CONFIG[result.severity];
                const Icon = cfg.icon;
                return (
                  <div key={result.id} className={cn("px-3 py-2 rounded-lg border", cfg.bg, 'border-transparent')}>
                    <div className="flex items-start gap-2">
                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", cfg.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{result.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{result.description}</p>
                        {result.expected && result.actual && (
                          <div className="flex gap-3 mt-1.5">
                            <span className="text-[10px]"><span className="text-muted-foreground">Expected:</span> {result.expected}</span>
                            <span className="text-[10px]"><span className="text-muted-foreground">Actual:</span> {result.actual}</span>
                          </div>
                        )}
                        {result.suggestions && result.suggestions.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {result.suggestions.map((s, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <Lightbulb className="h-2.5 w-2.5 text-primary flex-shrink-0" />
                                <span className="text-[10px] text-muted-foreground">{s}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator className="opacity-30" />

      {/* Completeness checks */}
      <Collapsible open={expandedSection === 'completeness'} onOpenChange={() => toggleSection('completeness')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Completeness</span>
            <Badge variant="outline" className="text-[10px] h-4 ml-1">
              {completenessResults.length}
            </Badge>
          </div>
          {expandedSection === 'completeness'
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          }
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 space-y-2">
            {completenessResults.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-emerald-500">All required statements detected</span>
              </div>
            ) : (
              completenessResults.map(result => {
                const cfg = SEVERITY_CONFIG[result.severity];
                const Icon = cfg.icon;
                return (
                  <div key={result.id} className={cn("px-3 py-2 rounded-lg", cfg.bg)}>
                    <div className="flex items-start gap-2">
                      <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", cfg.color)} />
                      <div>
                        <p className="text-xs font-medium">{result.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{result.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator className="opacity-30" />

      {/* Confidence scores */}
      <Collapsible open={expandedSection === 'confidence'} onOpenChange={() => toggleSection('confidence')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2">
            <Gauge className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Confidence Scores</span>
            <Badge variant="outline" className="text-[10px] h-4 ml-1">
              {confidenceScores.length} metrics
            </Badge>
          </div>
          {expandedSection === 'confidence'
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
          }
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3 space-y-1.5">
            {confidenceScores.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No metrics to score. Run extraction first.</p>
            ) : (
              confidenceScores.map(cs => (
                <Collapsible
                  key={cs.metric}
                  open={expandedConfidence === cs.metric}
                  onOpenChange={() => setExpandedConfidence(prev => prev === cs.metric ? null : cs.metric)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 hover:bg-muted/10 rounded px-1 transition-colors">
                    <span className="text-xs flex-1 text-left">{cs.label}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={cs.score} className={cn("h-1.5 w-16", getConfidenceBarClass(cs.score))} />
                      <span className={cn("text-[10px] font-mono w-8 text-right", getConfidenceColor(cs.score))}>
                        {cs.score}%
                      </span>
                      {expandedConfidence === cs.metric
                        ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                        : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                      }
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-2 pl-2 border-l border-border/20 space-y-1 py-1">
                      {cs.factors.map((f, fi) => (
                        <div key={fi} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-28">{f.name}</span>
                          <Progress value={f.score} className={cn("h-1 w-12 flex-shrink-0", getConfidenceBarClass(f.score))} />
                          <span className="text-[10px] text-muted-foreground flex-1">{f.detail}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
