import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';

interface NotificationPreview {
  id: string;
  message: string;
  timestamp: number;
}

export function HeaderNotificationPreview() {
  const { user } = useAuth();
  const [preview, setPreview] = useState<NotificationPreview | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const showPreview = useCallback((message: string, id: string) => {
    setPreview({ id, message, timestamp: Date.now() });
    setIsVisible(true);

    setTimeout(() => {
      setIsVisible(false);
    }, 5000);
  }, []);

  // Listen for flex_notifications (engagement alerts)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('header-notification-preview')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'flex_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          showPreview(n.title || n.message || 'New notification', n.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'flex_info_notifications',
        },
        (payload) => {
          const n = payload.new as any;
          const msg = n.message || `${n.lender_name || 'A lender'} requested access`;
          showPreview(msg, n.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lender_sync_requests',
        },
        (payload) => {
          const n = payload.new as any;
          if (n.status === 'pending') {
            const lenderName = n.existing_lender_name || 
              (n.incoming_data as any)?.name || 'Unknown lender';
            showPreview(`FLEx Sync: "${lenderName}" requires review`, n.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showPreview]);

  if (!preview || !isVisible) return null;

  return (
    <div
      key={preview.id}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-foreground max-w-xs truncate transition-all duration-300 ${
        isVisible ? 'animate-fade-in opacity-100' : 'opacity-0'
      }`}
    >
      <Bell className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="truncate">{preview.message}</span>
    </div>
  );
}
