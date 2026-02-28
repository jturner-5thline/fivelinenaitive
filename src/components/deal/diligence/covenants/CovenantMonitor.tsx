import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CovenantConfig } from '../types';

interface CovenantMonitorProps {
  covenants: CovenantConfig[];
  onCovenantsChange: (covenants: CovenantConfig[]) => void;
  className?: string;
}

const PRESET_COVENANTS: Partial<CovenantConfig>[] = [
  { name: 'Total Leverage', type: 'leverage', threshold: 4.5, operator: 'lte' },
  { name: 'Senior Leverage', type: 'leverage', threshold: 3.5, operator: 'lte' },
  { name: 'Interest Coverage (FCCR)', type: 'coverage', threshold: 1.25, operator: 'gte' },
  { name: 'Debt Service Coverage', type: 'coverage', threshold: 1.10, operator: 'gte' },
  { name: 'Minimum Cash', type: 'minimum_cash', threshold: 5000000, operator: 'gte' },
];

function getCovenantStatus(covenant: CovenantConfig): 'compliant' | 'warning' | 'breach' {
  if (covenant.status) return covenant.status;
  if (covenant.currentValue == null) return 'compliant';

  const { currentValue, threshold, operator } = covenant;
  const diff = operator === 'lte' || operator === 'lt'
    ? threshold - currentValue
    : currentValue - threshold;
  const pctHeadroom = Math.abs(diff / threshold) * 100;

  if (operator === 'lte' && currentValue > threshold) return 'breach';
  if (operator === 'lt' && currentValue >= threshold) return 'breach';
  if (operator === 'gte' && currentValue < threshold) return 'breach';
  if (operator === 'gt' && currentValue <= threshold) return 'breach';

  if (pctHeadroom < 10) return 'warning';
  return 'compliant';
}

function getHeadroomPct(covenant: CovenantConfig): number {
  if (covenant.currentValue == null) return 100;
  const { currentValue, threshold, operator } = covenant;
  const diff = operator === 'lte' || operator === 'lt'
    ? threshold - currentValue
    : currentValue - threshold;
  return Math.max(0, Math.min(100, (diff / threshold) * 100));
}

const STATUS_CONFIG = {
  compliant: { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Compliant' },
  warning: { icon: ShieldQuestion, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Warning' },
  breach: { icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Breach' },
};

const OPERATOR_LABELS: Record<string, string> = {
  lt: '<', lte: '≤', gt: '>', gte: '≥',
};

export function CovenantMonitor({ covenants, onCovenantsChange, className }: CovenantMonitorProps) {
  const [adding, setAdding] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<CovenantConfig>>({
    name: '', type: 'leverage', threshold: 0, operator: 'lte',
  });

  const addCovenant = (preset?: Partial<CovenantConfig>) => {
    const base = preset || draft;
    if (!base.name || base.threshold == null) return;
    const newCov: CovenantConfig = {
      name: base.name!,
      type: (base.type || 'custom') as CovenantConfig['type'],
      threshold: base.threshold!,
      operator: (base.operator || 'lte') as CovenantConfig['operator'],
      currentValue: base.currentValue,
    };
    onCovenantsChange([...covenants, newCov]);
    setAdding(false);
    setDraft({ name: '', type: 'leverage', threshold: 0, operator: 'lte' });
  };

  const removeCovenant = (idx: number) => {
    onCovenantsChange(covenants.filter((_, i) => i !== idx));
  };

  const updateCovenantValue = (idx: number, value: number) => {
    const updated = [...covenants];
    updated[idx] = { ...updated[idx], currentValue: value };
    onCovenantsChange(updated);
    setEditingIdx(null);
  };

  const breachCount = covenants.filter(c => getCovenantStatus(c) === 'breach').length;
  const warningCount = covenants.filter(c => getCovenantStatus(c) === 'warning').length;

  return (
    <div className={cn("rounded-xl border border-border/30 bg-card", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Covenant Monitor</h3>
          {covenants.length > 0 && (
            <div className="flex gap-1 ml-2">
              {breachCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5">{breachCount} breach</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 bg-amber-500/10 text-amber-500">{warningCount} warning</Badge>
              )}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {/* Presets bar */}
      {adding && (
        <div className="px-4 py-3 border-b border-border/20 bg-muted/20">
          <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Quick Add Presets</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESET_COVENANTS.map((preset, i) => (
              <button
                key={i}
                onClick={() => addCovenant(preset)}
                className="text-[10px] px-2 py-1 rounded-md border border-border/40 hover:bg-primary/10 hover:border-primary/30 transition-all"
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Name</label>
              <Input
                className="h-7 text-xs"
                value={draft.name || ''}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Custom covenant"
              />
            </div>
            <div className="w-20">
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Op</label>
              <Select value={draft.operator} onValueChange={v => setDraft(d => ({ ...d, operator: v as any }))}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="text-[10px] text-muted-foreground mb-0.5 block">Threshold</label>
              <Input
                className="h-7 text-xs"
                type="number"
                step="0.05"
                value={draft.threshold || ''}
                onChange={e => setDraft(d => ({ ...d, threshold: parseFloat(e.target.value) }))}
              />
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => addCovenant()}>
              <Check className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Covenant list */}
      <div className="divide-y divide-border/10">
        {covenants.length === 0 && !adding && (
          <div className="px-4 py-8 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No covenants configured</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Click "Add" to set up covenant monitoring</p>
          </div>
        )}

        {covenants.map((cov, idx) => {
          const status = getCovenantStatus(cov);
          const headroom = getHeadroomPct(cov);
          const cfg = STATUS_CONFIG[status];
          const StatusIcon = cfg.icon;

          return (
            <div key={idx} className="px-4 py-3 hover:bg-muted/20 transition-colors group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", cfg.bg)}>
                    <StatusIcon className={cn("h-3.5 w-3.5", cfg.color)} />
                  </div>
                  <div>
                    <span className="text-xs font-medium">{cov.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {OPERATOR_LABELS[cov.operator]} {cov.type === 'minimum_cash'
                        ? `$${(cov.threshold / 1000000).toFixed(1)}MM`
                        : `${cov.threshold}x`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingIdx === idx ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-6 w-16 text-xs"
                        type="number"
                        step="0.01"
                        defaultValue={cov.currentValue ?? ''}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') updateCovenantValue(idx, parseFloat((e.target as HTMLInputElement).value));
                          if (e.key === 'Escape') setEditingIdx(null);
                        }}
                      />
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingIdx(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Badge variant="outline" className={cn("text-[10px] h-5", cfg.color)}>
                        {cfg.label}
                      </Badge>
                      {cov.currentValue != null && (
                        <span className="text-xs font-mono font-medium">
                          {cov.type === 'minimum_cash'
                            ? `$${(cov.currentValue / 1000000).toFixed(1)}MM`
                            : `${cov.currentValue.toFixed(2)}x`}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => setEditingIdx(idx)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                        onClick={() => removeCovenant(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {/* Headroom bar */}
              <div className="flex items-center gap-2 ml-8">
                <Progress
                  value={headroom}
                  className={cn("h-1.5 flex-1", status === 'breach' && '[&>div]:bg-destructive', status === 'warning' && '[&>div]:bg-amber-500')}
                />
                <span className="text-[10px] text-muted-foreground w-12 text-right">
                  {cov.currentValue != null ? `${headroom.toFixed(0)}% room` : 'N/A'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
