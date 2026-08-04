import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ApiEfficiencyFilters,
  EMPTY_EFFICIENCY_FILTERS,

  resolveEfficiencyWindow,
  type EfficiencyFilterState,
} from "@/components/admin/ApiEfficiencyFilters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Efficiency-by-activity view. Volume alone always grows with adoption, so
 * every column here is a *ratio* (tokens per call, calls per deal, calls per
 * recording, waste/skip/error rates) plus a delta against the immediately
 * preceding period of the same length. Rising volume with flat ratios = healthy
 * growth; rising ratios = the integration is getting less efficient.
 */

interface LlmRow {
  feature: string;
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  errors: number;
  cache_read_tokens: number;
  distinct_users: number;
  distinct_deals: number;
  distinct_days: number;
  tokens_per_call: number | null;
  error_rate: number | null;
  cache_read_share: number | null;
  calls_per_deal: number | null;
  calls_per_user: number | null;
  prev_calls: number;
  prev_tokens_per_call: number | null;
  prev_calls_per_deal: number | null;
}

interface ClaapRow {
  source: string;
  operation: string;
  calls: number;
  skipped: number;
  errors: number;
  distinct_recordings: number;
  distinct_deals: number;
  distinct_days: number;
  calls_per_recording: number | null;
  redundant_calls: number;
  skip_rate: number | null;
  error_rate: number | null;
  avg_latency_ms: number | null;
  prev_calls: number;
  prev_calls_per_recording: number | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function ratio(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

/** Column header with an explanation on hover. */
function HeadWithHelp({
  label,
  help,
  align = "right",
}: {
  label: string;
  help: string;
  align?: "left" | "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 cursor-help ${
              align === "right" ? "justify-end" : ""
            }`}
          >
            {label}
            <HelpCircle className="h-3 w-3 opacity-50" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
          {help}
        </TooltipContent>
      </Tooltip>
    </TableHead>
  );
}

/**
 * Delta chip: lower is better for every ratio we show here.
 * `metric` and `rangeLabel` are only used to phrase the tooltip.
 */
function Delta({
  current,
  previous,
  metric,
  rangeLabel,
  lowerIsBetter = true,
  neutral = false,
  format = (v: number) => fmt(v),
}: {
  current: number | null;
  previous: number | null;
  metric: string;
  rangeLabel: string;
  lowerIsBetter?: boolean;
  /** Volume-style metric: up/down isn't good or bad on its own. */
  neutral?: boolean;
  format?: (v: number) => string;
}) {
  if (current == null || previous == null || Number(previous) === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground text-[11px] cursor-help">new</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[260px] text-xs leading-relaxed">
          No {metric} recorded in the previous {rangeLabel}, so there's nothing to compare against
          yet.
        </TooltipContent>
      </Tooltip>
    );
  }

  const cur = Number(current);
  const prev = Number(previous);
  const change = ((cur - prev) / prev) * 100;
  const flat = Math.abs(change) < 5;
  const up = change > 0;
  const worse = lowerIsBetter ? up : !up;

  const direction = flat
    ? `held roughly steady (within 5%)`
    : `${up ? "rose" : "fell"} ${Math.abs(change).toFixed(0)}%`;
  const verdict = flat
    ? "No meaningful change in efficiency."
    : neutral
      ? "Volume change on its own isn't good or bad — check the ratio columns to see whether cost per unit of work moved with it."
      : worse
        ? "Amber: this activity got less efficient — worth caching, batching or pre-filtering."
        : "Green: this activity got more efficient.";

  const tip = (
    <>
      <div className="font-medium">
        {metric} {direction}
      </div>
      <div className="mt-1 text-muted-foreground">
        {format(prev)} in the previous {rangeLabel} → {format(cur)} now.
      </div>
      <div className="mt-1">{verdict}</div>
    </>
  );

  if (flat) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground cursor-help">
            <Minus className="h-3 w-3" /> flat
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[280px] text-xs leading-relaxed">
          {tip}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-0.5 text-[11px] cursor-help ${
            worse ? "text-amber-300" : "text-emerald-400"
          }`}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(change).toFixed(0)}%
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-[280px] text-xs leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ApiEfficiencyByActivityCard({
  start,
  end,
  rangeLabel,
  reloadKey,
  onSelectFeature,
}: {
  start: Date;
  end: Date;
  rangeLabel: string;
  reloadKey: number;
  onSelectFeature?: (provider: string, feature: string) => void;
}) {
  const [llm, setLlm] = useState<LlmRow[]>([]);
  const [claap, setClaap] = useState<ClaapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<EfficiencyFilterState>(EMPTY_EFFICIENCY_FILTERS);

  // Filters can override the page-level window; otherwise we inherit it.
  const win = resolveEfficiencyWindow(filters, start, end);
  const effectiveRangeLabel = win.label || rangeLabel;
  const startIso = win.start.toISOString();
  const endIso = win.end.toISOString();

  const userIds = filters.userIds.length ? filters.userIds : null;
  const dealClasses = filters.dealClasses.length ? filters.dealClasses : null;
  const engagementTypes = filters.engagementTypes.length ? filters.engagementTypes : null;
  const dealFilterOn = !!dealClasses || !!engagementTypes;
  // Serialized so the effect only refires when the selection actually changes.
  const filterKey = JSON.stringify([userIds, dealClasses, engagementTypes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [uids, classes, engagements] = JSON.parse(filterKey) as [
          string[] | null,
          string[] | null,
          string[] | null,
        ];
        const [llmRes, claapRes] = await Promise.all([
          supabase.rpc("api_usage_efficiency_by_activity" as never, {
            _start: startIso,
            _end: endIso,
            _user_ids: uids,
            _deal_classes: classes,
            _engagement_types: engagements,
          } as never),
          supabase.rpc("claap_usage_efficiency_by_activity" as never, {
            _start: startIso,
            _end: endIso,
            _deal_classes: classes,
            _engagement_types: engagements,
          } as never),
        ]);
        if (cancelled) return;
        if (llmRes.error) throw llmRes.error;
        if (claapRes.error) throw claapRes.error;
        setLlm((llmRes.data as unknown as LlmRow[]) ?? []);
        setClaap((claapRes.data as unknown as ClaapRow[]) ?? []);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load efficiency");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startIso, endIso, reloadKey, filterKey]);

  return (
    <TooltipProvider delayDuration={150}>
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-medium">Efficiency by activity</h2>
        <p className="text-xs text-muted-foreground">
          Cost per unit of work over the last {effectiveRangeLabel}, not raw volume — so these stay
          comparable as usage grows. Arrows compare against the previous {effectiveRangeLabel};
          amber means the activity got less efficient.
        </p>
      </div>

      <ApiEfficiencyFilters
        value={filters}
        onChange={setFilters}
        optionsStart={start}
        optionsEnd={end}
        reloadKey={reloadKey}
      />

      {dealFilterOn && (
        <div className="px-4 pt-3 text-xs text-amber-300/90">
          Deal-type filters only apply to calls that are tagged with a deal — activities that run
          outside a deal context are hidden while a deal filter is active.
        </div>
      )}

      {error && <div className="px-4 py-3 text-sm text-red-300">{error}</div>}

      <Tabs defaultValue="llm">
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="llm">AI / LLM</TabsTrigger>
            <TabsTrigger value="claap">Claap</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="llm" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead>Provider</TableHead>
                <HeadWithHelp
                  label="Calls"
                  help={`Total model requests this activity made in the last ${effectiveRangeLabel}. Volume alone is expected to grow with adoption — the ratios below are what tell you if it's getting expensive.`}
                />
                <HeadWithHelp
                  label="Tokens / call"
                  help="Average prompt + completion tokens per request. This is prompt weight: a rising number means the context being sent is growing, which is the main driver of cost per call."
                />
                <HeadWithHelp
                  label="Calls / deal"
                  help="How many times this activity re-ran against the same deal. Near 1.0 means each deal is processed once; higher means repeat work that caching, deduping or a pre-filter could remove."
                />
                <HeadWithHelp
                  label="Calls / user"
                  help="Average requests per distinct user in this range. Useful for spotting an activity that fires on every page view or keystroke rather than on demand."
                />
                <HeadWithHelp
                  label="Cache read"
                  help="Share of input tokens served from the provider's prompt cache. Cached tokens bill at a fraction of normal rate, so higher is better — 40%+ shows green."
                />
                <HeadWithHelp
                  label="Errors"
                  help="Share of calls that failed. Failed calls are usually still billed and often get retried, so any sustained error rate is pure waste."
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && llm.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && llm.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    No LLM calls recorded in this range.
                  </TableCell>
                </TableRow>
              )}
              {llm.map((r) => (
                <TableRow
                  key={`eff-${r.feature}-${r.provider}`}
                  className={onSelectFeature ? "cursor-pointer" : undefined}
                  onClick={() => onSelectFeature?.(r.provider, r.feature)}
                >
                  <TableCell className="font-medium">{r.feature}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {r.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.calls)}
                    <div>
                      <Delta
                        current={r.calls}
                        previous={r.prev_calls}
                        metric="Call volume"
                        rangeLabel={effectiveRangeLabel}
                        lowerIsBetter={false}
                        neutral
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.tokens_per_call)}
                    <div>
                      <Delta
                        current={r.tokens_per_call}
                        previous={r.prev_tokens_per_call}
                        metric="Tokens per call"
                        rangeLabel={effectiveRangeLabel}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {ratio(r.calls_per_deal)}
                    <div>
                      <Delta
                        current={r.calls_per_deal}
                        previous={r.prev_calls_per_deal}
                        metric="Calls per deal"
                        rangeLabel={effectiveRangeLabel}
                        format={(v) => ratio(v)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{ratio(r.calls_per_user)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.cache_read_share == null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          Number(r.cache_read_share) >= 40 ? "text-emerald-400" : undefined
                        }
                      >
                        {pct(r.cache_read_share)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.errors) > 0 ? (
                      <span className="text-red-400">{pct(r.error_rate)}</span>
                    ) : (
                      "0%"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Tokens / call is prompt weight, calls / deal is how many times an activity re-runs on
            the same work. Both should stay flat as volume rises — a climbing ratio is where to
            cache, batch or pre-filter.
          </p>
        </TabsContent>

        <TabsContent value="claap" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead>Operation</TableHead>
                <HeadWithHelp
                  label="Calls"
                  help={`Claap API requests this activity actually sent in the last ${effectiveRangeLabel}. These count against the 1,000/day quota.`}
                />
                <HeadWithHelp
                  label="Recordings"
                  help="Distinct recordings touched. This is the real unit of work — the useful output those calls produced."
                />
                <HeadWithHelp
                  label="Calls / recording"
                  help="The core Claap efficiency number. 1.0 means every call fetched a new recording; 2.0 means each recording was fetched twice, so half the quota went to re-fetching content you already had."
                />
                <HeadWithHelp
                  label="Redundant"
                  help="Calls beyond the first for a recording already fetched in this range. These are the quota spend you could reclaim with caching or a hydration guard."
                />
                <HeadWithHelp
                  label="Skipped"
                  help="Requests the cache or hydration guard avoided entirely — work done without spending quota. Higher is better; the percentage is the share of attempts that were skipped."
                />
                <HeadWithHelp
                  label="Errors"
                  help="Failed requests, including 429 rate limits. These usually still count against quota and trigger retries, so they compound quickly."
                />
                <HeadWithHelp
                  label="Avg latency"
                  help="Average round-trip time per call. Climbing latency alongside stable volume usually means Claap is throttling this activity."
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && claap.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && claap.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    No Claap calls recorded in this range.
                  </TableCell>
                </TableRow>
              )}
              {claap.map((r) => (
                <TableRow key={`claap-eff-${r.source}-${r.operation}`}>
                  <TableCell className="font-medium">{r.source}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.operation}</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.calls)}
                    <div>
                      <Delta
                        current={r.calls}
                        previous={r.prev_calls}
                        metric="Call volume"
                        rangeLabel={effectiveRangeLabel}
                        lowerIsBetter={false}
                        neutral
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.distinct_recordings)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {ratio(r.calls_per_recording)}
                    <div>
                      <Delta
                        current={r.calls_per_recording}
                        previous={r.prev_calls_per_recording}
                        metric="Calls per recording"
                        rangeLabel={effectiveRangeLabel}
                        format={(v) => ratio(v)}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.redundant_calls) > 0 ? (
                      <span className="text-amber-300">{fmt(r.redundant_calls)}</span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.skipped)}
                    <span className="text-muted-foreground text-[11px]"> ({pct(r.skip_rate)})</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.errors) > 0 ? (
                      <span className="text-red-400">
                        {fmt(r.errors)} ({pct(r.error_rate)})
                      </span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.avg_latency_ms == null ? "—" : `${fmt(r.avg_latency_ms)} ms`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Calls / recording is the Claap efficiency number: 1.0 means every call fetched a new
            recording. Anything above that is re-fetching the same content — "Redundant" counts
            those calls, and skips are calls the cache avoided entirely.
          </p>
        </TabsContent>
      </Tabs>
    </Card>
    </TooltipProvider>
  );
}
