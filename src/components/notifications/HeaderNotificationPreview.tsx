import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [isLeaving, setIsLeaving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const dismiss = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsLeaving(false);
      setPreview(null);
    }, 400);
  }, []);

  const showPreview = useCallback((message: string, id: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsLeaving(false);
    setPreview({ id, message, timestamp: Date.now() });
    setIsVisible(true);

    timeoutRef.current = setTimeout(() => {
      dismiss();
    }, 5000);
  }, [dismiss]);

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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!preview || !isVisible) return null;

  return (
    <>
      <style>{`
        @keyframes notif-slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div key={preview.id} className="overflow-hidden">
        <div
          className={`w-full flex items-center gap-3 px-5 py-4 bg-[hsl(220,80%,55%)] text-white text-sm font-medium transition-all duration-300 ease-out ${
            isLeaving
              ? 'opacity-0 -translate-y-full'
              : 'opacity-100 translate-y-0'
          }`}
          style={!isLeaving ? { animation: 'notif-slide-down 0.4s ease-out' } : undefined}
        >
          <Bell className="h-5 w-5 shrink-0" />
          <span className="truncate flex-1">{preview.message}</span>
          <button
            onClick={dismiss}
            className="text-white/70 hover:text-white ml-2 shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
