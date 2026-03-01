import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CustomMetricDefinition, FormulaNode, FormulaResultType } from '@/lib/customMetricEngine';
import { toast } from '@/hooks/use-toast';

interface CustomMetricRow {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  formula: unknown;
  result_type: string;
  format_options: unknown;
  created_at: string;
  updated_at: string;
}

function rowToDefinition(row: CustomMetricRow): CustomMetricDefinition {
  return {
    id: row.id,
    user_id: row.user_id,
    company_id: row.company_id,
    name: row.name,
    description: row.description,
    formula: row.formula as FormulaNode,
    result_type: (row.result_type || 'number') as FormulaResultType,
    format_options: (row.format_options as Record<string, unknown>) || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function useCustomMetrics() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['custom-metrics'],
    queryFn: async (): Promise<CustomMetricDefinition[]> => {
      const { data, error } = await (supabase
        .from('custom_metrics') as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as CustomMetricRow[]).map(rowToDefinition);
    },
  });

  const createMetric = useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      formula: FormulaNode;
      result_type: FormulaResultType;
      format_options?: Record<string, unknown>;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await (supabase
        .from('custom_metrics') as any)
        .insert({
          user_id: userData.user.id,
          name: input.name,
          description: input.description || null,
          formula: input.formula as unknown as Record<string, unknown>,
          result_type: input.result_type,
          format_options: (input.format_options || {}) as unknown as Record<string, unknown>,
        })
        .select()
        .single();
      if (error) throw error;
      return rowToDefinition(data as unknown as CustomMetricRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-metrics'] });
      toast({ title: 'Custom metric created' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error creating metric', description: e.message, variant: 'destructive' });
    },
  });

  const updateMetric = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      description?: string;
      formula?: FormulaNode;
      result_type?: FormulaResultType;
      format_options?: Record<string, unknown>;
    }) => {
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.formula !== undefined) updates.formula = input.formula;
      if (input.result_type !== undefined) updates.result_type = input.result_type;
      if (input.format_options !== undefined) updates.format_options = input.format_options;

      const { data, error } = await (supabase
        .from('custom_metrics') as any)
        .update(updates)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return rowToDefinition(data as unknown as CustomMetricRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-metrics'] });
      toast({ title: 'Custom metric updated' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error updating metric', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMetric = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('custom_metrics') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-metrics'] });
      toast({ title: 'Custom metric deleted' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error deleting metric', description: e.message, variant: 'destructive' });
    },
  });

  return {
    metrics: query.data ?? [],
    isLoading: query.isLoading,
    createMetric,
    updateMetric,
    deleteMetric,
  };
}
