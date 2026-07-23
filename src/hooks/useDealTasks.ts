import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
import { deriveTaskAssociations, logTaskCompletionAcrossTimelines } from '@/lib/taskAssociations';
import {
  TASK_STATUS_COMPLETE,
  TASK_STATUS_REOPENED,
  invalidateAllTaskCaches,
  isTaskCompleted,
} from '@/lib/taskCache';

async function fireZapierWebhook(eventType: string, payload: Record<string, any>) {
  try {
    await supabase.functions.invoke('fire-zapier-webhook', {
      body: { event_type: eventType, payload },
    });
  } catch (e) {
    console.error('Zapier webhook fire failed:', e);
  }
}

export interface DealTask {
  id: string;
  deal_id: string | null;
  assigned_to: string;
  assigned_by: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealTasks(dealId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Read via React Query so this hook participates in the global task
  // cache. When ANY surface completes / edits / deletes a task, the
  // shared `invalidateAllTaskCaches` invalidates `['deal-tasks', …]`
  // and this list re-fetches automatically — no more local-state drift.
  const { data: tasks = [], isLoading, refetch } = useQuery({
    queryKey: ['deal-tasks', dealId],
    enabled: !!dealId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('deal_id', dealId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as DealTask[]) || [];
    },
  });

  const createTask = useCallback(async (task: {
    title: string;
    description?: string;
    due_date?: string;
    assigned_to: string;
  }) => {
    if (!dealId || !user) return null;
    try {
      // Derive contact + crm_company from the deal so this task is fully associated.
      const derived = await deriveTaskAssociations({ deal_id: dealId });

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          deal_id: dealId,
          contact_id: derived.contact_id || null,
          crm_company_id: derived.crm_company_id || null,
          assigned_to: task.assigned_to,
          assigned_by: user.id,
          title: task.title,
          description: task.description || null,
          due_date: task.due_date || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      // Sync every task-aware cache so the new task shows up everywhere
      // immediately (Tasks page, rundowns, dashboard widgets).
      invalidateAllTaskCaches(queryClient);

      // Fire Zapier webhooks with assignee profile info for Asana matching
      if (data) {
        const createdTask = data as any;
        const taskUrl = `https://naitive.co/tasks?task=${createdTask.id}`;

        // Fetch assignee profile to include email/name for Asana user matching
        const { data: assigneeProfile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', task.assigned_to)
          .single();

        const webhookPayload = {
          task_id: createdTask.id,
          title: task.title,
          description: task.description || null,
          assigned_to: task.assigned_to,
          assigned_to_email: assigneeProfile?.email || null,
          assigned_to_name: assigneeProfile?.display_name || null,
          assigned_by: user.id,
          due_date: task.due_date || null,
          deal_id: dealId,
          task_url: taskUrl,
        };
        fireZapierWebhook('task_created', webhookPayload);
        fireZapierWebhook('task_assigned', webhookPayload);

        // Native Asana sync (fire-and-forget)
        (async () => {
          try {
            // Get user's company ID
            const { data: memberData } = await supabase
              .from('company_members')
              .select('company_id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle();

            const ctx = await getAsanaSyncContext(memberData?.company_id || null);
            if (ctx) {
              await syncTaskToAsana(ctx, {
                id: createdTask.id,
                title: task.title,
                description: task.description,
                due_date: task.due_date,
                assignee_email: assigneeProfile?.email || null,
              });
            }
          } catch (e) {
            console.error('Asana sync error:', e);
          }
        })();

        // Send enriched email notification to assignee (skip self-assignment, fire-and-forget)
        if (task.assigned_to !== user.id && assigneeProfile?.email) {
          // Fetch all context in parallel for the enriched email
          const [assignerRes, dealRes, lenderRes, subtaskRes, pipelineRes] = await Promise.all([
            supabase.from('profiles').select('display_name, email').eq('user_id', user.id).single(),
            supabase.from('deals').select('company, value, stage, status, pipeline_id, manager, deal_owner, company_id').eq('id', dealId).single(),
            createdTask.lender_id
              ? supabase.from('deal_lenders').select('name, tracking_status, stage').eq('id', createdTask.lender_id).single()
              : Promise.resolve({ data: null }),
            supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('parent_task_id', createdTask.id),
            null as any, // placeholder — pipeline fetched after deal
          ]);

          const assignerProfile = assignerRes.data;
          const dealData = dealRes.data as any;
          const lenderData = lenderRes.data as any;
          const subtaskCount = subtaskRes?.count || 0;

          // Fetch pipeline name if deal has one
          let pipelineName: string | null = null;
          if (dealData?.pipeline_id) {
            const { data: pipelineData } = await supabase
              .from('deal_pipelines')
              .select('name')
              .eq('id', dealData.pipeline_id)
              .single();
            pipelineName = pipelineData?.name || null;
          }

          // Fetch deal manager name if present
          let managerName: string | null = null;
          const managerId = dealData?.deal_owner || dealData?.manager;
          if (managerId) {
            const { data: managerProfile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('user_id', managerId)
              .single();
            managerName = managerProfile?.display_name || null;
          }

          const emailMetadata: Record<string, any> = {
            task_title: task.title,
            task_description: task.description || null,
            due_date: task.due_date || null,
            priority: createdTask.priority || 'normal',
            task_type: createdTask.task_type || null,
            subtask_count: subtaskCount,
            assigner_name: assignerProfile?.display_name || 'A team member',
            assigner_email: assignerProfile?.email || null,
            action_url: taskUrl,
          };

          if (dealData) {
            emailMetadata.deal_name = dealData.company || null;
            emailMetadata.deal_value = dealData.value || null;
            emailMetadata.deal_stage = dealData.stage || null;
            emailMetadata.deal_status = dealData.status || null;
            emailMetadata.deal_pipeline = pipelineName;
            emailMetadata.deal_manager = managerName;
          }

          if (lenderData) {
            emailMetadata.lender_name = lenderData.name || null;
            emailMetadata.lender_status = lenderData.tracking_status || null;
            emailMetadata.lender_stage = lenderData.stage || null;
          }

          supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'task_assigned',
              user_id: task.assigned_to,
              deal_id: dealId,
              deal_name: dealData?.company || dealId,
              metadata: emailMetadata,
            },
          }).catch(e => console.error('Task assignment email failed:', e));

          // In-app notification for the assignee (surfaces in the bell menu).
          supabase.rpc('create_task_inapp_notification' as any, {
            _task_id: createdTask.id,
            _recipient_user_id: task.assigned_to,
            _trigger_key: 'task_assigned',
            _title: 'New task assigned',
            _body: `${assignerProfile?.display_name || 'A teammate'} assigned you "${task.title}"${dealData?.company ? ` on ${dealData.company}` : ''}`,
            _context: { task_id: createdTask.id, task_title: task.title, deal_id: dealId },
          }).then(({ error }) => {
            if (error) console.warn('[useDealTasks] in-app notify failed', error);
          });
        }
      }

      return data;
    } catch (error) {
      console.error('Error creating task:', error);
      return null;
    }
  }, [dealId, user]);

  const updateTaskStatus = useCallback(async (taskId: string, status: string) => {
    try {
      // Normalize to the canonical status literal so this surface can
      // never write a value that other surfaces won't recognise. Any
      // historic `'completed'` from existing callers is rewritten to
      // `'complete'` before persistence.
      const normalized =
        status === 'completed' || status === 'complete'
          ? TASK_STATUS_COMPLETE
          : status;
      const completing = normalized === TASK_STATUS_COMPLETE;
      const updates: any = { status: normalized };
      if (completing) {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user?.id ?? null;
      } else {
        updates.completed_at = null;
        updates.completed_by = null;
      }
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);
      if (error) throw error;
      // Cross-surface sync: invalidate every task-aware cache so the
      // Tasks page, Daily Rundown, Deal Rundown, and any open panels
      // all reflect the new completion state immediately.
      invalidateAllTaskCaches(queryClient);

      // Cross-log completion to all linked timelines.
      if (completing) {
        try {
          const { data: full } = await supabase
            .from('tasks')
            .select('id, title, deal_id, contact_id, crm_company_id')
            .eq('id', taskId)
            .maybeSingle();
          if (full && (full.deal_id || full.contact_id || full.crm_company_id)) {
            let actorName: string | null = null;
            if (user) {
              const { data: prof } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('user_id', user.id)
                .maybeSingle();
              actorName = prof?.display_name || null;
            }
            void logTaskCompletionAcrossTimelines({
              taskId: full.id,
              taskTitle: full.title,
              deal_id: full.deal_id,
              contact_id: full.contact_id,
              crm_company_id: full.crm_company_id,
              actorUserId: user?.id ?? null,
              actorDisplayName: actorName,
            });
          }
        } catch (e) {
          console.warn('[useDealTasks] cross-log failed', e);
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating task:', error);
      return false;
    }
  }, [user, queryClient]);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw error;
      invalidateAllTaskCaches(queryClient);
      return true;
    } catch (error) {
      console.error('Error deleting task:', error);
      return false;
    }
  }, [queryClient]);

  return { tasks, isLoading, createTask, updateTaskStatus, deleteTask, refetch };
}
