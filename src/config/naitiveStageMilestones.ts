/**
 * Stage-specific milestone definitions for the naitive pipeline.
 *
 * Each stage in the pipeline can have an ordered list of milestones.
 * Milestones can optionally route a deal to a different stage when completed
 * (e.g. "Disqualified" → "closed-lost"). Defaults are seeded below and can
 * be overridden by user configuration persisted via the helpers in this file.
 *
 * The persistence layer currently uses localStorage, but the shape is
 * structured so it can be swapped for a Supabase-backed store later.
 */

export interface NaitiveMilestoneDef {
  key: string;
  label: string;
  position: number;
  description?: string;
  /** If set, completing this milestone moves the deal to this stage. */
  outcomeTargetStage?: string;
  isActive?: boolean;
}

/**
 * Default milestone templates keyed by the stage's canonical system type.
 * Lookups resolve via the canonical-type matcher in `naitivePipelineConfig`
 * so a renamed "Qualification Call" stage still receives the right defaults.
 */
import { MILESTONE_DEFAULTS_BY_SYSTEM_TYPE, resolveSystemStageType } from '@/config/naitivePipelineConfig';

export const NAITIVE_STAGE_DEFAULT_MILESTONES: Record<string, NaitiveMilestoneDef[]> =
  MILESTONE_DEFAULTS_BY_SYSTEM_TYPE as Record<string, NaitiveMilestoneDef[]>;

/** Stages that intentionally have no milestones. */
export const NAITIVE_NO_MILESTONE_STAGES = [
  'prospects',
  'dormant',
  'on-hold',
  'onboarding',
  'active',
  'churned',
  'closed-lost',
];

const STORAGE_KEY = 'naitive:stage-milestone-config:v1';
const CHANGE_EVENT = 'naitive:stage-milestone-config:change';

type ConfigMap = Record<string, NaitiveMilestoneDef[]>;

function readOverrides(): ConfigMap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConfigMap;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore
  }
  return null;
}

function writeOverrides(map: ConfigMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

/** Read effective milestone config for all stages (overrides ?? defaults). */
export function getAllStageMilestoneConfig(): ConfigMap {
  const overrides = readOverrides();
  if (overrides) return overrides;
  // Deep clone defaults to avoid accidental mutation.
  return JSON.parse(JSON.stringify(NAITIVE_STAGE_DEFAULT_MILESTONES));
}

/** Persist the full milestone config map. */
export function setAllStageMilestoneConfig(map: ConfigMap) {
  // Re-normalize positions per stage.
  const next: ConfigMap = {};
  for (const [stageId, list] of Object.entries(map)) {
    next[stageId] = list
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((m, idx) => ({ ...m, position: idx, isActive: m.isActive !== false }));
  }
  writeOverrides(next);
}

/** Reset to seeded defaults. */
export function resetStageMilestoneConfig() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Subscribe to config changes (storage in this tab + other tabs). */
export function subscribeToStageMilestoneConfig(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Get active milestone definitions for a stage.
 * Lookup order: per-stage override (by id) → per-canonical-type override → seeded defaults.
 * The optional `stage` argument lets callers pass label/systemStageType for
 * canonical resolution when only an id would otherwise be available.
 */
export function getStageMilestones(
  stageOrId: string | { id: string; label?: string; systemStageType?: string },
): NaitiveMilestoneDef[] {
  const all = getAllStageMilestoneConfig();
  const stageId = typeof stageOrId === 'string' ? stageOrId : stageOrId.id;
  let list = all[stageId];

  if (!list || list.length === 0) {
    // Canonical fallback (works for renamed stages and id-only lookups)
    const canonicalInput =
      typeof stageOrId === 'string'
        ? { id: stageOrId, label: stageOrId }
        : { id: stageOrId.id, label: stageOrId.label || stageOrId.id, systemStageType: stageOrId.systemStageType };
    const canonical = resolveSystemStageType(canonicalInput);
    if (canonical) list = all[canonical] || MILESTONE_DEFAULTS_BY_SYSTEM_TYPE[canonical];
  }

  return (list || [])
    .filter((m) => m.isActive !== false)
    .slice()
    .sort((a, b) => a.position - b.position);
}
