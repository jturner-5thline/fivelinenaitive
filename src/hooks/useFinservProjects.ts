import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface FinservProject {
  id: string;
  dealId: string;
  name: string;
  startDate: string | null;
  completionDate: string | null;
  description: string | null;
  value: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  deal_id: string;
  name: string;
  start_date: string | null;
  completion_date: string | null;
  description: string | null;
  value: number | string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

const fromDb = (r: DbRow): FinservProject => ({
  id: r.id,
  dealId: r.deal_id,
  name: r.name,
  startDate: r.start_date,
  completionDate: r.completion_date,
  description: r.description,
  value: Number(r.value ?? 0),
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function useFinservProjects(
  dealId: string | undefined,
  onTotalChange?: (total: number) => void,
) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<FinservProject[]>([]);
  const [loading, setLoading] = useState(false);

  const notifyTotal = useCallback(
    (rows: FinservProject[]) => {
      const total = rows.reduce((s, p) => s + (p.value || 0), 0);
      onTotalChange?.(total);
    },
    [onTotalChange],
  );

  const refresh = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('finserv_deal_projects')
      .select('*')
      .eq('deal_id', dealId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    setLoading(false);
    if (error) {
      toast({ title: 'Failed to load projects', description: error.message, variant: 'destructive' });
      return;
    }
    const rows = ((data as DbRow[]) || []).map(fromDb);
    setProjects(rows);
    notifyTotal(rows);
  }, [dealId, notifyTotal]);

  useEffect(() => { refresh(); }, [refresh]);

  const addProject = useCallback(
    async (input: Partial<Omit<FinservProject, 'id' | 'dealId' | 'createdAt' | 'updatedAt' | 'position'>>) => {
      if (!dealId) return;
      const nextPos = projects.length ? Math.max(...projects.map(p => p.position)) + 1 : 0;
      const { data, error } = await supabase
        .from('finserv_deal_projects')
        .insert({
          deal_id: dealId,
          name: input.name?.trim() || 'PROJECT',
          start_date: input.startDate || null,
          completion_date: input.completionDate || null,
          description: input.description || null,
          value: Number(input.value ?? 0),
          position: nextPos,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) {
        toast({ title: 'Could not add project', description: error.message, variant: 'destructive' });
        return;
      }
      const next = [...projects, fromDb(data as DbRow)];
      setProjects(next);
      notifyTotal(next);
    },
    [dealId, projects, user?.id, notifyTotal],
  );

  const updateProject = useCallback(
    async (id: string, patch: Partial<Omit<FinservProject, 'id' | 'dealId' | 'createdAt' | 'updatedAt'>>) => {
      const dbPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name?.trim() || 'PROJECT';
      if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate || null;
      if (patch.completionDate !== undefined) dbPatch.completion_date = patch.completionDate || null;
      if (patch.description !== undefined) dbPatch.description = patch.description || null;
      if (patch.value !== undefined) dbPatch.value = Number(patch.value ?? 0);
      if (patch.position !== undefined) dbPatch.position = patch.position;
      const { data, error } = await supabase
        .from('finserv_deal_projects')
        .update(dbPatch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        toast({ title: 'Could not update project', description: error.message, variant: 'destructive' });
        return;
      }
      const updated = fromDb(data as DbRow);
      const next = projects.map(p => (p.id === id ? updated : p));
      setProjects(next);
      notifyTotal(next);
    },
    [projects, notifyTotal],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const prev = projects;
      const next = projects.filter(p => p.id !== id);
      setProjects(next);
      notifyTotal(next);
      const { error } = await supabase.from('finserv_deal_projects').delete().eq('id', id);
      if (error) {
        setProjects(prev);
        notifyTotal(prev);
        toast({ title: 'Could not delete project', description: error.message, variant: 'destructive' });
      }
    },
    [projects, notifyTotal],
  );

  const total = projects.reduce((s, p) => s + (p.value || 0), 0);

  return { projects, loading, total, addProject, updateProject, deleteProject, refresh };
}