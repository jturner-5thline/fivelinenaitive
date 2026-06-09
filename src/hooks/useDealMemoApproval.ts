import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';
const ADMIN_EMAIL = 'jturner@5thline.co';
// James Turner's auth.users.id (NOT his profiles.id). Tasks.assigned_to is
// filtered by auth user_id everywhere in the app (see useTasks.ts), so using
// the profile id here meant the task was created but never appeared in
// James's task list.
const JAMES_TURNER_USER_ID = 'a6b48ccd-0f2a-4018-886e-241287208ea0';
const NAITIVE_BASE_URL = 'https://fivelinenaitive.lovable.app';
const FIFTH_LINE_COMPANY_ID = '44556c46-9127-4b12-b14e-d6fee784afcf';

/** Calculate a date N business days from now (skips weekends) */
function addBusinessDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export type ApprovalState = 'not_submitted' | 'pending' | 'approved' | 'rejected';
export type ApprovalRole = 'analyst' | 'deal_manager' | 'admin' | null;

export interface ApprovalInfo {
  approvalState: ApprovalState;
  currentApprovalLevel: string | null;
  currentApproverUserId: string | null;
  lastSubmittedByUserId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

export interface DealMemoApprovalHook {
  approvalInfo: ApprovalInfo;
  userRole: ApprovalRole;
  isCurrentApprover: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  submitForApproval: () => Promise<void>;
  approveApproval: () => Promise<void>;
  rejectApproval: (reason: string) => Promise<void>;
  nextApproverLabel: string | null;
}

/** Determine the user's role for this deal based on deal fields */
async function resolveUserRole(
  userId: string,
  userEmail: string,
  dealId: string
): Promise<ApprovalRole> {
  // Admin check first
  if (userEmail.toLowerCase() === ADMIN_EMAIL) return 'admin';

  // Fetch deal to compare manager / analyst names
  const { data: deal } = await supabase
    .from('deals')
    .select('manager, analyst, user_id')
    .eq('id', dealId)
    .single();

  if (!deal) return null;

  // Fetch current user profile to get display_name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .single();

  const displayName = profile?.display_name?.toLowerCase().trim();

  if (deal.manager && displayName && deal.manager.toLowerCase().trim() === displayName) {
    return 'deal_manager';
  }

  // If user is analyst field, or deal owner and not manager → analyst role
  if (deal.analyst && displayName && deal.analyst.toLowerCase().trim() === displayName) {
    return 'analyst';
  }

  // If user is the deal owner, treat as analyst level
  if (deal.user_id === userId) {
    return 'analyst';
  }

  // Fallback: any authenticated user who can access the deal memo
  // is treated as analyst level so they can submit for approval
  return 'analyst';
}

/** Resolve a display name to a user_id via profiles */
async function resolveNameToUserId(displayName: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('user_id')
    .ilike('display_name', displayName.trim())
    .limit(1)
    .single();
  return data?.user_id || null;
}

/** Get admin user id */
async function getAdminUserId(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('email', ADMIN_EMAIL)
    .single();
  return data?.user_id || null;
}

export function useDealMemoApproval(
  dealId: string | undefined,
  memoId: string | undefined,
  options?: { saveMemo?: () => Promise<void> }
): DealMemoApprovalHook {
  const { user } = useAuth();
  const [approvalInfo, setApprovalInfo] = useState<ApprovalInfo>({
    approvalState: 'not_submitted',
    currentApprovalLevel: null,
    currentApproverUserId: null,
    lastSubmittedByUserId: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
  });
  const [userRole, setUserRole] = useState<ApprovalRole>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchState = useCallback(async () => {
    if (!dealId || !memoId || !user) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      // Fetch approval state from deal_memos
      const { data: memo } = await supabase
        .from('deal_memos')
        .select('approval_state, current_approval_level, current_approver_user_id, last_submitted_by_user_id, submitted_at, approved_at, rejected_at, rejection_reason')
        .eq('id', memoId)
        .single();

      if (memo) {
        setApprovalInfo({
          approvalState: (memo.approval_state as ApprovalState) || 'not_submitted',
          currentApprovalLevel: memo.current_approval_level,
          currentApproverUserId: memo.current_approver_user_id,
          lastSubmittedByUserId: memo.last_submitted_by_user_id,
          submittedAt: memo.submitted_at,
          approvedAt: memo.approved_at,
          rejectedAt: memo.rejected_at,
          rejectionReason: memo.rejection_reason,
        });
      }

      // Resolve role
      const role = await resolveUserRole(user.id, user.email || '', dealId);
      setUserRole(role);
    } catch (e) {
      console.error('Error fetching approval state:', e);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, memoId, user]);

  useEffect(() => { fetchState(); }, [fetchState]);

  const isCurrentApprover = !!(
    user && approvalInfo.approvalState === 'pending' && approvalInfo.currentApproverUserId === user.id
  );

  const getNextApprover = useCallback(async (role: ApprovalRole): Promise<{ userId: string; role: string; label: string } | null> => {
    if (!dealId) return null;

    if (role === 'analyst') {
      // Next = Deal Manager
      const { data: deal } = await supabase
        .from('deals')
        .select('manager')
        .eq('id', dealId)
        .single();
      if (deal?.manager) {
        const managerId = await resolveNameToUserId(deal.manager);
        if (managerId) return { userId: managerId, role: 'deal_manager', label: 'Deal Manager' };
      }
      // Fallback to admin if no manager
      const adminId = await getAdminUserId();
      if (adminId) return { userId: adminId, role: 'admin', label: 'Admin' };
      return null;
    }

    if (role === 'deal_manager') {
      const adminId = await getAdminUserId();
      if (adminId) return { userId: adminId, role: 'admin', label: 'Admin' };
      return null;
    }

    // Admin → final, no next
    return null;
  }, [dealId]);

  const nextApproverLabel = userRole === 'analyst' ? 'Deal Manager' : userRole === 'deal_manager' ? 'Admin' : null;

  const submitForApproval = useCallback(async () => {
    if (!dealId || !memoId || !user || !userRole) return;
    setIsSubmitting(true);
    try {
      // Auto-save memo before submitting
      if (options?.saveMemo) {
        await options.saveMemo();
      }

      // Admin can self-approve
      if (userRole === 'admin') {
        await supabase
          .from('deal_memos')
          .update({
            approval_state: 'approved',
            current_approval_level: 'admin_final',
            last_submitted_by_user_id: user.id,
            submitted_at: new Date().toISOString(),
            approved_at: new Date().toISOString(),
          } as any)
          .eq('id', memoId);
        toast.success('Deal Memo approved');
        await fetchState();
        return;
      }

      const nextApprover = await getNextApprover(userRole);
      if (!nextApprover) {
        toast.error('Could not determine next approver');
        return;
      }

      const level = userRole === 'analyst' ? 'analyst_submitted' : 'manager_submitted';

      // Update memo state
      await supabase
        .from('deal_memos')
        .update({
          approval_state: 'pending',
          current_approval_level: level,
          current_approver_user_id: nextApprover.userId,
          last_submitted_by_user_id: user.id,
          submitted_at: new Date().toISOString(),
          rejected_at: null,
          rejection_reason: null,
        } as any)
        .eq('id', memoId);

      // Get deal name
      const { data: deal } = await supabase
        .from('deals')
        .select('company, company_id')
        .eq('id', dealId)
        .single();

      const companyName = deal?.company || 'Unknown Deal';

      // Get company_id for task
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const today = new Date().toISOString().split('T')[0];

      // Create approval task
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: `Review ${companyName}`,
          assigned_to: nextApprover.userId,
          assigned_by: user.id,
          deal_id: dealId,
          company_id: membership?.company_id || deal?.company_id || null,
          due_date: today,
          status: 'not_started',
          priority: 'high',
          task_type: 'deal_memo_approval',
          description: `Please review and approve the Deal Memo for ${companyName}. Open the Deal Memo from the deal page to approve or reject.`,
        } as any)
        .select('id')
        .single();

      if (taskError) {
        console.error('Failed to create approval task:', taskError);
        toast.error('Deal memo submitted but review task could not be created. Please notify your admin.');
      }

      // 5th Line specific: Create a review task for James Turner when a memo is submitted
      // Only fires for deals in the 5th Line org and avoids duplicates
      const orgCompanyId = membership?.company_id || deal?.company_id || null;
      let jamesTaskCreated = false;
      if (orgCompanyId === FIFTH_LINE_COMPANY_ID) {
        const reviewTitle = `Review ${companyName} Memo`;
        const dealUrl = `${NAITIVE_BASE_URL}/deal/${dealId}`;

        // Duplicate check: skip if an open task with same title already exists for this deal
        const { data: existingTasks } = await supabase
          .from('tasks')
          .select('id')
          .eq('deal_id', dealId)
          .eq('assigned_to', JAMES_TURNER_USER_ID)
          .eq('title', reviewTitle)
          .in('status', ['not_started', 'in_progress'])
          .limit(1);

        if (!existingTasks || existingTasks.length === 0) {
          // Per spec: due date = same calendar day the task is created.
          const dueToday = today;
          const description = `Please review the deal memo for ${companyName} and provide your approval.\n\nView Deal: ${companyName} — ${dealUrl}`;

          const { data: jamesTaskRow, error: jamesTaskError } = await supabase
            .from('tasks')
            .insert({
              title: reviewTitle,
              assigned_to: JAMES_TURNER_USER_ID,
              assigned_by: user.id,
              deal_id: dealId,
              company_id: orgCompanyId,
              due_date: dueToday,
              status: 'not_started',
              priority: 'high',
              task_type: 'deal_memo_approval',
              description,
            } as any)
            .select('id')
            .single();

          if (jamesTaskError) {
            console.error('Failed to create James Turner review task:', jamesTaskError);
            toast.error('Deal memo submitted but review task for James could not be created. Please notify your admin.');
          } else {
            jamesTaskCreated = true;
            // Send in-app notification
            await supabase.from('flex_notifications').insert({
              user_id: JAMES_TURNER_USER_ID,
              deal_id: dealId,
              alert_type: 'deal_memo_review',
              title: `Memo ready for review: ${companyName}`,
              message: `A Deal Memo for ${companyName} has been submitted and is ready for your review.`,
              action_url: dealUrl,
            } as any);

            // Email notification to James — reuse the existing enriched
            // task_assigned template in send-notification-email. Fire-and-forget;
            // never block the submission UX on email errors.
            try {
              const { data: submitterProfile } = await supabase
                .from('profiles')
                .select('display_name, email')
                .eq('user_id', user.id)
                .maybeSingle();
              const submittedBy = submitterProfile?.display_name || submitterProfile?.email || user.email || 'A teammate';
              await supabase.functions.invoke('send-notification-email', {
                body: {
                  type: 'task_assigned',
                  user_id: JAMES_TURNER_USER_ID,
                  deal_id: dealId,
                  deal_name: companyName,
                  changed_by: submittedBy,
                  metadata: {
                    task_title: reviewTitle,
                    priority: 'high',
                    action_url: dealUrl,
                    deal_name: companyName,
                    description: `${submittedBy} submitted the Deal Memo for ${companyName} and it's ready for your review.`,
                  },
                },
              });
            } catch (emailErr) {
              console.error('[MemoApproval] Failed to email James Turner:', emailErr);
            }

            // Asana mirror — same sync path used by every other naitive task.
            // Best-effort: never block the in-app submission on Asana errors.
            try {
              const asanaCtx = await getAsanaSyncContext(orgCompanyId);
              if (asanaCtx && jamesTaskRow?.id) {
                await syncTaskToAsana(asanaCtx, {
                  id: jamesTaskRow.id,
                  title: reviewTitle,
                  description,
                  due_date: dueToday,
                  assignee_email: ADMIN_EMAIL,
                });
              }
            } catch (asanaErr) {
              console.error('[MemoApproval] Asana mirror failed:', asanaErr);
            }
          }
        }
      }

      // Create approval record
      await supabase
        .from('deal_memo_approvals')
        .insert({
          deal_id: dealId,
          deal_memo_id: memoId,
          submitted_by: user.id,
          approver_user_id: nextApprover.userId,
          approver_role: nextApprover.role,
          task_id: taskData?.id || null,
        } as any);

      if (orgCompanyId === FIFTH_LINE_COMPANY_ID && jamesTaskCreated) {
        toast.success('Memo submitted — James Turner has been assigned to review.');
      } else {
        toast.success(`Submitted to ${nextApprover.label} for review`);
      }
      await fetchState();
    } catch (e) {
      console.error('Error submitting for approval:', e);
      toast.error('Failed to submit for approval');
    } finally {
      setIsSubmitting(false);
    }
  }, [dealId, memoId, user, userRole, getNextApprover, fetchState]);

  const approveApproval = useCallback(async () => {
    if (!dealId || !memoId || !user) return;
    setIsSubmitting(true);
    try {
      // Mark current approval record as approved
      await supabase
        .from('deal_memo_approvals')
        .update({ status: 'approved', resolved_at: new Date().toISOString() } as any)
        .eq('deal_memo_id', memoId)
        .eq('approver_user_id', user.id)
        .eq('status', 'pending');

      // Complete the associated task
      const { data: approvalRec } = await supabase
        .from('deal_memo_approvals')
        .select('task_id')
        .eq('deal_memo_id', memoId)
        .eq('approver_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (approvalRec?.task_id) {
        await supabase
          .from('tasks')
          .update({ status: 'complete', completed_at: new Date().toISOString(), completed_by: user.id } as any)
          .eq('id', approvalRec.task_id);
      }

      // Determine if there's a next level
      const myRole = await resolveUserRole(user.id, user.email || '', dealId);
      const nextApprover = await getNextApprover(myRole);

      if (nextApprover) {
        // Advance to next level
        const level = myRole === 'deal_manager' ? 'manager_submitted' : 'analyst_submitted';
        await supabase
          .from('deal_memos')
          .update({
            approval_state: 'pending',
            current_approval_level: level === 'analyst_submitted' ? 'manager_submitted' : 'admin_final',
            current_approver_user_id: nextApprover.userId,
          } as any)
          .eq('id', memoId);

        // Get deal name
        const { data: deal } = await supabase
          .from('deals')
          .select('company, company_id')
          .eq('id', dealId)
          .single();

        const { data: membership } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .limit(1)
          .single();

        const today = new Date().toISOString().split('T')[0];

        // Create next approval task
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: `Review ${deal?.company || 'Deal'}`,
            assigned_to: nextApprover.userId,
            assigned_by: user.id,
            deal_id: dealId,
            company_id: membership?.company_id || deal?.company_id || null,
            due_date: today,
            status: 'not_started',
            priority: 'high',
            task_type: 'deal_memo_approval',
            description: `Please review and approve the Deal Memo for ${deal?.company || 'the deal'}. Open the Deal Memo from the deal page to approve or reject.`,
          } as any)
          .select('id')
          .single();

        if (taskError) {
          console.error('Failed to create escalation task:', taskError);
        }

        await supabase
          .from('deal_memo_approvals')
          .insert({
            deal_id: dealId,
            deal_memo_id: memoId,
            submitted_by: user.id,
            approver_user_id: nextApprover.userId,
            approver_role: nextApprover.role,
            task_id: taskData?.id || null,
          } as any);

        toast.success(`Approved. Escalated to ${nextApprover.label} for final review.`);
      } else {
        // Final approval
        await supabase
          .from('deal_memos')
          .update({
            approval_state: 'approved',
            current_approval_level: 'admin_final',
            current_approver_user_id: null,
            approved_at: new Date().toISOString(),
          } as any)
          .eq('id', memoId);
        toast.success('Deal Memo fully approved!');
      }

      await fetchState();
    } catch (e) {
      console.error('Error approving:', e);
      toast.error('Failed to approve');
    } finally {
      setIsSubmitting(false);
    }
  }, [dealId, memoId, user, getNextApprover, fetchState]);

  const rejectApproval = useCallback(async (reason: string) => {
    if (!dealId || !memoId || !user) return;
    setIsSubmitting(true);
    try {
      // Mark approval record as rejected
      await supabase
        .from('deal_memo_approvals')
        .update({ status: 'rejected', rejection_reason: reason, resolved_at: new Date().toISOString() } as any)
        .eq('deal_memo_id', memoId)
        .eq('approver_user_id', user.id)
        .eq('status', 'pending');

      // Complete associated task
      const { data: approvalRec } = await supabase
        .from('deal_memo_approvals')
        .select('task_id')
        .eq('deal_memo_id', memoId)
        .eq('approver_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (approvalRec?.task_id) {
        await supabase
          .from('tasks')
          .update({ status: 'complete', completed_at: new Date().toISOString(), completed_by: user.id } as any)
          .eq('id', approvalRec.task_id);
      }

      // Reset memo state
      await supabase
        .from('deal_memos')
        .update({
          approval_state: 'rejected',
          current_approver_user_id: null,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason,
        } as any)
        .eq('id', memoId);

      toast.success('Approval rejected');
      await fetchState();
    } catch (e) {
      console.error('Error rejecting:', e);
      toast.error('Failed to reject');
    } finally {
      setIsSubmitting(false);
    }
  }, [dealId, memoId, user, fetchState]);

  return {
    approvalInfo,
    userRole,
    isCurrentApprover,
    isLoading,
    isSubmitting,
    submitForApproval,
    approveApproval,
    rejectApproval,
    nextApproverLabel,
  };
}
