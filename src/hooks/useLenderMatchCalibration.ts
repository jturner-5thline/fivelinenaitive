import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MATCH_WEIGHTS,
  setActiveMatchWeights,
  type MatchWeights,
} from "@/lib/lenderMatchScore";

type CalibrationRow = {
  id: string;
  weights: unknown;
  computed_at: string;
  activated_at: string | null;
  success_samples: number;
  failure_samples: number;
  component_stats: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWeights(value: unknown): Partial<MatchWeights> {
  const source = asRecord(value);
  const aliases: Record<keyof MatchWeights, string[]> = {
    financingType: ["financingType", "type"],
    checkSize: ["checkSize", "size"],
    vertical: ["vertical", "industry"],
    geography: ["geography"],
    financialFit: ["financialFit", "structure"],
    trackRecord: ["trackRecord", "evidence"],
    recency: ["recency"],
    exclusion: ["exclusion", "semantic"],
  };

  const normalized: Partial<MatchWeights> = {};
  for (const key of Object.keys(aliases) as (keyof MatchWeights)[]) {
    const raw = aliases[key].map((alias) => numeric(source[alias])).find((item) => item !== null);
    if (raw !== undefined && raw !== null) normalized[key] = raw;
  }
  return normalized;
}

export function useLenderMatchCalibration(enabled = true) {
  const [active, setActive] = useState<CalibrationRow | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [version, setVersion] = useState("base");

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setActive(null);
      setIsLoading(false);
      setVersion("base");
      setActiveMatchWeights(null, "base");
      return () => { cancelled = true; };
    }

    setIsLoading(true);
    const load = async () => {
      const { data, error } = await supabase
        .from("lender_match_weight_calibrations")
        .select("id, weights, computed_at, activated_at, success_samples, failure_samples, component_stats")
        .eq("is_active", true)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("Unable to load lender match calibration:", error);
        setActive(null);
        setActiveMatchWeights(null, "base");
      } else {
        const row = (data ?? null) as CalibrationRow | null;
        const nextVersion = row?.id ?? "base";
        setActive(row);
        setVersion(nextVersion);
        setActiveMatchWeights(row ? normalizeWeights(row.weights) : null, nextVersion);
      }
      setIsLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [enabled]);

  return {
    active,
    isLoading,
    version,
    baseWeights: MATCH_WEIGHTS,
    activeWeights: normalizeWeights(active?.weights),
  };
}
