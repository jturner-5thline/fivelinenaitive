import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ProactiveNudge {
  id: string;
  type: 'stale_deal' | 'overdue_tasks' | 'expiring_term_sheet' | 'missing_docs';
  message: string;
  actions: Array<{ label: string; prompt: string }>;
  priority: number; // lower = higher priority
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  nudges: ProactiveNudge[];
  timestamp: number;
  contextKey: string;
}

function getPageContext() {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'deals' && parts[1]) return { page: 'deal-detail', entityId: parts[1] };
  if (parts[0] === 'deals') return { page: 'deals', entityId: null };
  if (parts[0] === 'tasks') return { page: 'tasks', entityId: null };
  return { page: parts[0] || 'dashboard', entityId: null };
}

export function useProactiveNudges() {
  const { user } = useAuth();
  const [nudges, setNudges] = useState<ProactiveNudge[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const cacheRef = useRef<CacheEntry | null>(null);

  const fetchNudges = useCallback(async () => {
    if (!user) return;

    const ctx = getPageContext();
    const contextKey = `${ctx.page}:${ctx.entityId || ''}`;

    // Check cache
    if (
      cacheRef.current &&
      cacheRef.current.contextKey === contextKey &&
      Date.now() - cacheRef.current.timestamp < CACHE_TTL
    ) {
      setNudges(cacheRef.current.nudges);
      return;
    }

    const results: ProactiveNudge[] = [];

    try {
      // ── Deal-specific nudges ──
      if (ctx.page === 'deal-detail' && ctx.entityId) {
        // Stale deal check
        const { data: activities } = await supabase
          .from('activity_logs')
          .select('created_at')
          .eq('deal_id', ctx.entityId)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastActivity = activities?.[0]?.created_at;
        if (lastActivity) {
          const daysSince = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince >= 14) {
            results.push({
              id: `stale_${ctx.entityId}`,
              type: 'stale_deal',
              message: `This deal hasn't had activity in ${daysSince} days. Want me to draft a follow-up?`,
              actions: [
                { label: 'Draft follow-up', prompt: 'Draft a follow-up email for this deal' },
                { label: 'Dismiss', prompt: '' },
              ],
              priority: 3,
            });
          }
        } else {
          // No activity at all
          results.push({
            id: `stale_${ctx.entityId}`,
            type: 'stale_deal',
            message: `This deal has no recorded activity. Want me to draft an initial outreach?`,
            actions: [
              { label: 'Draft follow-up', prompt: 'Draft a follow-up email for this deal' },
              { label: 'Dismiss', prompt: '' },
            ],
            priority: 3,
          });
        }

        // Expiring term sheet check
        const { data: milestones } = await supabase
          .from('deal_milestones')
          .select('title, due_date, completed')
          .eq('deal_id', ctx.entityId)
          .eq('completed', false);

        const termSheetMilestones = (milestones || []).filter(
          (m: any) => m.title?.toLowerCase().includes('term sheet') && m.due_date
        );

        for (const ts of termSheetMilestones) {
          const daysUntil = Math.floor((new Date(ts.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysUntil >= 0 && daysUntil <= 7) {
            results.push({
              id: `ts_${ctx.entityId}_${ts.due_date}`,
              type: 'expiring_term_sheet',
              message: `Term sheet expires in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`,
              actions: [
                { label: 'Draft response', prompt: 'Draft a term sheet response for this deal' },
                { label: 'Create reminder', prompt: 'Create a task to follow up on the term sheet expiration' },
              ],
              priority: 1,
            });
          }
        }
      }

      // ── Dashboard / Tasks page nudges ──
      if (ctx.page === 'dashboard' || ctx.page === 'tasks') {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: overdueTasks, count } = await supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .in('status', ['todo', 'in_progress'])
          .lt('due_date', todayStr);

        const overdueCount = count || 0;
        if (overdueCount > 0) {
          results.push({
            id: `overdue_${todayStr}`,
            type: 'overdue_tasks',
            message: `You have ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}.`,
            actions: [
              { label: 'Show overdue tasks', prompt: 'Show me my overdue tasks' },
            ],
            priority: 2,
          });
        }
      }
    } catch (err) {
      console.error('Proactive nudges error:', err);
    }

    // Sort by priority and limit to 2
    results.sort((a, b) => a.priority - b.priority);
    const topNudges = results.slice(0, 2);

    cacheRef.current = { nudges: topNudges, timestamp: Date.now(), contextKey };
    setNudges(topNudges);
  }, [user]);

  // Re-fetch when pathname changes
  useEffect(() => {
    fetchNudges();

    const handlePopState = () => {
      cacheRef.current = null; // invalidate cache on navigation
      fetchNudges();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchNudges]);

  const dismissNudge = useCallback((nudgeId: string) => {
    setDismissed((prev) => new Set(prev).add(nudgeId));
  }, []);

  const dismissAllNudges = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const n of nudges) next.add(n.id);
      return next;
    });
  }, [nudges]);

  const visibleNudges = nudges.filter((n) => !dismissed.has(n.id));

  return { nudges: visibleNudges, dismissNudge, dismissAllNudges };
}
