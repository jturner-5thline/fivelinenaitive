import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SaaSModelData, SensitivityScenario, LenderConfig } from '../components/deal/saas-model/types';
import { createEmptyModel, recalculateModel, createDefaultLenderConfig } from '../components/deal/saas-model/calculations';

const DEFAULT_SCENARIOS: SensitivityScenario[] = [
  { revenuePct: 90, opexReduction: 5, cogsReduction: 0 },
  { revenuePct: 80, opexReduction: 15, cogsReduction: 5 },
  { revenuePct: 70, opexReduction: 25, cogsReduction: 10 },
  { revenuePct: 50, opexReduction: 35, cogsReduction: 15 },
];

export function useSaaSModel(dealId: string) {
  const [model, setModel] = useState<SaaSModelData>(createEmptyModel());
  const [scenarios, setScenarios] = useState<SensitivityScenario[]>(DEFAULT_SCENARIOS);
  const [lenders, setLenders] = useState<LenderConfig[]>([createDefaultLenderConfig(), createDefaultLenderConfig()]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from DB
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        // Load model data
        const { data: modelRow } = await supabase
          .from('deal_saas_model' as any)
          .select('*')
          .eq('deal_id', dealId)
          .maybeSingle();

        if (modelRow && !cancelled) {
          const raw = (modelRow as any).model_data;
          if (raw && Object.keys(raw).length > 0) {
            setModel(raw as SaaSModelData);
          }
        }

        // Load sensitivity
        const { data: sensRow } = await supabase
          .from('deal_saas_sensitivity' as any)
          .select('*')
          .eq('deal_id', dealId)
          .maybeSingle();

        if (sensRow && !cancelled) {
          const raw = (sensRow as any).scenarios;
          if (Array.isArray(raw) && raw.length > 0) {
            setScenarios(raw);
          }
        }

        // Load lenders
        const { data: lenderRows } = await supabase
          .from('deal_saas_lenders' as any)
          .select('*')
          .eq('deal_id', dealId)
          .order('lender_index' as any);

        if (lenderRows && lenderRows.length > 0 && !cancelled) {
          const configs = (lenderRows as any[]).map(r => r.config as LenderConfig);
          setLenders(configs.length >= 2 ? configs : [...configs, createDefaultLenderConfig()]);
        }
      } catch (err) {
        console.error('Failed to load SaaS model:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dealId]);

  // Debounced save
  const debouncedSave = useCallback(async (what: 'model' | 'sensitivity' | 'lenders', payload: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        if (what === 'model') {
          await supabase.from('deal_saas_model' as any).upsert({
            deal_id: dealId,
            model_data: payload,
          } as any, { onConflict: 'deal_id' } as any);
        } else if (what === 'sensitivity') {
          await supabase.from('deal_saas_sensitivity' as any).upsert({
            deal_id: dealId,
            scenarios: payload,
          } as any, { onConflict: 'deal_id' } as any);
        } else if (what === 'lenders') {
          const configs = payload as LenderConfig[];
          for (let i = 0; i < configs.length; i++) {
            await supabase.from('deal_saas_lenders' as any).upsert({
              deal_id: dealId,
              lender_index: i,
              config: configs[i],
            } as any, { onConflict: 'deal_id,lender_index' } as any);
          }
        }
        setSaveStatus('saved');
        fadeTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to save:', err);
        toast.error('Failed to save changes');
        setSaveStatus('idle');
      }
    }, 2000);
  }, [dealId]);

  const updateModel = useCallback((updater: (prev: SaaSModelData) => SaaSModelData) => {
    setModel(prev => {
      const updated = recalculateModel(updater(prev));
      debouncedSave('model', updated);
      return updated;
    });
  }, [debouncedSave]);

  const recalculate = useCallback(() => {
    setModel(prev => {
      const updated = recalculateModel(prev);
      debouncedSave('model', updated);
      return updated;
    });
  }, [debouncedSave]);

  const updateScenarios = useCallback((newScenarios: SensitivityScenario[]) => {
    setScenarios(newScenarios);
    debouncedSave('sensitivity', newScenarios);
  }, [debouncedSave]);

  const updateLender = useCallback((index: number, config: LenderConfig) => {
    setLenders(prev => {
      const updated = [...prev];
      updated[index] = config;
      debouncedSave('lenders', updated);
      return updated;
    });
  }, [debouncedSave]);

  return {
    model,
    scenarios,
    lenders,
    isLoading,
    saveStatus,
    updateModel,
    recalculate,
    updateScenarios,
    updateLender,
  };
}
