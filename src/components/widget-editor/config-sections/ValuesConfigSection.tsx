import { ValueConfig, ValueCombineOp, getField } from '../widgetTypes';
import { DropZone } from '../DropZone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, ChevronUp, Plus, Minus, X as TimesIcon, Divide } from 'lucide-react';
import { useQBRevenueAccounts } from '@/hooks/useQBRevenueAccounts';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  configs: ValueConfig[];
  onChange: (configs: ValueConfig[]) => void;
  realmId?: string | null;
  entityId?: string | null;
}

const AGGS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'count', label: 'Count' },
] as const;

const FORMATS = [
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percent' },
  { value: 'number', label: 'Number' },
] as const;

const REVENUE_FIELDS = ['f-revenue', 'f-total-revenue', 'f-amount'];

const COMBINE_OPS: { value: ValueCombineOp; icon: typeof Plus; label: string; symbol: string }[] = [
  { value: '+', icon: Plus, label: 'Add', symbol: '+' },
  { value: '-', icon: Minus, label: 'Subtract', symbol: '−' },
  { value: '*', icon: TimesIcon, label: 'Multiply', symbol: '×' },
  { value: '/', icon: Divide, label: 'Divide', symbol: '÷' },
];

function OperatorPicker({
  value,
  onChange,
}: {
  value: ValueCombineOp | undefined;
  onChange: (op: ValueCombineOp | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0.5 py-1">
      {COMBINE_OPS.map((op) => (
        <button
          key={op.value}
          onClick={() => onChange(value === op.value ? undefined : op.value)}
          className={cn(
            'h-6 w-6 rounded flex items-center justify-center text-xs font-bold transition-colors',
            value === op.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
          )}
          title={op.label}
        >
          {op.symbol}
        </button>
      ))}
    </div>
  );
}

export function ValuesConfigSection({ configs, onChange, realmId, entityId }: Props) {
  const { data: revenueAccounts } = useQBRevenueAccounts(realmId);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const isAllEntities = entityId === 'all';

  const update = (idx: number, patch: Partial<ValueConfig>) => {
    const next = configs.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };

  const remove = (idx: number) => {
    const next = configs.filter((_, i) => i !== idx);
    // Clear combineOp on new first item
    if (next.length > 0 && next[0].combineOp) {
      next[0] = { ...next[0], combineOp: undefined };
    }
    onChange(next);
  };

  const toggleAccount = (idx: number, accountId: string) => {
    const current = configs[idx].accountFilter ?? [];
    const next = current.includes(accountId)
      ? current.filter((a) => a !== accountId)
      : [...current, accountId];
    update(idx, { accountFilter: next });
  };

  // Check if any combine ops are active
  const hasCombination = configs.some((c) => c.combineOp);

  return (
    <div className="space-y-0">
      {configs.map((vc, idx) => {
        const field = getField(vc.fieldId);
        const isRevenue = vc.fieldId ? REVENUE_FIELDS.includes(vc.fieldId) : false;
        const breakdown = vc.breakdown ?? 'total';
        const isExpanded = expandedIdx === idx;
        const isFirst = idx === 0;

        return (
          <div key={idx}>
            {/* Operator picker between values */}
            {!isFirst && configs.length > 1 && (
              <OperatorPicker
                value={vc.combineOp}
                onChange={(op) => update(idx, { combineOp: op })}
              />
            )}

            <div className={cn(
              'rounded-lg border bg-secondary/30 p-2.5 space-y-2',
              vc.combineOp ? 'border-primary/40' : 'border-border'
            )}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {field?.name ?? vc.label ?? 'Unknown'}
                </span>
                <button onClick={() => remove(idx)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={vc.agg} onValueChange={(v) => update(idx, { agg: v as ValueConfig['agg'] })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGGS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={vc.format} onValueChange={(v) => update(idx, { format: v as ValueConfig['format'] })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Revenue breakdown toggle */}
              {isRevenue && !hasCombination && (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground">View as:</Label>
                    <div className="flex gap-1">
                      <button
                        onClick={() => update(idx, { breakdown: 'total', accountFilter: [] })}
                        className={cn(
                          'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                          breakdown === 'total'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        )}
                      >
                        Total
                      </button>
                      <button
                        onClick={() => update(idx, { breakdown: 'byAccount' })}
                        className={cn(
                          'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                          breakdown === 'byAccount'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        )}
                      >
                        By Account
                      </button>
                      {isAllEntities && (
                        <button
                          onClick={() => update(idx, { breakdown: 'byEntity', accountFilter: [] })}
                          className={cn(
                            'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                            breakdown === 'byEntity'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          )}
                        >
                          By Entity
                        </button>
                      )}
                    </div>
                  </div>

                  {breakdown === 'byAccount' && revenueAccounts && revenueAccounts.length > 0 && (
                    <div>
                      <button
                        onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        <span>
                          {(vc.accountFilter ?? []).length === 0
                            ? 'All accounts'
                            : `${(vc.accountFilter ?? []).length} account${(vc.accountFilter ?? []).length === 1 ? '' : 's'} selected`}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto pr-1">
                          <button
                            onClick={() => update(idx, { accountFilter: [] })}
                            className={cn(
                              'text-[11px] px-1.5 py-0.5 rounded transition-colors',
                              (vc.accountFilter ?? []).length === 0
                                ? 'text-primary font-medium'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            Select All
                          </button>
                          {revenueAccounts.map((acct) => (
                            <label
                              key={acct.accountId}
                              className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer hover:bg-secondary/50 rounded px-1.5 py-0.5"
                            >
                              <Checkbox
                                checked={(vc.accountFilter ?? []).includes(acct.accountId)}
                                onCheckedChange={() => toggleAccount(idx, acct.accountId)}
                                className="h-3 w-3"
                              />
                              <span className="truncate">{acct.accountName}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Combined formula preview */}
      {hasCombination && configs.length >= 2 && (
        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-2.5 py-1.5 mt-2">
          <p className="text-[10px] font-medium text-primary uppercase tracking-wider mb-0.5">Formula</p>
          <p className="text-xs font-mono text-foreground">
            {configs.map((vc, i) => {
              const name = getField(vc.fieldId)?.name ?? vc.label ?? '?';
              const opSymbol = vc.combineOp === '+' ? ' + ' : vc.combineOp === '-' ? ' − ' : vc.combineOp === '*' ? ' × ' : vc.combineOp === '/' ? ' ÷ ' : '';
              return i === 0 ? name : `${opSymbol}${name}`;
            }).join('')}
          </p>
        </div>
      )}

      <div className="pt-2">
        <DropZone id="drop-values" label="Values" accepts="numeric" isEmpty={configs.length === 0 || true} />
      </div>
    </div>
  );
}
