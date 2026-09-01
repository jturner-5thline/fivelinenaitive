import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Check, Loader2, RefreshCw, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SERVER_BASE_WEIGHTS = {
  type: 0.20,
  size: 0.16,
  industry: 0.16,
  geography: 0.07,
  structure: 0.12,
  recency: 0.07,
  evidence: 0.10,
  semantic: 0.12,
};

type Calibration = {
  id: string;
  weights: Record<string, number>;
  base_weights: Record<string, number>;
  component_stats: Record<string, {
    success_ratio?: number;
    failure_ratio?: number;
    lift?: number;
    n_success?: number;
    n_failure?: number;
  }>;
  success_samples: number;
  failure_samples: number;
  lookback_days: number;
  is_active: boolean;
  computed_at: string;
  activated_at: string | null;
};

function jsonRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, Number(item)]).filter(([, item]) => Number.isFinite(item)),
  );
}

function formatWeight(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value > 1 ? value.toFixed(1) : (value * 100).toFixed(1)}%`;
}

export function LenderMatchCalibrationPanel() {
  const queryClient = useQueryClient();
  const [lookbackDays, setLookbackDays] = useState("365");
  const [isComputing, setIsComputing] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Calibration | null>(null);

  const calibrationsQ = useQuery<Calibration[]>({
    queryKey: ["lender-match-calibrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lender_match_weight_calibrations")
        .select("id, weights, base_weights, component_stats, success_samples, failure_samples, lookback_days, is_active, computed_at, activated_at")
        .order("computed_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        weights: jsonRecord(row.weights),
        base_weights: jsonRecord(row.base_weights),
        component_stats: (row.component_stats && typeof row.component_stats === "object" && !Array.isArray(row.component_stats)
          ? row.component_stats
          : {}) as Calibration["component_stats"],
      })) as Calibration[];
    },
  });

  const active = useMemo(
    () => calibrationsQ.data?.find((calibration) => calibration.is_active) ?? null,
    [calibrationsQ.data],
  );

  async function computeCalibration() {
    const days = Number(lookbackDays);
    if (!Number.isInteger(days) || days < 30 || days > 1825) {
      toast.error("Lookback must be between 30 and 1,825 days");
      return;
    }

    setIsComputing(true);
    const { data, error } = await supabase.rpc("compute_lender_match_calibration", {
      p_base_weights: SERVER_BASE_WEIGHTS,
      p_lookback_days: days,
      p_persist: true,
    });
    setIsComputing(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const result = data as Record<string, unknown>;
    const next: Calibration = {
      id: String(result.id ?? ""),
      weights: jsonRecord(result.weights),
      base_weights: jsonRecord(result.base_weights),
      component_stats: (result.component_stats ?? {}) as Calibration["component_stats"],
      success_samples: Number(result.success_samples ?? 0),
      failure_samples: Number(result.failure_samples ?? 0),
      lookback_days: days,
      is_active: false,
      computed_at: new Date().toISOString(),
      activated_at: null,
    };
    setPreview(next);
    await queryClient.invalidateQueries({ queryKey: ["lender-match-calibrations"] });
    toast.success("Calibration snapshot computed");
  }

  async function activateCalibration(id: string) {
    setActivatingId(id);
    const { error } = await supabase.rpc("activate_lender_match_calibration", { p_id: id });
    setActivatingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPreview(null);
    await queryClient.invalidateQueries({ queryKey: ["lender-match-calibrations"] });
    toast.success("Calibration activated for new lender matches");
  }

  const displayed = preview ?? active;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" />
            Outcome-driven lender matching
          </div>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Rebalance matching weights from recommendation outcomes. New snapshots are previews until activated.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Lookback days</span>
            <Input className="h-8 w-28" type="number" min={30} max={1825} value={lookbackDays} onChange={(event) => setLookbackDays(event.target.value)} />
          </label>
          <Button size="sm" className="h-8" onClick={() => void computeCalibration()} disabled={isComputing}>
            {isComputing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Compute snapshot
          </Button>
        </div>
      </div>

      {displayed ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={displayed.is_active ? "default" : "secondary"}>
              {displayed.is_active ? "Active" : "Preview"}
            </Badge>
            <span className="text-muted-foreground">{displayed.success_samples} positive outcomes</span>
            <span className="text-muted-foreground">{displayed.failure_samples} negative outcomes</span>
            <span className="text-muted-foreground">Last {displayed.lookback_days} days</span>
            {!displayed.is_active && displayed.id && (
              <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => void activateCalibration(displayed.id)} disabled={activatingId === displayed.id}>
                {activatingId === displayed.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                Activate snapshot
              </Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <div className="grid min-w-[620px] grid-cols-[1.2fr_repeat(3,1fr)] gap-3 border-b border-border/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <div>Component</div><div className="text-right">Base</div><div className="text-right">Calibrated</div><div className="text-right">Observed lift</div>
            </div>
            {Object.keys(SERVER_BASE_WEIGHTS).map((key) => {
              const stats = displayed.component_stats[key];
              return (
                <div key={key} className="grid min-w-[620px] grid-cols-[1.2fr_repeat(3,1fr)] gap-3 border-b border-border/40 px-3 py-2 text-xs last:border-0">
                  <div className="font-medium capitalize">{key}</div>
                  <div className="text-right text-muted-foreground">{formatWeight(SERVER_BASE_WEIGHTS[key as keyof typeof SERVER_BASE_WEIGHTS])}</div>
                  <div className="text-right font-medium">{formatWeight(displayed.weights[key])}</div>
                  <div className="text-right text-muted-foreground">{stats?.lift === undefined ? "—" : `${stats.lift >= 0 ? "+" : ""}${(stats.lift * 100).toFixed(1)}%`}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" /> No calibration snapshot is active yet. Compute one after recommendation outcomes accumulate.
        </div>
      )}

      {(calibrationsQ.data ?? []).length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent snapshots</div>
          <div className="space-y-1">
            {(calibrationsQ.data ?? []).map((calibration) => (
              <div key={calibration.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-xs">
                <span className="font-medium">{new Date(calibration.computed_at).toLocaleString()}</span>
                <span className="text-muted-foreground">{calibration.success_samples} positive / {calibration.failure_samples} negative</span>
                {calibration.is_active && <Badge variant="outline" className="ml-auto">Active</Badge>}
                {!calibration.is_active && calibration.id !== preview?.id && (
                  <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => void activateCalibration(calibration.id)} disabled={activatingId === calibration.id}>Activate</Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
