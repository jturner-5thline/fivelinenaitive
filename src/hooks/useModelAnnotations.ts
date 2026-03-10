import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Annotation {
  id: string;
  deal_id: string;
  user_id: string;
  target_type: 'cell' | 'chart' | 'section' | 'kpi';
  target_ref: string;
  content: string;
  mentions: string[];
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user_name?: string;
  user_avatar?: string;
}

export function useModelAnnotations(dealId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('model_annotations' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnotations((data as any[]) || []);
    } catch (err) {
      console.error('Failed to load annotations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`annotations-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'model_annotations',
          filter: `deal_id=eq.${dealId}`,
        },
        () => {
          load(); // Reload on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId, load]);

  const addAnnotation = useCallback(async (
    targetType: Annotation['target_type'],
    targetRef: string,
    content: string,
    mentions: string[] = []
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be signed in to comment');
      return null;
    }

    const { data, error } = await supabase
      .from('model_annotations' as any)
      .insert({
        deal_id: dealId,
        user_id: user.id,
        target_type: targetType,
        target_ref: targetRef,
        content,
        mentions,
      } as any)
      .select()
      .single();

    if (error) {
      console.error('Failed to add annotation:', error);
      toast.error('Failed to add comment');
      return null;
    }

    return data as unknown as Annotation;
  }, [dealId]);

  const resolveAnnotation = useCallback(async (annotationId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('model_annotations' as any)
      .update({
        resolved: true,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      } as any)
      .eq('id', annotationId);

    if (error) {
      toast.error('Failed to resolve comment');
    }
  }, []);

  const deleteAnnotation = useCallback(async (annotationId: string) => {
    const { error } = await supabase
      .from('model_annotations' as any)
      .delete()
      .eq('id', annotationId);

    if (error) {
      toast.error('Failed to delete comment');
    }
  }, []);

  const getAnnotationsForTarget = useCallback((targetType: string, targetRef: string) => {
    return annotations.filter(a => a.target_type === targetType && a.target_ref === targetRef);
  }, [annotations]);

  const unresolvedCount = useMemo(() => annotations.filter(a => !a.resolved).length, [annotations]);

  return {
    annotations,
    isLoading,
    unresolvedCount,
    addAnnotation,
    resolveAnnotation,
    deleteAnnotation,
    getAnnotationsForTarget,
    refresh: load,
  };
}
