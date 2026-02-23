import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface WeeklyDealHoursView {
  dealId: string;
  dealName: string;
  stage: string;
  status: string;
  value: number;
  role: string;
  existingHours: number | null;
}

export interface WeeklyHoursTask {
  id: string;
  status: string;
  deals_submitted: number;
  total_deals: number;
  completed_at: string | null;
}

export interface WeeklyHoursSummary {
  deals: WeeklyDealHoursView[];
  week: string;
  task: WeeklyHoursTask | null;
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

export function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function useWeeklyHours(week?: string) {
  const queryClient = useQueryClient();
  const weekStart = week || getWeekStart();
  const key = ['weekly-hours', weekStart];

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<WeeklyHoursSummary> => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/weekly-hours-api?action=weekly-summary&week=${weekStart}`;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch weekly summary');
      return res.json();
    },
  });

  const saveEntry = useMutation({
    mutationFn: async ({ dealId, hours }: { dealId: string; hours: number }) => {
      const { data, error } = await supabase.functions.invoke('weekly-hours-api?action=save-entry', {
        body: { dealId, week: weekStart, hours },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error('Failed to save hours'),
  });

  const completeTask = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('weekly-hours-api?action=complete-task', {
        body: { week: weekStart },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success('Weekly hours submitted');
    },
    onError: () => toast.error('Failed to complete weekly task'),
  });

  return {
    deals: data?.deals || [],
    week: data?.week || weekStart,
    task: data?.task || null,
    isLoading,
    error,
    saveEntry,
    completeTask,
  };
}
