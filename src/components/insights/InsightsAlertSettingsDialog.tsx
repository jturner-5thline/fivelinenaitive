import { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, RotateCcw, Settings2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_ALERT_CONFIG,
  useInsightsAlertConfig,
} from '@/hooks/useInsightsAlertConfig';
import { useInsightsComparison } from '@/hooks/useInsightsComparison';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESETS = [
  { id: 'sensitive', label: 'Sensitive', positive: 10, warning: 5, critical: 15, desc: 'Flag small movements early.' },
  { id: 'balanced', label: 'Balanced (default)', positive: 20, warning: 10, critical: 25, desc: 'Naitive default thresholds.' },
  { id: 'tolerant', label: 'Tolerant', positive: 30, warning: 20, critical: 40, desc: 'Only call out major shifts.' },
] as const;

export function InsightsAlertSettingsDialog({ open, onOpenChange }: Props) {
  const { config, update, reset, toggleMetric } = useInsightsAlertConfig();
  const { allMetrics } = useInsightsComparison();
  const [draft, setDraft] = useState(config);

  useEffect(() => {
    if (open) setDraft(config);
  }, [open, config]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof allMetrics>();
    for (const m of allMetrics) {
      const g = m.group ?? 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(m);
    }
    return Array.from(map.entries());
  }, [allMetrics]);

  const disabledSet = new Set(draft.disabledMetrics);

  const validate = (): string | null => {
    if (draft.warningThreshold <= 0 || draft.criticalThreshold <= 0 || draft.positiveThreshold <= 0) {
      return 'Thresholds must be greater than 0%.';
    }
    if (draft.criticalThreshold <= draft.warningThreshold) {
      return 'Critical threshold must be greater than warning threshold.';
    }
    return null;
  };

  const save = () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    update(draft);
    toast.success('Alert settings updated');
    onOpenChange(false);
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    setDraft(d => ({
      ...d,
      positiveThreshold: p.positive,
      warningThreshold: p.warning,
      criticalThreshold: p.critical,
    }));
  };

  const toggleDraftMetric = (key: string, enabled: boolean) => {
    setDraft(d => {
      const set = new Set(d.disabledMetrics);
      if (enabled) set.delete(key);
      else set.add(key);
      return { ...d, disabledMetrics: Array.from(set) };
    });
  };

  const enabledCount = allMetrics.length - disabledSet.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Trend alert settings
          </DialogTitle>
          <DialogDescription>
            Tune the thresholds the Insights engine uses to fire warnings and choose which metrics
            are tracked. Changes affect the AI Summary, anomaly history, and Ask-AI chat instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Quick presets
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESETS.map(p => {
                const active =
                  draft.positiveThreshold === p.positive &&
                  draft.warningThreshold === p.warning &&
                  draft.criticalThreshold === p.critical;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border/60 hover:border-border bg-background'
                    }`}
                  >
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                      +{p.positive}% / −{p.warning}% / −{p.critical}%
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              MoM thresholds
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5 text-success">
                  <TrendingUp className="h-3.5 w-3.5" /> Positive ≥
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={draft.positiveThreshold}
                    onChange={e =>
                      setDraft(d => ({ ...d, positiveThreshold: Number(e.target.value) }))
                    }
                    className="pr-7"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Warning ≥
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={draft.warningThreshold}
                    onChange={e =>
                      setDraft(d => ({ ...d, warningThreshold: Number(e.target.value) }))
                    }
                    className="pr-7"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Critical ≥
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={draft.criticalThreshold}
                    onChange={e =>
                      setDraft(d => ({ ...d, criticalThreshold: Number(e.target.value) }))
                    }
                    className="pr-7"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Critical must be greater than warning. "Decline" is sentiment-aware — for "lower is
              better" metrics (e.g. expenses), an increase counts as a decline.
            </p>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Metric coverage
              </p>
              <Badge variant="outline" className="text-[10px]">
                {enabledCount} / {allMetrics.length} tracked
              </Badge>
            </div>
            <ScrollArea className="h-[220px] rounded-lg border border-border/60 p-2">
              <div className="space-y-3">
                {grouped.map(([group, metrics]) => (
                  <div key={group}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                      {group}
                    </p>
                    <div className="space-y-1.5">
                      {metrics.map(m => {
                        const enabled = !disabledSet.has(m.key);
                        return (
                          <label
                            key={m.key}
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm"
                          >
                            <span className="truncate">{m.label}</span>
                            <Switch
                              checked={enabled}
                              onCheckedChange={c => toggleDraftMetric(m.key, c)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(DEFAULT_ALERT_CONFIG);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to defaults
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}