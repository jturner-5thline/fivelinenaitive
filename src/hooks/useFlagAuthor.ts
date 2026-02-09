import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FlagAuthorInfo {
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
}

export function useFlagAuthor(dealId: string | null, isOpen: boolean) {
  const [author, setAuthor] = useState<FlagAuthorInfo | null>(null);

  useEffect(() => {
    if (!dealId || !isOpen) return;

    const fetchAuthor = async () => {
      // Try to get the latest flag note author
      const { data: noteData } = await supabase
        .from('deal_flag_notes' as any)
        .select('user_id, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(1);

      const notes = (noteData || []) as unknown as { user_id: string | null; created_at: string }[];
      let userId: string | null = null;
      let createdAt: string | null = null;

      if (notes.length > 0 && notes[0].user_id) {
        userId = notes[0].user_id;
        createdAt = notes[0].created_at;
      } else {
        // Fallback to deal owner
        const { data: dealData } = await supabase
          .from('deals')
          .select('user_id, updated_at')
          .eq('id', dealId)
          .single();

        if (dealData) {
          userId = dealData.user_id;
          createdAt = dealData.updated_at;
        }
      }

      if (!userId) {
        setAuthor(null);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles_public' as any)
        .select('display_name, avatar_url')
        .eq('user_id', userId)
        .single();

      const profile = profileData as unknown as { display_name: string | null; avatar_url: string | null } | null;

      setAuthor({
        displayName: profile?.display_name || null,
        avatarUrl: profile?.avatar_url || null,
        createdAt,
      });
    };

    fetchAuthor();
  }, [dealId, isOpen]);

  return author;
}
