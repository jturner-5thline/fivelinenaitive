import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface VideoResource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  duration_seconds: number | null;
  level: string;
  video_url: string;
  thumbnail_url: string | null;
  status: string;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface VideoView {
  id: string;
  video_resource_id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
}

export function useVideoResources(category?: string) {
  return useQuery({
    queryKey: ['video-resources', category],
    queryFn: async () => {
      let q = supabase
        .from('video_resources')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (category && category !== 'all') q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as VideoResource[];
    },
  });
}

export function useVideoCategories() {
  return useQuery({
    queryKey: ['video-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('video_resources')
        .select('category')
        .eq('status', 'published');
      if (error) throw error;
      const cats = [...new Set((data || []).map((d: any) => d.category))];
      return cats.sort();
    },
  });
}

export function useMyVideoViews() {
  return useQuery({
    queryKey: ['my-video-views'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('video_views')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []) as unknown as VideoView[];
    },
  });
}

export function useTrackVideoView() {
  const qc = useQueryClient();
  const { company } = useCompany();
  return useMutation({
    mutationFn: async ({ videoId, completed }: { videoId: string; completed?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check existing view
      const { data: existing } = await supabase
        .from('video_views')
        .select('id')
        .eq('video_resource_id', videoId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        if (completed) {
          await supabase
            .from('video_views')
            .update({ completed_at: new Date().toISOString() } as any)
            .eq('id', existing.id);
        }
      } else {
        await supabase
          .from('video_views')
          .insert({
            video_resource_id: videoId,
            user_id: user.id,
            company_id: company?.id,
            ...(completed ? { completed_at: new Date().toISOString() } : {}),
          } as any);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-video-views'] }),
  });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
