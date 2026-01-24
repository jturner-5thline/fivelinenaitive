import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface LenderSyncRequest {
  id: string;
  source_system: string;
  request_type: 'new_lender' | 'update_existing' | 'merge_conflict';
  incoming_data: Record<string, unknown>;
  existing_lender_name: string | null;
  status: string;
  created_at: string;
}

export function useLenderSyncRealtimeNotifications(
  onNewRequest?: () => void
) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Subscribe to realtime changes on lender_sync_requests table
    const channel = supabase
      .channel('lender-sync-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lender_sync_requests',
        },
        (payload) => {
          const newRequest = payload.new as LenderSyncRequest;
          
          // Only show toast for pending requests
          if (newRequest.status === 'pending') {
            const lenderName = newRequest.existing_lender_name || 
              (newRequest.incoming_data as Record<string, unknown>)?.name as string || 
              'Unknown lender';
            
            const typeLabel = {
              'new_lender': 'New lender',
              'update_existing': 'Lender update',
              'merge_conflict': 'Merge conflict',
            }[newRequest.request_type] || 'Sync request';

            toast({
              title: `FLEx Sync: ${typeLabel}`,
              description: `"${lenderName}" requires your review`,
              duration: 8000,
            });

            // Callback to refetch data
            onNewRequest?.();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [onNewRequest]);
}
