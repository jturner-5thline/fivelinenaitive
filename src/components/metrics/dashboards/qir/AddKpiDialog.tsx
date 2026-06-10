import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles, Plus, Search, Gauge, BarChart3, Check } from 'lucide-react';
import { type KpiTemplateId } from './kpiTemplates';
import {
  buildInsightsMetricOptions,
  flattenInsightsMetricOptions,
  type InsightsMetricOption,
} from './insightsMetricRegistry';
import { useCustomMetrics } from '@/hooks/useCustomMetrics';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type LiveMetricPeriod, useInsightsLiveMetricValue } from './useInsightsLiveMetricValue';

interface Props {
  open: boolean;
  onClose: () => void;
  reportPeriod?: LiveMetricPeriod | null;
  /** Insert a KPI built from a template. */
  onPickTemplate: (templateId: KpiTemplateId) => void;
  /** Insert a blank custom KPI (legacy actual/target/format). */
  onPickCustom: () => void;
  /** Insert a KPI seeded from a generic Insights metric source. */
  onPickMetric?: (option: InsightsMetricOption) => void;
}

/**
 * Full-size Add KPI modal — every eligible Insights metric is rendered as
 * a selectable widget tile that visually previews the underlying datapoint
 * (KPI tile, mini chart, template). Supports multi-select and a single
 * "Add Selected Widgets" action. Search + source filter preserved.
 */
export function AddKpiDialog({ open, onClose, onPickTemplate, onPickCustom, onPickMetric }: Props) {
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { metrics: customMetrics } = useCustomMetrics();
  const groups = useMemo(
    () => buildInsightsMetricOptions(customMetrics ?? []),
    [customMetrics],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map(g => ({
        source: g.source,
        options: g.options.filter(o => {
          if (activeSource && g.source !== activeSource) return false;
          if (!q) return true;
          return o.label.toLowerCase().includes(q)
            || (o.description ?? '').toLowerCase().includes(q)
            || o.source.toLowerCase().includes(q);
        }),
      }))
      .filter(g => g.options.length > 0);
  }, [groups, query, activeSource]);
  const flatOptions = useMemo(() => flattenInsightsMetricOptions(filtered), [filtered]);
  const totalCount = flatOptions.length;

  const optionById = useMemo(() => {
    const map = new Map<string, InsightsMetricOption>();
    flattenInsightsMetricOptions(groups).forEach(o => map.set(o.id, o));
    return map;
  }, [groups]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAddSelected = () => {
    selectedIds.forEach(id => {
      const opt = optionById.get(id);
      if (!opt) return;
      if (opt.kind === 'template' && opt.template) {
        onPickTemplate(opt.template.id);
      } else if (onPickMetric) {
        onPickMetric(opt);
      } else {
        onPickCustom();
      }
    });
    onClose();
  };

  useEffect(() => { if (open) { setQuery(''); setActiveSource(null); setSelectedIds([]); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[1200px] w-[95vw] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden"
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>Add Widgets</DialogTitle>
              <DialogDescription className="mt-1">
                Pick one or more widgets to add. Each tile previews the live datapoint — KPI cards, mini charts, and templates from every Insights dashboard.
              </DialogDescription>
            </div>
            <div className="shrink-0 hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onPickCustom(); onClose(); }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> New blank KPI
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search widgets, metrics, dashboards…"
                className="w-full rounded-md border border-border/60 bg-muted/20 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <SourceChip active={activeSource === null} onClick={() => setActiveSource(null)}>All sources</SourceChip>
              {groups.map(g => (
                <SourceChip
                  key={g.source}
                  active={activeSource === g.source}
                  onClick={() => setActiveSource(activeSource === g.source ? null : g.source)}
                >
                  {g.source} <span className="opacity-60">·{g.options.length}</span>
                </SourceChip>
              ))}
              <div className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {totalCount} widget{totalCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable widget gallery */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-20">
              No widgets match “{query}”.
            </div>
          ) : (
            <div className="space-y-7">
              {filtered.map(group => (
                <div key={group.source}>
                  <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {group.source}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {group.options.map(opt => (
                      <WidgetTile
                        key={opt.id}
                        option={opt}
                        selected={selectedIds.includes(opt.id)}
                        onToggle={() => toggleSelect(opt.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Persistent action footer */}
        <div className="shrink-0 border-t border-border/60 bg-card/50 px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectedIds.length > 0
              ? <><span className="text-foreground font-semibold">{selectedIds.length}</span> selected</>
              : 'Select one or more widgets to add'}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={handleAddSelected}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {selectedIds.length > 0 ? `${selectedIds.length} ` : ''}Selected Widget{selectedIds.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
        active
          ? 'border-primary/60 bg-primary/15 text-primary'
          : 'border-border/60 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Format a numeric value using the report's live KPI formatting semantics. */
function formatLiveValue(value: number, format: InsightsMetricOption['format']): string {
  if (!Number.isFinite(value)) return '—';
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.trunc(value));
  }
  if (format === 'percentage') {
    const pct = Math.abs(value) <= 1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function WidgetTile({
  option, selected, onToggle, reportPeriod,
}: { option: InsightsMetricOption; selected: boolean; onToggle: () => void; reportPeriod?: LiveMetricPeriod | null }) {
  const isTemplate = option.kind === 'template';
  const isCustom = option.kind === 'custom-metric';
  const isChart = !!option.derivedFromChart;
  const TypeIcon = isTemplate ? Sparkles : isChart ? BarChart3 : Gauge;
  const typeLabel = isTemplate ? 'Template' : isChart ? 'Chart → value' : 'KPI';

  // Pull a real live value from the canonical resolver. Templates and
  // custom metrics don't have an Insights metric source id, so they
  // skip the lookup and render an explicit "no live preview" state
  // instead of fabricating a number.
  const live = useInsightsLiveMetricValue(option.metricSourceId ?? null, reportPeriod ?? null);

  let valueDisplay: React.ReactNode;
  let captionDisplay: string;
  if (isTemplate) {
    valueDisplay = <span className="text-[11px] text-muted-foreground">Template · live on add</span>;
    captionDisplay = 'Computed when added';
  } else if (isCustom) {
    valueDisplay = <span className="text-[11px] text-muted-foreground">Custom formula</span>;
    captionDisplay = 'Evaluated on add';
  } else if (!live.supported) {
    valueDisplay = <span className="text-[11px] text-muted-foreground">No live data available</span>;
    captionDisplay = 'Unmapped source';
  } else if (live.status === 'loading' || live.value === undefined) {
    valueDisplay = <span className="text-[11px] text-muted-foreground animate-pulse">Loading…</span>;
    captionDisplay = live.sourceSurface ? `from ${live.sourceSurface}` : 'Loading live value';
  } else {
    valueDisplay = (
      <span className="text-xl font-bold tabular-nums">
        {formatLiveValue(live.value, option.format)}
      </span>
    );
    captionDisplay = live.sourceSurface ? `Live · ${live.sourceSurface}` : 'Live value';
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'group relative text-left rounded-xl border bg-card/40 hover:bg-card/60 transition overflow-hidden',
        selected
          ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
          : 'border-border/60 hover:border-primary/40',
      )}
    >
      {/* Selection check */}
      <div
        className={cn(
          'absolute top-2 right-2 z-10 h-5 w-5 rounded-md border flex items-center justify-center transition',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border/70 bg-background/80 text-transparent group-hover:border-primary/60',
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </div>

      {/* Widget-style preview */}
      <div className="p-3.5">
        <div className="h-[88px] rounded-lg bg-muted/30 border border-border/40 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
            {option.label}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 min-h-[28px]">
            {valueDisplay}
          </div>
          <div className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">{captionDisplay}</div>
        </div>
      </div>

      {/* Meta */}
      <div className="px-3.5 pb-3 -mt-1 space-y-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', isTemplate ? 'text-primary' : 'text-muted-foreground')} />
          <span className="text-sm font-semibold truncate">{option.label}</span>
        </div>
        {option.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{option.description}</p>
        )}
        <div className="flex items-center gap-1 flex-wrap pt-0.5">
          <Pill tone={isTemplate ? 'primary' : 'muted'}>{typeLabel}</Pill>
          <Pill tone="muted">{option.source}</Pill>
          {option.resolution && <Pill tone="muted">{option.resolution}</Pill>}
        </div>
      </div>
    </button>
  );
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'primary' | 'muted' }) {
  return (
    <span
      className={cn(
        'rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        tone === 'primary' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
