import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

const NAITIVE_PIPELINE_NAME = 'naitive Pipeline';

let cachedNaitivePipelineId: string | null | undefined = undefined;

/**
 * Resolves the naitive Pipeline ID (if it exists).
 * Result is cached in-memory for the session.
 * Returns null if the pipeline doesn't exist yet.
 */
export async function getNaitivePipelineId(): Promise<string | null> {
  if (cachedNaitivePipelineId !== undefined) return cachedNaitivePipelineId;

  const { data, error } = await supabase
    .from('deal_pipelines')
    .select('id')
    .eq('company_id', FIFTH_LINE_COMPANY_ID)
    .eq('name', NAITIVE_PIPELINE_NAME)
    .maybeSingle();

  if (error) {
    console.error('Failed to resolve naitive pipeline ID:', error);
    cachedNaitivePipelineId = null;
    return null;
  }

  cachedNaitivePipelineId = data?.id ?? null;
  return cachedNaitivePipelineId;
}

/**
 * Reset the cached pipeline ID (e.g. if the pipeline is created at runtime).
 */
export function resetNaitivePipelineCache() {
  cachedNaitivePipelineId = undefined;
}

/**
 * Filter out deals that belong to the naitive Pipeline.
 * Works on arrays of objects that have a `pipeline_id` field.
 */
export function excludeNaitivePipelineDeals<T extends { pipeline_id?: string | null }>(
  deals: T[],
  naitivePipelineId: string | null
): T[] {
  if (!naitivePipelineId) return deals;
  return deals.filter(d => d.pipeline_id !== naitivePipelineId);
}
