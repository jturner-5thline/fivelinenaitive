import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/formatters/currency';
import {
  PLAN_SECTIONS,
  useNikiPerformancePlan,
  type PlanMetricDef,
  type PlanMetricKey,
} from '@/hooks/useNikiPerformancePlan';
import type { QuarterKey } from '@/hooks/useNikiPerformanceMetrics';

const QUARTERS: QuarterKey[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function formatDisplay(value: number, unit: 'count' | 'currency'): string {
  if (unit === 'currency') return formatUSD(value);
  return value.toLocaleString('en-US');
}

/**
 * Parse user input back into raw units.
 *  - Currency accepts plain numbers, $, commas, and MM/M/K suffixes.
 *  - Count accepts plain integers/decimals.
 */
function parseInput(input: string, unit: 'count' | 'currency'): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return 0;
  if (unit === 'count') {
    const n = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  // currency
  let s = trimmed.replace(/\$/g, '').replace(/,/g, '').trim();
  let mult = 1;
  const upper = s.toUpperCase();
  if (upper.endsWith('MM')) { mult = 1_000_000; s = s.slice(0, -2); }
  else if (upper.endsWith('M')) { mult = 1_000_000; s = s.slice(0, -1); }
  else if (upper.endsWith('K')) { mult = 1_000;     s = s.slice(0, -1); }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n * mult;
}

interface CellProps {
  metric: PlanMetricDef;
  q: QuarterKey;
  value: number;
  onCommit: (next: number) => void;
}

function EditableCell({ metric, q, value, onCommit }: CellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const begin = () => {
    setDraft(formatDisplay(value, metric.unit));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseInput(draft, metric.unit);
    if (parsed !== null && parsed !== value) onCommit(parsed);
    setEditing(false);
  };

  return (
    <td
      className={cn(
        'border border-border/40 p-0 text-center tabular-nums text-xs',
        'hover:bg-muted/30 cursor-cell transition-colors',
        editing && 'ring-2 ring-primary ring-inset',
      )}
      onClick={() => { if (!editing) begin(); }}
      title={`${metric.label} — ${q} 2026`}
    >
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { setEditing(false); }
          }}
          className="h-7 w-full border-0 rounded-none focus-visible:ring-0 text-xs text-center px-1 py-0 bg-background"
        />
      ) : (
        <span className="block px-2 py-1.5 text-foreground">
          {formatDisplay(value, metric.unit)}
        </span>
      )}
    </td>
  );
}

export function QuarterlyPlanEditor() {
  const { plan, isLoaded, setTarget, resetAll } = useNikiPerformancePlan();

  const handleEdit = useCallback(
    (key: PlanMetricKey, q: QuarterKey, value: number) => setTarget(key, q, value),
    [setTarget],
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
        <div>
          <CardTitle className="text-base font-semibold tracking-tight">
            Quarterly Plan Model — 2026
          </CardTitle>
          <CardDescription className="text-xs">
            Edit Q1–Q4 targets per metric. The 2026 column is derived as Q1+Q2+Q3+Q4 and
            drives the Performance scorecard, charts, and variance calculations.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetAll} disabled={!isLoaded}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset to defaults
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/60">
              <th className="text-left px-4 py-2 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground bg-card sticky left-0 z-10">
                Metric
              </th>
              {QUARTERS.map((q) => (
                <th
                  key={q}
                  className="text-center px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {q}-2026
                </th>
              ))}
              <th className="text-center px-3 py-2 font-bold text-[10px] uppercase tracking-wider text-foreground bg-muted/30 border-l border-border/40">
                2026
              </th>
            </tr>
          </thead>
          <tbody>
            {PLAN_SECTIONS.map((section) => (
              <SectionBlock
                key={section.title}
                title={section.title}
                metrics={section.metrics}
                getValue={(m, q) => plan[m.key][q]}
                getTotal={(m) => plan[m.key].total}
                onEdit={handleEdit}
              />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SectionBlock({
  title,
  metrics,
  getValue,
  getTotal,
  onEdit,
}: {
  title: string;
  metrics: PlanMetricDef[];
  getValue: (m: PlanMetricDef, q: QuarterKey) => number;
  getTotal: (m: PlanMetricDef) => number;
  onEdit: (key: PlanMetricKey, q: QuarterKey, value: number) => void;
}) {
  return (
    <>
      <tr className="border-b border-border/40">
        <td
          colSpan={6}
          className="px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/40 sticky left-0"
        >
          {title}
        </td>
      </tr>
      {metrics.map((m) => (
        <tr key={m.key} className="border-b border-border/20 hover:bg-muted/10">
          <td className="px-4 py-1.5 font-medium text-sm text-foreground sticky left-0 bg-card z-10">
            {m.label}
          </td>
          {QUARTERS.map((q) => (
            <EditableCell
              key={q}
              metric={m}
              q={q}
              value={getValue(m, q)}
              onCommit={(v) => onEdit(m.key, q, v)}
            />
          ))}
          <td className="text-center px-3 py-1.5 tabular-nums text-xs font-bold text-foreground bg-muted/20 border-l border-border/40">
            {formatDisplay(getTotal(m), m.unit)}
          </td>
        </tr>
      ))}
    </>
  );
}