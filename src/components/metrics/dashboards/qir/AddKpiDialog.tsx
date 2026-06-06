import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles, Plus, ArrowRight, ChevronLeft, Search, Gauge, BarChart3 } from 'lucide-react';
import { KPI_TEMPLATES, type KpiTemplateId } from './kpiTemplates';
import {
  buildInsightsMetricOptions,
  flattenInsightsMetricOptions,
  type InsightsMetricOption,
} from './insightsMetricRegistry';
import { useCustomMetrics } from '@/hooks/useCustomMetrics';

type Step = 'chooser' | 'template-picker';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Insert a KPI built from a template. */
  onPickTemplate: (templateId: KpiTemplateId) => void;
  /** Insert a blank custom KPI (legacy actual/target/format). */
  onPickCustom: () => void;
  /** Insert a KPI seeded from a generic Insights metric source. */
  onPickMetric?: (option: InsightsMetricOption) => void;
}

/**
 * Two-step Add KPI flow:
 *   1. Chooser  → Template KPI (recommended) vs New KPI.
 *   2. Metric picker → ALL eligible Insights metrics, grouped by source
 *      area. Includes curated templates plus every stat-type metric from
 *      the Insights metric registry (Pipeline & Deals, QuickBooks,
 *      HubSpot, cross-source, custom). Charts are intentionally excluded.
 * Picking "New KPI" inserts a blank manual KPI and closes the modal; the
 * caller's existing manual editor takes over from there.
 */
export function AddKpiDialog({ open, onClose, onPickTemplate, onPickCustom, onPickMetric }: Props) {
  const [step, setStep] = useState<Step>('chooser');
  const [query, setQuery] = useState('');
  const { metrics: customMetrics } = useCustomMetrics();
  const groups = useMemo(
    () => buildInsightsMetricOptions(customMetrics ?? []),
    [customMetrics],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({
        source: g.source,
        options: g.options.filter(o =>
          o.label.toLowerCase().includes(q)
          || (o.description ?? '').toLowerCase().includes(q)
          || o.source.toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.options.length > 0);
  }, [groups, query]);
  const totalCount = useMemo(() => flattenInsightsMetricOptions(filtered).length, [filtered]);

  const handlePick = (opt: InsightsMetricOption) => {
    if (opt.kind === 'template' && opt.template) {
      onPickTemplate(opt.template.id);
    } else if (onPickMetric) {
      onPickMetric(opt);
    } else {
      // Fallback: caller didn't wire onPickMetric — at least insert a custom KPI.
      onPickCustom();
    }
    onClose();
  };

  // Reset to the chooser every time the dialog opens so users always start
  // on the recommended-first screen (per spec).
  useEffect(() => { if (open) { setStep('chooser'); setQuery(''); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className={step === 'template-picker' ? 'max-w-lg' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'template-picker' && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setStep('chooser')}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <span>{step === 'chooser' ? 'Add KPI' : 'Pick a metric'}</span>
          </DialogTitle>
          <DialogDescription>
            {step === 'chooser'
              ? 'Choose a pre-configured KPI template or create a new KPI from scratch.'
              : 'Any metric or chart from any Insights dashboard can be added as a KPI. Chart sources render as a single resolved value (never the chart itself).'}
          </DialogDescription>
        </DialogHeader>

        {step === 'chooser' && (
          <div className="space-y-2.5">
            {/* Recommended: Template KPI */}
            <ChooserCard
              recommended
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="Template KPI"
              description="Start with a pre-configured KPI template. Built-in logic, filtering, and drilldown."
              onClick={() => setStep('template-picker')}
              autoFocus
            />
            {/* Manual fallback */}
            <ChooserCard
              icon={<Plus className="h-4 w-4 text-primary" />}
              title="New KPI"
              description="Create a KPI manually from custom inputs and logic."
              onClick={() => { onPickCustom(); onClose(); }}
            />
          </div>
        )}

        {step === 'template-picker' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search metrics…"
                className="w-full rounded-md border border-border/60 bg-muted/20 pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
              {totalCount} metric{totalCount === 1 ? '' : 's'} available
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
              {filtered.map(group => (
                <div key={group.source} className="space-y-1.5">
                  <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.source}
                  </div>
                  <div className="space-y-1.5">
                    {group.options.map(opt => {
                      const isTemplate = opt.kind === 'template';
                        const isChart = !!opt.derivedFromChart;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handlePick(opt)}
                          className="w-full text-left rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 hover:border-primary/50 hover:bg-muted/40 transition group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {isTemplate
                                  ? <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                                    : isChart
                                      ? <BarChart3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      : <Gauge className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                <span className="text-sm font-semibold truncate">{opt.label}</span>
                                {isTemplate && (
                                  <span className="rounded-sm bg-primary/15 text-primary text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                                    Template
                                  </span>
                                )}
                                  {isChart && (
                                    <span className="rounded-sm bg-muted text-muted-foreground text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                                      Chart → value
                                    </span>
                                  )}
                                {opt.supportsDrilldown && !isTemplate && (
                                  <span className="rounded-sm bg-muted text-muted-foreground text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                                    Drilldown
                                  </span>
                                )}
                              </div>
                              {opt.description && (
                                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{opt.description}</div>
                              )}
                              <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                                  {opt.source} · {opt.format}{opt.resolution ? ` · ${opt.resolution}` : ''}
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-6">
                  No metrics match “{query}”.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChooserCard({
  icon, title, description, onClick, recommended, autoFocus,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  recommended?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className={
        'group w-full text-left rounded-md border px-3.5 py-3 transition ' +
        (recommended
          ? 'border-primary/50 bg-primary/5 hover:bg-primary/10 ring-1 ring-primary/20'
          : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-muted/40')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold">{title}</span>
            {recommended && (
              <span className="rounded-sm bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5">
                Recommended
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0" />
      </div>
    </button>
  );
}