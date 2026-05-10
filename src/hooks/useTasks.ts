import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { getAsanaSyncContext, syncTaskToAsana, updateTaskInAsana } from '@/hooks/useAsanaTaskSync';
import { toast } from 'sonner';
import { deriveTaskAssociations, logTaskCompletionAcrossTimelines } from '@/lib/taskAssociations';

async function fireZapierWebhook(eventType: string, payload: Record<string, any>) {
  try {
    await supabase.functions.invoke('fire-zapier-webhook', {
      body: { event_type: eventType, payload },
    });
  } catch (e) {
    console.error('Zapier webhook fire failed:', e);
  }
}

async function sendTaskAssignedEmail(params: {
  taskId: string;
  taskTitle: string;
  assigneeEmail: string;
  assigneeName?: string;
  assignedByName?: string;
  dealName?: string;
  dueDate?: string | null;
}) {
  try {
    const taskUrl = `https://fivelinenaitive.lovable.app/tasks?task=${params.taskId}`;
    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'task-assigned',
        recipientEmail: params.assigneeEmail,
        idempotencyKey: `task-assigned-${params.taskId}-${Date.now()}`,
        templateData: {
          assigneeName: params.assigneeName || undefined,
          taskTitle: params.taskTitle,
          dealName: params.dealName || undefined,
          assignedByName: params.assignedByName || undefined,
          dueDate: params.dueDate || undefined,
          taskUrl,
        },
      },
    });
    console.log('[TaskEmail] Task assigned email sent to', params.assigneeEmail);
  } catch (e) {
    console.error('[TaskEmail] Failed to send task assigned email:', e);
  }
}

export interface Task {
  id: string;
  project_id: string | null;
  section_id: string | null;
  parent_task_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  crm_company_id: string | null;
  company_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  status: string;
  priority: string;
  task_type: string;
  due_date: string | null;
  start_date: string | null;
  position: number;
  completed_at: string | null;
  completed_by: string | null;
  archived_at: string | null;
  is_starred: boolean;
  recurrence_rule: string | null;
  recurrence_source_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assignee_profile?: { display_name: string; avatar_url: string | null; email: string } | null;
  creator_profile?: { display_name: string; avatar_url: string | null; email: string } | null;
  deal?: { company: string } | null;
  contact?: { full_name: string } | null;
  crm_company?: { name: string } | null;
  project?: { name: string; color: string; icon: string } | null;
  subtasks?: Task[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  author_profile?: { display_name: string; avatar_url: string | null } | null;
}

export interface TaskActivityEvent {
  id: string;
  task_id: string;
  actor_id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  actor_profile?: { display_name: string; avatar_url: string | null } | null;
}

export type TaskOwnerFilter = 'mine' | 'others' | 'all';
const TASKS_KEY = ['my-tasks'];

function buildBaseTasksQuery() {
  return supabase
    .from('tasks')
    .select('*')
    .is('archived_at', null)
    .is('parent_task_id', null);
}

function sortAndDedupeTasks(tasks: Task[]) {
  const byId = new Map<string, Task>();
  tasks.forEach(task => {
    if (!byId.has(task.id)) byId.set(task.id, task);
  });

  return Array.from(byId.values()).sort((a, b) => {
    const positionDelta = (a.position ?? 0) - (b.position ?? 0);
    if (positionDelta !== 0) return positionDelta;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function calculateNextDueDate(currentDueDate: string | null, rule: string): string | null {
  if (!currentDueDate) return null;
  const date = new Date(currentDueDate + 'T00:00:00');
  // Custom interval format: "every:<N>:<days|weeks>"
  if (rule.startsWith('every:')) {
    const [, nStr, unit] = rule.split(':');
    const n = Math.max(1, Math.min(365, parseInt(nStr, 10) || 1));
    if (unit === 'days') {
      date.setDate(date.getDate() + n);
      return date.toISOString().split('T')[0];
    }
    if (unit === 'weeks') {
      date.setDate(date.getDate() + n * 7);
      return date.toISOString().split('T')[0];
    }
    if (unit === 'months') {
      date.setMonth(date.getMonth() + n);
      return date.toISOString().split('T')[0];
    }
    if (unit === 'years') {
      date.setFullYear(date.getFullYear() + n);
      return date.toISOString().split('T')[0];
    }
    return null;
  }
  switch (rule) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekdays':
      do { date.setDate(date.getDate() + 1); } while (date.getDay() === 0 || date.getDay() === 6);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    default:
      return null;
  }
  return date.toISOString().split('T')[0];
}

export function useMyTasks(ownerFilter: TaskOwnerFilter = 'mine') {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['my-tasks', ownerFilter],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      if (ownerFilter === 'mine') {
        const [assignedResult, collaboratorResult] = await Promise.all([
          buildBaseTasksQuery()
            .eq('assigned_to', user.id)
            .order('position', { ascending: true })
            .order('created_at', { ascending: false }),
          supabase
            .from('task_collaborators' as any)
            .select('task_id')
            .eq('user_id', user.id),
        ]);

        if (assignedResult.error) throw assignedResult.error;
        if (collaboratorResult.error) throw collaboratorResult.error;

        const assignedTasks = (assignedResult.data || []) as Task[];
        const collaboratorRows = (collaboratorResult.data || []) as unknown as { task_id: string }[];
        const collaboratorTaskIds = [...new Set(collaboratorRows
          .map(row => row.task_id)
          .filter(Boolean))];

        const assignedTaskIds = new Set(assignedTasks.map(task => task.id));
        const missingCollaboratorTaskIds = collaboratorTaskIds.filter(taskId => !assignedTaskIds.has(taskId));

        if (missingCollaboratorTaskIds.length === 0) {
          return sortAndDedupeTasks(assignedTasks);
        }

        const { data: collaboratorTasks, error: collaboratorTasksError } = await buildBaseTasksQuery()
          .in('id', missingCollaboratorTaskIds)
          .order('position', { ascending: true })
          .order('created_at', { ascending: false });

        if (collaboratorTasksError) throw collaboratorTasksError;

        return sortAndDedupeTasks([
          ...assignedTasks,
          ...((collaboratorTasks || []) as Task[]),
        ]);
      }

      let query = buildBaseTasksQuery()
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (ownerFilter === 'others') {
        query = query.neq('assigned_to', user.id);
        if (company?.id) {
          query = query.eq('company_id', company.id);
        }
      } else {
        // 'all' — fetch all company tasks
        if (company?.id) {
          query = query.eq('company_id', company.id);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return sortAndDedupeTasks((data || []) as Task[]);
    },
  });

  // Fetch profiles for all tasks
  const userIds = [...new Set(tasks.flatMap(t => [t.assigned_to, t.assigned_by].filter(Boolean)))];
  const { data: profiles = [] } = useQuery({
    queryKey: ['task-profiles', userIds.sort().join(',')],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .in('user_id', userIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch deal names for tasks with deal_id
  const dealIds = [...new Set(tasks.map(t => t.deal_id).filter(Boolean))] as string[];
  const { data: deals = [] } = useQuery({
    queryKey: ['task-deals', dealIds.sort().join(',')],
    enabled: dealIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company')
        .in('id', dealIds);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch contact names for tasks with contact_id
  const contactIds = [...new Set(tasks.map(t => t.contact_id).filter(Boolean))] as string[];
  const { data: contacts = [] } = useQuery({
    queryKey: ['task-contacts', contactIds.sort().join(',')],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name')
        .in('id', contactIds);
      if (error) throw error;
      return (data || []).map(c => ({
        id: c.id,
        full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Contact',
      }));
    },
  });

  // Fetch CRM company names for tasks with crm_company_id
  const crmCompanyIds = [...new Set(tasks.map(t => t.crm_company_id).filter(Boolean))] as string[];
  const { data: crmCompanies = [] } = useQuery({
    queryKey: ['task-crm-companies', crmCompanyIds.sort().join(',')],
    enabled: crmCompanyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name')
        .in('id', crmCompanyIds);
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));
  const dealMap = Object.fromEntries(deals.map(d => [d.id, { company: d.company }]));
  const contactMap = Object.fromEntries(contacts.map(c => [c.id, { full_name: c.full_name }]));
  const crmCompanyMap = Object.fromEntries(crmCompanies.map(c => [c.id, { name: c.name }]));

  const enrichedTasks = tasks.map(t => ({
    ...t,
    assignee_profile: profileMap[t.assigned_to] || null,
    creator_profile: profileMap[t.assigned_by] || null,
    deal: t.deal_id ? dealMap[t.deal_id] || null : null,
    contact: t.contact_id ? contactMap[t.contact_id] || null : null,
    crm_company: t.crm_company_id ? crmCompanyMap[t.crm_company_id] || null : null,
  }));

  const createTask = useMutation({
    mutationFn: async (task: { title: string; description?: string; assigned_to?: string; priority?: string; due_date?: string; status?: string; project_id?: string; section_id?: string; deal_id?: string; contact_id?: string; crm_company_id?: string; recurrence_rule?: string | null; recurrence_end_date?: string | null }) => {
      if (!user) throw new Error('Not authenticated');
      // Get company_id
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      // Auto-derive missing Deal / Contact / Company associations.
      const derived = await deriveTaskAssociations({
        deal_id: task.deal_id ?? null,
        contact_id: task.contact_id ?? null,
        crm_company_id: task.crm_company_id ?? null,
      });

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: task.title,
          description: task.description || null,
          assigned_to: task.assigned_to || user.id,
          assigned_by: user.id,
          priority: task.priority || 'medium',
          due_date: task.due_date || null,
          status: task.status || 'not_started',
          project_id: task.project_id || null,
          section_id: task.section_id || null,
          deal_id: derived.deal_id || null,
          contact_id: derived.contact_id || null,
          crm_company_id: derived.crm_company_id || null,
          company_id: membership?.company_id || null,
          recurrence_rule: task.recurrence_rule ?? null,
          is_recurring: !!task.recurrence_rule,
          recurrence_end_date: task.recurrence_end_date ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: ['contact-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-tasks'] });
      if (user && data) {
        const taskUrl = `https://naitive.co/tasks?task=${(data as any).id}`;
        const { data: assigneeProfile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', (data as any).assigned_to)
          .single();
        const payload = {
          task_id: (data as any).id,
          title: (data as any).title,
          priority: (data as any).priority,
          status: (data as any).status,
          assigned_to: (data as any).assigned_to,
          assigned_to_email: assigneeProfile?.email || null,
          assigned_to_name: assigneeProfile?.display_name || null,
          due_date: (data as any).due_date,
          task_url: taskUrl,
        };
        fireZapierWebhook('task_created', payload);
        fireZapierWebhook('task_assigned', payload);

        // Send task assigned email notification (fire-and-forget)
        if (assigneeProfile?.email && (data as any).assigned_to !== user.id) {
          const { data: assignerProfile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', user.id)
            .single();
          // Look up deal name if deal_id exists
          let dealName: string | undefined;
          if ((data as any).deal_id) {
            const { data: deal } = await supabase
              .from('deals')
              .select('company')
              .eq('id', (data as any).deal_id)
              .single();
            dealName = deal?.company || undefined;
          }
          sendTaskAssignedEmail({
            taskId: (data as any).id,
            taskTitle: (data as any).title,
            assigneeEmail: assigneeProfile.email,
            assigneeName: assigneeProfile.display_name || undefined,
            assignedByName: assignerProfile?.display_name || undefined,
            dealName,
            dueDate: (data as any).due_date,
          });
        }

        // Asana sync (fire-and-forget)
        (async () => {
          try {
            const companyId = (data as any).company_id || null;
            console.log('[AsanaSync] Task created — companyId:', companyId);
            console.log('[AsanaSync] Assignee email:', assigneeProfile?.email || 'none');
            const ctx = await getAsanaSyncContext(companyId);
            console.log('[AsanaSync] Sync context:', ctx ? { integrationId: ctx.integrationId, projectGid: ctx.projectGid } : 'null (sync skipped)');
            if (ctx) {
              const gid = await syncTaskToAsana(ctx, {
                id: (data as any).id,
                title: (data as any).title,
                description: (data as any).description,
                due_date: (data as any).due_date,
                assignee_email: assigneeProfile?.email || null,
              });
              console.log('[AsanaSync] Task pushed to Asana, gid:', gid);
            }
          } catch (e) {
            console.error('[AsanaSync] Sync failed:', e);
          }
        })();
      }
    },
    onError: () => toast.error('Failed to create task'),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const updateData: Record<string, any> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.status !== undefined) {
        updateData.status = updates.status;
        if (updates.status === 'complete' || updates.status === 'completed') {
          updateData.completed_at = new Date().toISOString();
          const { data: { user: u } } = await supabase.auth.getUser();
          updateData.completed_by = u?.id;
        } else {
          updateData.completed_at = null;
          updateData.completed_by = null;
        }
      }
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.due_date !== undefined) updateData.due_date = updates.due_date;
      if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
      if (updates.assigned_to !== undefined) updateData.assigned_to = updates.assigned_to;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.position !== undefined) updateData.position = updates.position;
      if (updates.section_id !== undefined) updateData.section_id = updates.section_id;
      if (updates.project_id !== undefined) updateData.project_id = updates.project_id;
      if (updates.task_type !== undefined) updateData.task_type = updates.task_type;
      if (updates.is_starred !== undefined) updateData.is_starred = updates.is_starred;
      if (updates.recurrence_rule !== undefined) updateData.recurrence_rule = updates.recurrence_rule;
      if ((updates as any).recurrence_end_date !== undefined) updateData.recurrence_end_date = (updates as any).recurrence_end_date;
      if ((updates as any).is_recurring !== undefined) updateData.is_recurring = (updates as any).is_recurring;

      const { error } = await supabase.from('tasks').update(updateData).eq('id', id);
      if (error) throw error;

      // Audit: log recurrence pause/resume/stop changes
      try {
        const recurrenceTouched =
          updates.recurrence_rule !== undefined
          || (updates as any).recurrence_end_date !== undefined
          || (updates as any).is_recurring !== undefined;
        if (recurrenceTouched) {
          const prev = tasks.find(t => t.id === id) as any;
          const prevRule: string | null = prev?.recurrence_rule ?? null;
          const prevEnd: string | null = prev?.recurrence_end_date ?? null;
          const newRule: string | null = updates.recurrence_rule !== undefined ? (updates.recurrence_rule as any) : prevRule;
          const newEnd: string | null = (updates as any).recurrence_end_date !== undefined ? ((updates as any).recurrence_end_date as any) : prevEnd;
          const todayStr = new Date().toISOString().slice(0, 10);
          const wasPaused = !!prevEnd && prevEnd <= todayStr && !!prevRule;
          const isPaused = !!newEnd && newEnd <= todayStr && !!newRule;

          let event: 'recurrence_stopped' | 'recurrence_paused' | 'recurrence_resumed' | 'recurrence_updated' | null = null;
          if (prevRule && !newRule) event = 'recurrence_stopped';
          else if (!wasPaused && isPaused) event = 'recurrence_paused';
          else if (wasPaused && !isPaused) event = 'recurrence_resumed';
          else if (prevRule !== newRule || prevEnd !== newEnd) event = 'recurrence_updated';

          if (event) {
            const { data: { user: au } } = await supabase.auth.getUser();
            if (au) {
              await supabase.from('task_activity').insert({
                task_id: id,
                actor_id: au.id,
                event_type: event,
                payload: {
                  previous_rule: prevRule,
                  new_rule: newRule,
                  previous_end_date: prevEnd,
                  new_end_date: newEnd,
                },
              } as any);
            }
          }
        }
      } catch (e) {
        console.warn('[Recurrence audit] Failed to log activity', e);
      }

      // Handle recurring task: if completing a recurring task, create the next instance
      if (updates.status === 'complete' || updates.status === 'completed') {
        const completedTask = tasks.find(t => t.id === id);
        if (completedTask?.recurrence_rule) {
          const { data: { user: u } } = await supabase.auth.getUser();
          if (u) {
            const nextDueDate = calculateNextDueDate(completedTask.due_date, completedTask.recurrence_rule);
            const seriesEnd = (completedTask as any).recurrence_end_date as string | null | undefined;
            // Stop the series if the next occurrence falls past the end date
            // (or if no next date can be computed at all). We still continue
            // with the rest of the completion flow (Zapier/Asana sync etc.).
            const seriesShouldContinue = !!nextDueDate && (!seriesEnd || nextDueDate <= seriesEnd);
            if (seriesShouldContinue) {
             const { data: newRecurringTask } = await supabase.from('tasks').insert({
               title: completedTask.title,
               description: completedTask.description,
               assigned_to: completedTask.assigned_to,
               assigned_by: completedTask.assigned_by,
               priority: completedTask.priority,
               company_id: completedTask.company_id,
               project_id: completedTask.project_id,
               section_id: completedTask.section_id,
               recurrence_rule: completedTask.recurrence_rule,
               recurrence_source_id: completedTask.recurrence_source_id || id,
               due_date: nextDueDate,
               task_type: completedTask.task_type,
               recurrence_end_date: seriesEnd ?? null,
             } as any).select().single();

             // Fire-and-forget Asana sync for the new recurring task
             try {
               const ctx = await getAsanaSyncContext(completedTask.company_id || null);
               if (ctx && newRecurringTask) {
                 let assigneeEmail: string | null = null;
                 if (completedTask.assigned_to) {
                   const { data: assigneeProfile } = await supabase.from('profiles').select('email').eq('user_id', completedTask.assigned_to).maybeSingle();
                   assigneeEmail = assigneeProfile?.email || null;
                 }
                 await syncTaskToAsana(ctx, {
                   id: (newRecurringTask as any).id,
                   title: completedTask.title,
                   due_date: nextDueDate || null,
                   assignee_email: assigneeEmail,
                 });
               }
             } catch (e) {
               console.error('[AsanaSync] Recurring task sync failed:', e);
             }
            }
          }
        }
      }

      // Fire Zapier webhook when task is assigned/reassigned
      if (updates.assigned_to !== undefined && user) {
        const taskUrl = `https://naitive.co/tasks?task=${id}`;
        const { data: assigneeProfile } = await supabase
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', updates.assigned_to)
          .single();
        fireZapierWebhook('task_assigned', {
          task_id: id,
          assigned_to: updates.assigned_to,
          assigned_to_email: assigneeProfile?.email || null,
          assigned_to_name: assigneeProfile?.display_name || null,
          title: updates.title,
          task_url: taskUrl,
        });

        // Send task assigned email notification on reassignment (fire-and-forget)
        if (assigneeProfile?.email && updates.assigned_to !== user.id) {
          const existingTask = tasks.find(t => t.id === id);
          const { data: assignerProfile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', user.id)
            .single();
          let dealName: string | undefined;
          if (existingTask?.deal_id) {
            const { data: deal } = await supabase
              .from('deals')
              .select('company')
              .eq('id', existingTask.deal_id)
              .single();
            dealName = deal?.company || undefined;
          }
          sendTaskAssignedEmail({
            taskId: id,
            taskTitle: existingTask?.title || updates.title || 'Task',
            assigneeEmail: assigneeProfile.email,
            assigneeName: assigneeProfile.display_name || undefined,
            assignedByName: assignerProfile?.display_name || undefined,
            dealName,
            dueDate: existingTask?.due_date || updates.due_date || null,
          });
        }
      }

      // Asana sync: skip if this update was triggered by Asana webhook (loop prevention)
      const updatedTask = tasks.find(t => t.id === id);
      const asanaTaskGid = (updatedTask as any)?.asana_task_gid;
      const syncSource = (updatedTask as any)?.sync_source;

      if (asanaTaskGid && syncSource !== 'asana') {
        (async () => {
          try {
            const ctx = await getAsanaSyncContext((updatedTask as any)?.company_id || null);
            if (!ctx) return;

            const asanaUpdates: { title?: string; due_date?: string | null; assignee_email?: string | null; completed?: boolean } = {};

            // Name sync
            if (updates.title !== undefined) {
              asanaUpdates.title = updates.title;
            }

            // Due date sync
            if (updates.due_date !== undefined) {
              asanaUpdates.due_date = updates.due_date || null;
            }

            // Assignee sync
            if (updates.assigned_to !== undefined) {
              if (updates.assigned_to) {
                const { data: assigneeProfile } = await supabase
                  .from('profiles')
                  .select('email')
                  .eq('user_id', updates.assigned_to)
                  .single();
                asanaUpdates.assignee_email = assigneeProfile?.email || null;
              } else {
                asanaUpdates.assignee_email = null;
              }
            }

            // Completion sync
            if (updates.status !== undefined) {
              asanaUpdates.completed = updates.status === 'complete' || updates.status === 'completed';
            }

            if (Object.keys(asanaUpdates).length > 0) {
              await updateTaskInAsana(ctx, asanaTaskGid, asanaUpdates);
              console.log('Asana sync pushed:', Object.keys(asanaUpdates));
            }
          } catch (e) {
            console.error('Asana update sync failed:', e);
          }
        })();

        // Clear sync_source if it was set by a previous Asana sync
      } else if (syncSource === 'asana') {
        console.log('Skipping Asana sync — update originated from Asana');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: ['contact-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-activity'] });
    },
    onError: () => toast.error('Failed to update task'),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success('Task deleted');
    },
    onError: () => toast.error('Failed to delete task'),
  });

  return { tasks: enrichedTasks, isLoading, createTask, updateTask, deleteTask };
}

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['task-comments', taskId];

  const { data: comments = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as TaskComment[];
    },
  });

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !taskId) throw new Error('Missing context');
      const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        author_id: user.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { comments, isLoading, addComment };
}

export function useTaskActivity(taskId: string | null) {
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['task-activity', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_activity')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as TaskActivityEvent[];
    },
  });

  return { activity, isLoading };
}

export function useSubtasks(parentTaskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['subtasks', parentTaskId];

  const { data: subtasks = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!parentTaskId,
    queryFn: async () => {
      if (!parentTaskId) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('parent_task_id', parentTaskId)
        .is('archived_at', null)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const createSubtask = useMutation({
    mutationFn: async (title: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !parentTaskId) throw new Error('Missing context');
      const { data: parent } = await supabase.from('tasks').select('company_id, project_id').eq('id', parentTaskId).single();
      const { error } = await supabase.from('tasks').insert({
        title,
        parent_task_id: parentTaskId,
        assigned_to: user.id,
        assigned_by: user.id,
        company_id: parent?.company_id,
        project_id: parent?.project_id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const updateSubtask = useMutation({
    mutationFn: async ({ subtaskId, updates }: { subtaskId: string; updates: Record<string, any> }) => {
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', subtaskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const deleteSubtask = useMutation({
    mutationFn: async (subtaskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', subtaskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { subtasks, isLoading, createSubtask, updateSubtask, deleteSubtask };
}

export function useContactTasks(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-tasks', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*, deal:deals(id, company), contact:contacts(id, full_name), crm_company:crm_companies(id, name)')
        .eq('contact_id', contactId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Task[];
    },
    enabled: !!contactId,
  });
}

export function useCrmCompanyTasks(companyId: string | undefined) {
  return useQuery({
    queryKey: ['crm-company-tasks', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      // Get tasks directly on this company
      const { data: directTasks, error: directError } = await (supabase
        .from('tasks')
        .select('*, deal:deals(id, company), contact:contacts(id, full_name), crm_company:crm_companies(id, name)')
        .eq('crm_company_id', companyId) as any)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (directError) throw directError;

      // Get tasks on affiliated contacts
      const { data: contactIds } = await supabase
        .from('contacts')
        .select('id')
        .eq('crm_company_id', companyId);

      let contactTasks: Task[] = [];
      if (contactIds && contactIds.length > 0) {
        const ids = contactIds.map(c => c.id);
        const { data, error } = await supabase
          .from('tasks')
          .select('*, deal:deals(id, company), contact:contacts(id, full_name), crm_company:crm_companies(id, name)')
          .in('contact_id', ids)
          .is('archived_at', null)
          .order('created_at', { ascending: false });
        if (!error && data) contactTasks = data as Task[];
      }

      // Dedupe
      const byId = new Map<string, Task>();
      (directTasks || []).forEach(t => byId.set(t.id, t as Task));
      contactTasks.forEach(t => { if (!byId.has(t.id)) byId.set(t.id, t); });

      return Array.from(byId.values()).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!companyId,
  });
}
