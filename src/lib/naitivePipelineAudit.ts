import { supabase } from '@/integrations/supabase/client';

export type NaitivePipelineAuditEntityType =
  | 'stage'
  | 'milestone'
  | 'cadence'
  | 'call_template'
  | 'rule'
  | 'deal_transition';

export interface NaitivePipelineAuditInput {
  entityType: NaitivePipelineAuditEntityType;
  entityId?: string | null;
  action: string; // e.g. 'create' | 'update' | 'delete' | 'stage_changed'
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Append a row to `naitive_pipeline_audit`. Best-effort: failures are logged
 * but never throw to callers — audit must never block product flows.
 */
export async function logNaitivePipelineAudit(entry: NaitivePipelineAuditInput): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const actor = userData?.user?.id ?? null;
    const { error } = await supabase.from('naitive_pipeline_audit').insert([{
      actor_user_id: actor,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      action: entry.action,
      field: entry.field ?? null,
      old_value: entry.oldValue == null ? null : (entry.oldValue as any),
      new_value: entry.newValue == null ? null : (entry.newValue as any),
      context: (entry.context ?? null) as any,
    }]);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('naitive audit insert failed:', error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('naitive audit logger error:', err);
  }
}

/**
 * Convenience: diff two simple objects and emit one audit row per changed
 * field. Skips fields whose values are deeply equal (via JSON compare).
 */
export async function logNaitiveFieldDiffs(
  base: NaitivePipelineAuditInput,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Promise<void> {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const tasks: Promise<void>[] = [];
  for (const k of keys) {
    const oldV = (before || {})[k];
    const newV = (after || {})[k];
    if (JSON.stringify(oldV) === JSON.stringify(newV)) continue;
    tasks.push(
      logNaitivePipelineAudit({
        ...base,
        field: k,
        oldValue: oldV,
        newValue: newV,
      }),
    );
  }
  await Promise.all(tasks);
}