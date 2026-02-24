import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CheckSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface TaskNotification {
  id: string;
  title: string;
  taskId: string;
}

export function TaskAssignmentBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`task-assignment-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tasks',
          filter: `assigned_to=eq.${user.id}`,
        },
        (payload) => {
          const task = payload.new as any;
          // Don't show banner for self-assigned tasks
          if (task.assigned_by === user.id) return;

          const notifId = `task-${task.id}-${Date.now()}`;
          setNotifications((prev) => [
            ...prev,
            { id: notifId, title: task.title, taskId: task.id },
          ]);

          // Auto-dismiss after 5 seconds
          setTimeout(() => dismiss(notifId), 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, dismiss]);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col items-center pointer-events-none">
      {notifications.map((notif) => (
        <BannerItem
          key={notif.id}
          title={notif.title}
          onDismiss={() => dismiss(notif.id)}
          onClick={() => {
            dismiss(notif.id);
            navigate('/tasks');
          }}
        />
      ))}
    </div>
  );
}

function BannerItem({
  title,
  onDismiss,
  onClick,
}: {
  title: string;
  onDismiss: () => void;
  onClick: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Slide in
    requestAnimationFrame(() => setVisible(true));

    // Start fade out after 4s
    const fadeTimer = setTimeout(() => setFading(true), 4000);

    return () => clearTimeout(fadeTimer);
  }, []);

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-2xl mx-4 mt-3 px-4 py-3 rounded-lg flex items-center gap-3 cursor-pointer',
        'bg-primary text-primary-foreground shadow-lg',
        'transition-all duration-500 ease-out',
        visible && !fading && 'translate-y-0 opacity-100',
        !visible && '-translate-y-full opacity-0',
        fading && 'opacity-0 -translate-y-2'
      )}
      onClick={onClick}
    >
      <CheckSquare className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-sm font-medium truncate">
        New task assigned to you: {title}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="shrink-0 rounded-full p-1 hover:bg-primary-foreground/20 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
