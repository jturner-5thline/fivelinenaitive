import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
const ADMIN_EMAIL = 'jturner@5thline.co';
const JAMES_TURNER_USER_ID = 'e3e13611-b7b7-4d2d-b52b-141434219e09';
const NAITIVE_BASE_URL = 'https://fivelinenaitive.lovable.app';

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

      toast.success(`Submitted to ${nextApprover.label} for review`);
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
