import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useTemplateFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['template-favorites', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('template_favorites')
        .select('template_id')
        .eq('user_id', user.id);

      if (error) throw error;
      return data.map(f => f.template_id);
    },
    enabled: !!user,
  });

  const addFavorite = useMutation({
    mutationFn: async (templateId: string) => {
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('template_favorites')
        .insert({
          user_id: user.id,
          template_id: templateId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-favorites'] });
      toast.success('Added to favorites');
    },
    onError: (error) => {
      console.error('Error adding favorite:', error);
      toast.error('Failed to add favorite');
    },
  });

  const removeFavorite = useMutation({
    mutationFn: async (templateId: string) => {
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('template_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('template_id', templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-favorites'] });
      toast.success('Removed from favorites');
    },
    onError: (error) => {
      console.error('Error removing favorite:', error);
      toast.error('Failed to remove favorite');
    },
  });

  const toggleFavorite = (templateId: string) => {
    if (favorites.includes(templateId)) {
      removeFavorite.mutate(templateId);
    } else {
      addFavorite.mutate(templateId);
    }
  };

  const isFavorite = (templateId: string) => favorites.includes(templateId);

  return {
    favorites,
    isLoading,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
  };
}
