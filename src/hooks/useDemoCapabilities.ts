import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export interface DemoCapabilities {
  canBuildWriteup: boolean;
  canPushFlex: boolean;
  canAiSync: boolean;
  isDemoUser: boolean;
  isLoading: boolean;
}

const DEMO_EMAILS = ['demo@example.com', 'demo@5thline.co'];

export function useDemoCapabilities(): DemoCapabilities {
  const { user } = useAuth();
  const isDemoUser = !!user?.email && DEMO_EMAILS.includes(user.email);

  const { data, isLoading } = useQuery({
    queryKey: ['demo-capabilities', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_permissions')
        .select('can_build_writeup, can_push_flex, can_ai_sync')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading capabilities:', error);
        return null;
      }
      return data;
    },
    enabled: !!user?.id && isDemoUser,
    staleTime: 120_000,
  });

  // Non-demo users get all capabilities
  if (!isDemoUser) {
    return {
      canBuildWriteup: true,
      canPushFlex: true,
      canAiSync: true,
      isDemoUser: false,
      isLoading: false,
    };
  }

  return {
    canBuildWriteup: data?.can_build_writeup ?? true,
    canPushFlex: data?.can_push_flex ?? false,
    canAiSync: data?.can_ai_sync ?? false,
    isDemoUser: true,
    isLoading,
  };
}
