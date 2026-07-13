import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles, Plus, Search, Gauge, BarChart3, Check, Settings, CalendarRange } from 'lucide-react';
import { type KpiTemplateId } from './kpiTemplates';
import { BrandAwarenessDataEditor } from './BrandAwarenessDataEditor';
import {
  buildInsightsMetricOptions,
  flattenInsightsMetricOptions,
  type InsightsMetricOption,
} from './insightsMetricRegistry';
import { useCustomMetrics } from '@/hooks/useCustomMetrics';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type LiveMetricPeriod, useInsightsLiveMetricValue, getMonthlyBreakdownPeriods, getPriorPeriod } from './useInsightsLiveMetricValue';
import { useInsightsTargets } from '@/hooks/useInsightsTargets';
import { TrendingUp, TrendingDown, Minus, Target } from 'lucide-react';
import { DASHBOARD_WIDGETS, groupDashboardWidgets, type DashboardWidgetEntry } from './dashboardWidgetRegistry';
import { LayoutDashboard } from 'lucide-react';

/**
 * Canonical set of metric source ids that have a live resolver wired up
 * in `useInsightsLiveMetricValue`. Keep in sync with that hook — any id
 * NOT in this set renders as "Unmapped source" and is now filtered out
 * of the Add Widgets picker.
 *
 * Exceptions preserved by explicit id below (see `isOptionKept`):
 *  - Templates and custom-metric options (always kept — they compute on add)
 *  - `finserv-revenue-per-hour` / `finserv-profit-per-hour` (user request —
 *    sourced from the FinServ Financial Metrics dashboard even though
 *    they are not in the canonical live resolver)
 */
const SUPPORTED_LIVE_METRIC_IDS = new Set<string>([
  // Weekly Rundown
  'active-pipeline', 'closed-won', 'total-fees', 'avg-deal-size',
  // Controller Dashboard (qb-* scalar tiles)
  'qb-total-revenue', 'qb-accounts-receivable', 'qb-total-payments',
  'qb-active-customers', 'qb-collection-rate', 'qb-overdue-amount',
  'qb-total-expenses', 'qb-total-ap', 'qb-net-income',
  'qb-active-vendors', 'qb-total-estimates', 'qb-total-credit-memos',
  // HubSpot
  'hs-total-deals', 'hs-total-deal-value', 'hs-deals-won', 'hs-deals-lost',
  'hs-win-rate', 'hs-avg-deal-size', 'hs-total-contacts', 'hs-total-companies',
  // Cross-source
  'xs-revenue-per-deal', 'xs-ar-per-active-deal', 'xs-collection-rate-by-entity',
  // FinServ Financial Metrics (pipeline snapshot tiles)
  'finserv-total-mrr', 'finserv-active-client-count',
  // FinServ Financial Metrics (per-hour tiles)
  'finserv-revenue-per-hour', 'finserv-profit-per-hour',
  // FinServ Financial Metrics (utilization)
  'finserv-utilization',
  // FinServ Financial Metrics (avg revenue / client)
  'finserv-avg-revenue-per-client',
  // Debt Advisory (period-aware stage-entry tiles)
  'da-deals-on-board-count', 'da-deals-on-board-dollars',
  'da-proposals-issued-count', 'da-proposals-issued-dollars',
  'da-debt-deals-signed-count', 'da-debt-deals-signed-dollars',
  'da-terms-issued-count', 'da-terms-issued-dollars',
  'da-terms-signed-count', 'da-terms-signed-dollars',
  'da-deals-closed-count', 'da-deals-closed-dollars',
]);

const ALWAYS_KEPT_METRIC_IDS = new Set<string>([
  'finserv-revenue-per-hour',
  'finserv-profit-per-hour',
  'finserv-active-client-count',
  'finserv-total-mrr',
  'finserv-avg-revenue-per-client',
  // Brand Awareness placeholder tiles — no live resolver yet.
  'ba-website-users',
  'ba-seo-clicks',
  'ba-seo-impressions',
  'ba-linkedin-impressions',
  'ba-linkedin-interactions',
  'ba-ai-search-readiness-score',
  'ba-market-awareness-score',
]);

function isOptionKept(opt: InsightsMetricOption): boolean {
  if (opt.kind === 'template' || opt.kind === 'custom-metric') return true;
  const id = opt.metricSourceId ?? '';
  if (ALWAYS_KEPT_METRIC_IDS.has(id)) return true;
  return SUPPORTED_LIVE_METRIC_IDS.has(id);
}

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
  /** Insert a full dashboard widget by registry id. */
  onPickDashboardWidget?: (widgetId: string) => void;
}

/**
 * Full-size Add KPI modal — every eligible Insights metric is rendered as
 * a selectable widget tile that visually previews the underlying datapoint
 * (KPI tile, mini chart, template). Supports multi-select and a single
 * "Add Selected Widgets" action. Search + source filter preserved.
 */
export function AddKpiDialog({ open, onClose, reportPeriod, onPickTemplate, onPickCustom, onPickMetric, onPickDashboardWidget }: Props) {
  const [query, setQuery] = useState('');
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baEditorOpen, setBaEditorOpen] = useState(false);
  const [mode, setMode] = useState<'kpi' | 'widget'>('kpi');
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
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
          if (!isOptionKept(o)) return false;
          if (activeSource && g.source !== activeSource) return false;
          if (!q) return true;
          return o.label.toLowerCase().includes(q)
            || (o.description ?? '').toLowerCase().includes(q)
            || o.source.toLowerCase().includes(q);
        }),
      }))
      .filter(g => g.options.length > 0);
  }, [groups, query, activeSource]);
  // Source chips should reflect only kept (mapped) options so counts match
  // the gallery. Search query is intentionally ignored here so the chip
  // list is stable while the user types.
  const chipGroups = useMemo(
    () => groups
      .map(g => ({ source: g.source, count: g.options.filter(isOptionKept).length }))
      .filter(g => g.count > 0),
    [groups],
  );
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

  useEffect(() => {
    if (open) {
      setQuery(''); setActiveSource(null); setSelectedIds([]);
      setSelectedWidgetIds([]); setMode('kpi');
    }
  }, [open]);

  // ── Dashboard Widgets mode ───────────────────────────────────────────
  const widgetGroups = useMemo(() => groupDashboardWidgets(), []);
  const filteredWidgetGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return widgetGroups
      .map(g => ({
        dashboard: g.dashboard,
        widgets: g.widgets.filter(w => {
          if (activeSource && g.dashboard !== activeSource) return false;
          if (!q) return true;
          return w.label.toLowerCase().includes(q)
            || (w.description ?? '').toLowerCase().includes(q)
            || w.dashboard.toLowerCase().includes(q);
        }),
      }))
      .filter(g => g.widgets.length > 0);
  }, [widgetGroups, query, activeSource]);
  const widgetChipGroups = useMemo(
    () => widgetGroups.map(g => ({ source: g.dashboard, count: g.widgets.length })),
    [widgetGroups],
  );
  const totalWidgetCount = filteredWidgetGroups.reduce((s, g) => s + g.widgets.length, 0);

  const toggleSelectWidget = (id: string) => {
    setSelectedWidgetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAddSelectedWidgets = () => {
    if (!onPickDashboardWidget) { onClose(); return; }
    selectedWidgetIds.forEach(id => onPickDashboardWidget(id));
    onClose();
  };

  const isWidgetMode = mode === 'widget';
  const activeSelectedCount = isWidgetMode ? selectedWidgetIds.length : selectedIds.length;

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

          {/* Mode toggle */}
          <div className="mt-3 inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 p-1 self-start">
            <button
              type="button"
              onClick={() => { setMode('kpi'); setQuery(''); setActiveSource(null); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                mode === 'kpi' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Gauge className="h-3.5 w-3.5" /> KPI Tiles
            </button>
            <button
              type="button"
              onClick={() => { setMode('widget'); setQuery(''); setActiveSource(null); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                mode === 'widget' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard Widgets
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isWidgetMode ? 'Search dashboard widgets…' : 'Search widgets, metrics, dashboards…'}
                className="w-full rounded-md border border-border/60 bg-muted/20 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <SourceChip active={activeSource === null} onClick={() => setActiveSource(null)}>All sources</SourceChip>
              {(isWidgetMode ? widgetChipGroups : chipGroups).map(g => (
                <SourceChip
                  key={g.source}
                  active={activeSource === g.source}
                  onClick={() => setActiveSource(activeSource === g.source ? null : g.source)}
                >
                  {g.source} <span className="opacity-60">·{g.count}</span>
                </SourceChip>
              ))}
              <div className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground/70">
                {(isWidgetMode ? totalWidgetCount : totalCount)} widget{(isWidgetMode ? totalWidgetCount : totalCount) === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable widget gallery */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {isWidgetMode ? (
            filteredWidgetGroups.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-20">
                No dashboard widgets match “{query}”.
              </div>
            ) : (
              <div className="space-y-7">
                {!onPickDashboardWidget && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Dashboard widgets can be inserted inline in the Narrative editor. Open the Narrative section and use its “Insert widget” action.
                  </div>
                )}
                {filteredWidgetGroups.map(group => (
                  <div key={group.dashboard}>
                    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {group.dashboard}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.widgets.map(w => (
                        <DashboardWidgetTile
                          key={w.id}
                          entry={w}
                          selected={selectedWidgetIds.includes(w.id)}
                          onToggle={() => toggleSelectWidget(w.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-20">
              No widgets match “{query}”.
            </div>
          ) : (
            <div className="space-y-7">
              {activeSource === 'Brand Awareness' && (
                <div className="flex items-center justify-end -mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setBaEditorOpen(true)}
                    aria-label="Edit Brand Awareness data"
                    title="Edit Brand Awareness data"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Edit data
                  </Button>
                </div>
              )}
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
                        reportPeriod={reportPeriod}
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
            {activeSelectedCount > 0
              ? <><span className="text-foreground font-semibold">{activeSelectedCount}</span> selected</>
              : 'Select one or more widgets to add'}
          </div>
          <div className="flex items-center gap-2">
            {activeSelectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => isWidgetMode ? setSelectedWidgetIds([]) : setSelectedIds([])}>
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={activeSelectedCount === 0 || (isWidgetMode && !onPickDashboardWidget)}
              onClick={isWidgetMode ? handleAddSelectedWidgets : handleAddSelected}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {activeSelectedCount > 0 ? `${activeSelectedCount} ` : ''}Selected Widget{activeSelectedCount === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </DialogContent>
      <BrandAwarenessDataEditor open={baEditorOpen} onClose={() => setBaEditorOpen(false)} />
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
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString('en-US')}K`;
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
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
  const [showMonthly, setShowMonthly] = useState(false);
  const monthly = getMonthlyBreakdownPeriods(reportPeriod ?? null);
  const canToggleMonthly = !isTemplate && !isCustom && !!option.metricSourceId && !!monthly;
  const renderMonthly = showMonthly && canToggleMonthly;

  // Pull a real live value from the canonical resolver. Templates and
  // custom metrics don't have an Insights metric source id, so they
  // skip the lookup and render an explicit "no live preview" state
  // instead of fabricating a number.
  const live = useInsightsLiveMetricValue(option.metricSourceId ?? null, reportPeriod ?? null);
  const priorPeriod = useMemo(() => getPriorPeriod(reportPeriod ?? null), [reportPeriod?.start, reportPeriod?.end]);
  const priorLive = useInsightsLiveMetricValue(option.metricSourceId ?? null, priorPeriod);
  const targetsQuery = useInsightsTargets();
  const planTarget = useMemo(() => {
    if (!option.metricSourceId) return null;
    const rows = targetsQuery.data ?? [];
    // Prefer a target scoped to a month within the report period; otherwise use the most recent unscoped one.
    const withinPeriod = reportPeriod
      ? rows.filter(r => r.metric_key === option.metricSourceId && r.period_month
          && r.period_month >= reportPeriod.start && r.period_month <= reportPeriod.end)
      : [];
    if (withinPeriod.length > 0) {
      const sum = withinPeriod.reduce((s, r) => s + Number(r.target_value || 0), 0);
      return sum;
    }
    const unscoped = rows.find(r => r.metric_key === option.metricSourceId && !r.period_month);
    return unscoped ? Number(unscoped.target_value || 0) : null;
  }, [targetsQuery.data, option.metricSourceId, reportPeriod?.start, reportPeriod?.end]);

  let valueDisplay: React.ReactNode;
  let captionDisplay: string;
  if (isTemplate) {
    valueDisplay = <span className="text-[11px] text-muted-foreground">Template · live on add</span>;
    captionDisplay = 'Computed when added';
  } else if (isCustom) {
    valueDisplay = <span className="text-[11px] text-muted-foreground">Custom formula</span>;
    captionDisplay = 'Evaluated on add';
  } else if (!live.supported && ALWAYS_KEPT_METRIC_IDS.has(option.metricSourceId ?? '')) {
    // Explicitly-kept FinServ tiles don't have a canonical live resolver in
    // `useInsightsLiveMetricValue` — they hydrate against their own hook when
    // added to the report. Surface a friendly "live on add" caption instead
    // of the generic "Unmapped source" so it doesn't look broken.
    valueDisplay = <span className="text-[11px] text-muted-foreground">Live on add</span>;
    captionDisplay = 'Live · FinServ Financial Metrics';
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

  const showComparisons = !isTemplate && !isCustom && live.status === 'ready' && live.value !== undefined && !renderMonthly;
  const currentValue = live.value ?? 0;
  const priorValue = priorLive.status === 'ready' ? priorLive.value : undefined;
  const priorDelta = priorValue !== undefined ? currentValue - priorValue : undefined;
  const priorPct = priorValue !== undefined && priorValue !== 0
    ? ((currentValue - priorValue) / Math.abs(priorValue)) * 100
    : undefined;
  const planDelta = planTarget != null && planTarget !== 0
    ? ((currentValue - planTarget) / Math.abs(planTarget)) * 100
    : null;

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

      {canToggleMonthly && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowMonthly(v => !v); }}
          aria-label={renderMonthly ? 'Show total' : 'Show monthly breakdown'}
          title={renderMonthly ? 'Show total' : 'Show monthly breakdown'}
          className={cn(
            'absolute top-2 left-2 z-10 h-5 w-5 rounded-md border flex items-center justify-center transition',
            renderMonthly
              ? 'border-primary bg-primary/20 text-primary'
              : 'border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:border-primary/60',
          )}
        >
          <CalendarRange className="h-3 w-3" />
        </button>
      )}

      {/* Widget-style preview */}
      <div className="p-3.5">
        <div className="h-[88px] rounded-lg bg-muted/30 border border-border/40 px-3 py-2 flex flex-col justify-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
            {option.label}
          </div>
          {renderMonthly ? (
            <div className="mt-1 flex items-stretch gap-1.5 min-h-[28px]">
              {monthly!.map(m => (
                <MonthlyMiniValue
                  key={m.start}
                  metricSourceId={option.metricSourceId!}
                  period={m}
                  format={option.format}
                />
              ))}
            </div>
          ) : (
            <div className="mt-1 flex items-baseline gap-1.5 min-h-[28px]">
              {valueDisplay}
            </div>
          )}
          <div className="text-[9px] text-muted-foreground/70 mt-0.5 truncate">
            {renderMonthly ? 'Monthly breakdown' : captionDisplay}
          </div>
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
        {showComparisons && (
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <PlanChip planTarget={planTarget} planDelta={planDelta} format={option.format} />
            <PriorChip
              priorValue={priorValue}
              priorPct={priorPct}
              priorDelta={priorDelta}
              format={option.format}
              loading={priorLive.status === 'loading'}
              supported={priorLive.supported}
            />
          </div>
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

function PlanChip({
  planTarget, planDelta, format,
}: { planTarget: number | null; planDelta: number | null; format: InsightsMetricOption['format'] }) {
  if (planTarget == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        <Target className="h-2.5 w-2.5" /> No plan set
      </span>
    );
  }
  const beat = planDelta != null && planDelta >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        beat ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
      )}
      title={`Plan: ${formatLiveValue(planTarget, format)}`}
    >
      <Target className="h-2.5 w-2.5" />
      {planDelta != null ? `${planDelta >= 0 ? '+' : ''}${planDelta.toFixed(1)}% vs plan` : 'vs plan'}
    </span>
  );
}

function PriorChip({
  priorValue, priorPct, priorDelta, format, loading, supported,
}: {
  priorValue: number | undefined;
  priorPct: number | undefined;
  priorDelta: number | undefined;
  format: InsightsMetricOption['format'];
  loading: boolean;
  supported: boolean;
}) {
  if (!supported) return null;
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70 animate-pulse">
        vs prior…
      </span>
    );
  }
  if (priorValue === undefined || priorDelta === undefined) {
    return (
      <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        <Minus className="h-2.5 w-2.5" /> No prior
      </span>
    );
  }
  const isFlat = priorDelta === 0;
  const isUp = priorDelta > 0;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        isFlat ? 'bg-muted text-muted-foreground'
          : isUp ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-red-500/15 text-red-400',
      )}
      title={`Prior: ${formatLiveValue(priorValue, format)}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {priorPct != null
        ? `${priorPct >= 0 ? '+' : ''}${priorPct.toFixed(1)}% vs prior`
        : 'vs prior'}
    </span>
  );
}

function MonthlyMiniValue({
  metricSourceId, period, format,
}: { metricSourceId: string; period: LiveMetricPeriod; format: InsightsMetricOption['format'] }) {
  const live = useInsightsLiveMetricValue(metricSourceId, period);
  const short = period.label.split(' ')[0];
  let text: React.ReactNode;
  if (live.status === 'loading' || live.value === undefined) {
    text = <span className="text-[10px] text-muted-foreground animate-pulse">…</span>;
  } else if (!live.supported) {
    text = <span className="text-[10px] text-muted-foreground">—</span>;
  } else {
    text = <span className="text-[11px] font-bold tabular-nums">{formatLiveValue(live.value, format)}</span>;
  }
  return (
    <div className="flex-1 min-w-0 text-center rounded bg-background/40 px-1 py-0.5">
      <div className="text-[8px] uppercase tracking-wide text-muted-foreground truncate">{short}</div>
      <div className="truncate">{text}</div>
    </div>
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
