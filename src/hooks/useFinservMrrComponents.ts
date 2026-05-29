import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface MrrComponent {
  id: string;
  dealId: string;
  label: string | null;
  hourlyRate: number;
  estimatedHours: number;
  position: number;
}

interface DbRow {
  id: string;
  deal_id: string;
  label: string | null;
  hourly_rate: number | string | null;
  estimated_hours: number | string | null;
  position: number;
}

const fromDb = (r: DbRow): MrrComponent => ({
  id: r.id,
  dealId: r.deal_id,
  label: r.label,
  hourlyRate: Number(r.hourly_rate ?? 0),
  estimatedHours: Number(r.estimated_hours ?? 0),
  position: r.position,
});

export function useFinservMrrComponents(
  dealId: string | undefined,
  onTotalChange?: (total: number) => void,
) {
  const { user } = useAuth();
  const [components, setComponents] = useState<MrrComponent[]>([]);
  const [loading, setLoading] = useState(false);

  const notify = useCallback(
    (rows: MrrComponent[]) => {
      const t = rows.reduce((s, r) => s + r.hourlyRate * r.estimatedHours, 0);
      onTotalChange?.(t);
    },
    [onTotalChange],
  );

  const refresh = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('finserv_mrr_components')
      .select('*')
      .eq('deal_id', dealId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    setLoading(false);
    if (error) {
      toast({ title: 'Failed to load MRR rows', description: error.message, variant: 'destructive' });
      return;
    }
    const rows = ((data as DbRow[]) || []).map(fromDb);
    setComponents(rows);
    notify(rows);
  }, [dealId, notify]);

  useEffect(() => { refresh(); }, [refresh]);

  const addComponent = useCallback(
    async (input: Partial<Pick<MrrComponent, 'label' | 'hourlyRate' | 'estimatedHours'>>) => {
      if (!dealId) return;
      const nextPos = components.length ? Math.max(...components.map(c => c.position)) + 1 : 0;
      const { data, error } = await supabase
        .from('finserv_mrr_components')
        .insert({
          deal_id: dealId,
          label: input.label ?? null,
          hourly_rate: Number(input.hourlyRate ?? 0),
          estimated_hours: Number(input.estimatedHours ?? 0),
          position: nextPos,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) {
        toast({ title: 'Could not add row', description: error.message, variant: 'destructive' });
        return;
      }
      const next = [...components, fromDb(data as DbRow)];
      setComponents(next);
      notify(next);
    },
    [dealId, components, user?.id, notify],
  );

  const updateComponent = useCallback(
    async (id: string, patch: Partial<Pick<MrrComponent, 'label' | 'hourlyRate' | 'estimatedHours'>>) => {
      // Optimistic local merge so typing feels instant.
      const optimistic = components.map(c =>
        c.id === id
          ? {
              ...c,
              ...(patch.label !== undefined ? { label: patch.label } : {}),
              ...(patch.hourlyRate !== undefined ? { hourlyRate: Number(patch.hourlyRate) || 0 } : {}),
              ...(patch.estimatedHours !== undefined ? { estimatedHours: Number(patch.estimatedHours) || 0 } : {}),
            }
          : c,
      );
      setComponents(optimistic);
      notify(optimistic);
      const dbPatch: Record<string, unknown> = {};
      if (patch.label !== undefined) dbPatch.label = patch.label;
      if (patch.hourlyRate !== undefined) dbPatch.hourly_rate = Number(patch.hourlyRate ?? 0);
      if (patch.estimatedHours !== undefined) dbPatch.estimated_hours = Number(patch.estimatedHours ?? 0);
      const { error } = await supabase
        .from('finserv_mrr_components')
        .update(dbPatch)
        .eq('id', id);
      if (error) {
        toast({ title: 'Could not update row', description: error.message, variant: 'destructive' });
        refresh();
      }
    },
    [components, notify, refresh],
  );

  const deleteComponent = useCallback(
    async (id: string) => {
      const prev = components;
      const next = components.filter(c => c.id !== id);
      setComponents(next);
      notify(next);
      const { error } = await supabase.from('finserv_mrr_components').delete().eq('id', id);
      if (error) {
        setComponents(prev);
        notify(prev);
        toast({ title: 'Could not delete row', description: error.message, variant: 'destructive' });
      }
    },
    [components, notify],
  );

  const total = components.reduce((s, r) => s + r.hourlyRate * r.estimatedHours, 0);

  return { components, loading, total, addComponent, updateComponent, deleteComponent, refresh };
}