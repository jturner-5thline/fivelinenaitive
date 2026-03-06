import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';

export interface ScoreLevelConfig {
  label: string;
  color: string; // CSS color string e.g. '#ef4444'
}

export interface LenderScoreConfig {
  enabled: boolean;
  levels: Record<number, ScoreLevelConfig>;
}

export const DEFAULT_SCORE_LEVELS: Record<number, ScoreLevelConfig> = {
  1: { label: 'Most Interested', color: '#ef4444' },   // red
  2: { label: 'Moderate', color: '#f59e0b' },           // amber
  3: { label: 'Least Interested', color: '#3b82f6' },   // blue
};

const DEFAULT_CONFIG: LenderScoreConfig = {
  enabled: true,
  levels: DEFAULT_SCORE_LEVELS,
};

/** Returns inline style objects for a given score value based on config */
export function getScoreStyles(score: number, config: LenderScoreConfig) {
  const level = config.levels[score] || DEFAULT_SCORE_LEVELS[score];
  if (!level) return { bg: {}, text: {}, ring: {}, badge: {} };
  const c = level.color;
  return {
    bg: { backgroundColor: `${c}20` },
    text: { color: c },
    ring: { boxShadow: `0 0 0 1px ${c}66` },
    badge: { borderColor: `${c}4D`, color: c },
  };
}

export function useLenderScoreConfig() {
  const { company } = useCompany();
  const [config, setConfig] = useState<LenderScoreConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!company?.id) {
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from('company_settings')
          .select('deals_special_widgets')
          .eq('company_id', company.id)
          .single();

        const widgets = data?.deals_special_widgets as Record<string, unknown> | null;
        if (widgets && typeof widgets.lender_score === 'object' && widgets.lender_score !== null) {
          const raw = widgets.lender_score as Partial<LenderScoreConfig>;
          setConfig({
            enabled: raw.enabled !== false,
            levels: {
              ...DEFAULT_SCORE_LEVELS,
              ...(raw.levels || {}),
            },
          });
        }
      } catch (err) {
        console.error('Error fetching lender score config:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [company?.id]);

  return { scoreConfig: config, isLoading };
}
