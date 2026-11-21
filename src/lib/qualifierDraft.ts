export interface Qualifier {
  id: string;
  text: string;
  is_met: boolean;
  position: number;
  metric?: string | null;
  operator?: string | null;
  value?: number | null;
  unit?: string | null;
}

export interface DraftQualifier extends Qualifier {
  isNew?: boolean;
}

export interface QualifierChanges {
  inserts: { text: string; is_met: boolean; position: number }[];
  updates: { id: string; text: string; is_met: boolean; position: number }[];
  deletes: string[];
}

/** Diff the saved list against the draft. Blank new rows are dropped; blank edited rows count as deletes. */
export function diffQualifiers(saved: Qualifier[], draft: DraftQualifier[]): QualifierChanges {
  const kept = draft.filter((q) => q.text.trim().length > 0);
  const keptIds = new Set(kept.filter((q) => !q.isNew).map((q) => q.id));
  const byId = new Map(saved.map((q) => [q.id, q]));
  const changes: QualifierChanges = { inserts: [], updates: [], deletes: [] };
  kept.forEach((q, i) => {
    const text = q.text;
    if (q.isNew || !byId.has(q.id)) {
      changes.inserts.push({ text, is_met: q.is_met, position: i });
      return;
    }
    const s = byId.get(q.id);
    if (!s) return;
    if (s.text !== text || s.is_met !== q.is_met || s.position !== i) {
      changes.updates.push({ id: q.id, text, is_met: q.is_met, position: i });
    }
  });
  saved.forEach((s) => { if (!keptIds.has(s.id)) changes.deletes.push(s.id); });
  return changes;
}

export function hasChanges(c: QualifierChanges): boolean {
  return c.inserts.length + c.updates.length + c.deletes.length > 0;
}
