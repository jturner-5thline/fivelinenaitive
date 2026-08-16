import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Save, Loader2, Plus, X, FolderOpen, Check, Send, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import { useFinancialComments } from '@/hooks/useFinancialComments';
import { FinancialCommentsSection } from './saas-model/FinancialCommentsSection';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAutoSave, AutoSaveStatus } from '@/hooks/useAutoSave';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useDealMemo } from '@/hooks/useDealMemo';
import { useDealMemoNotification } from '@/hooks/useDealMemoNotification';
import { useDealMemoAuditLog } from '@/hooks/useDealMemoAuditLog';
import { useDealMemoApproval } from '@/hooks/useDealMemoApproval';
import { useDealMemoComments } from '@/hooks/useDealMemoComments';
import { MemoAuditLogPopover } from '@/components/deal/MemoAuditLogPopover';
import { MemoSectionContextMenu } from '@/components/deal/MemoSectionContextMenu';
import { MemoCommentThread } from '@/components/deal/MemoCommentThread';

interface DealMemoDialogProps {
  dealId: string;
  companyName: string;
  dealNarrative?: string;
  onGoToDataRoom?: () => void;
}

interface MemoSection {
  key: 'lender_notes' | 'analyst_notes' | 'other_notes';
  label: string;
  placeholder: string;
}

const MEMO_SECTIONS: MemoSection[] = [
  {
    key: 'lender_notes',
    label: 'Funding Source Notes',
    placeholder: 'Notes about specific lenders, their feedback, or strategy...',
  },
  {
    key: 'analyst_notes',
    label: 'Analyst Notes',
    placeholder: 'Background checks, litigation, fraud analysis, and other due diligence...',
  },
  {
    key: 'other_notes',
    label: 'Other Notes',
    placeholder: 'Any additional notes or observations...',
  },
];

export function DealMemoDialog({ dealId, companyName, dealNarrative, onGoToDataRoom }: DealMemoDialogProps) {
  const { user } = useAuth();
  const { memo, isLoading, isSaving, saveMemo } = useDealMemo(dealId);
  const { hasUnreadUpdates, markAsViewed } = useDealMemoNotification(dealId);
  const { entries: auditEntries, isLoading: auditLoading, logChanges } = useDealMemoAuditLog(dealId);
  const {
    approvalInfo,
    userRole,
    isCurrentApprover,
    isSubmitting: isApprovalSubmitting,
    submitForApproval,
    approveApproval,
    rejectApproval,
    nextApproverLabel,
    isApprovalEnabled,
  } = useDealMemoApproval(dealId, memo?.id, {
    saveMemo: async () => {
      // CRITICAL: never blank an existing memo on submit. Only persist when
      // the user actually has unsaved edits AND we have a populated localValues
      // snapshot. Otherwise this closure would write all-empty fields and
      // (via upsert onConflict=deal_id) wipe the entire memo.
      if (!hasChanges) return;
      const newValues = {
        narrative: localValues.narrative || null,
        highlights: localValues.highlights || null,
        hurdles: localValues.hurdles || null,
        lender_notes: localValues.lender_notes || null,
        analyst_notes: localValues.analyst_notes || null,
        other_notes: localValues.other_notes || null,
      };
      // Extra safety: if the memo already has content but localValues looks
      // empty across the board, refuse to save — almost certainly a stale
      // closure from before the memo finished loading.
      const localHasAnyContent = Object.values(newValues).some(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
      const memoHasAnyContent = !!memo && (
        (memo.narrative && memo.narrative.trim()) ||
        (memo.highlights && memo.highlights.trim()) ||
        (memo.hurdles && memo.hurdles.trim()) ||
        (memo.lender_notes && memo.lender_notes.trim()) ||
        (memo.analyst_notes && memo.analyst_notes.trim()) ||
        (memo.other_notes && memo.other_notes.trim())
      );
      if (!localHasAnyContent && memoHasAnyContent) {
        console.warn('[DealMemo] Skipped pre-submit save: localValues empty while memo has content (would have blanked memo).');
        return;
      }
      const oldValues: Record<string, string | null> = {
        narrative: memo?.narrative || null,
        highlights: memo?.highlights || null,
        hurdles: memo?.hurdles || null,
        lender_notes: memo?.lender_notes || null,
        analyst_notes: memo?.analyst_notes || null,
        other_notes: memo?.other_notes || null,
      };
      await saveMemo(newValues);
      await logChanges(dealId, oldValues, newValues);
      setHasChanges(false);
    },
  });
  const {
    comments: allComments,
    addComment,
    resolveComment,
    unresolveComment,
    deleteComment,
    getCommentsForSection,
    getCommentCountForSection,
  } = useDealMemoComments(dealId);
  const { comments: financialComments, deleteComment: deleteFinancialComment } = useFinancialComments(dealId);
  const [isOpen, setIsOpen] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [localValues, setLocalValues] = useState<Record<string, string>>({
    narrative: '',
    highlights: '',
    hurdles: '',
    lender_notes: '',
    analyst_notes: '',
    other_notes: '',
  });
  const [highlightsList, setHighlightsList] = useState<string[]>([]);
  const [newHighlight, setNewHighlight] = useState('');
  const [hurdlesList, setHurdlesList] = useState<{ hurdle: string; remedy: string; resolved: boolean; resolvedBy: string }[]>([]);
  const [newHurdle, setNewHurdle] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<number | null>(null);
  const [editingHurdle, setEditingHurdle] = useState<number | null>(null);
  const [editingRemedy, setEditingRemedy] = useState<number | null>(null);
  const lastSavedMemoRef = useRef<string>('');

  // --- Autosave integration ---
  // Build the data object to auto-save (memoized to avoid unnecessary triggers)
  const autoSaveData = useMemo(() => ({
    narrative: localValues.narrative || null,
    highlights: localValues.highlights || null,
    hurdles: localValues.hurdles || null,
    lender_notes: localValues.lender_notes || null,
    analyst_notes: localValues.analyst_notes || null,
    other_notes: localValues.other_notes || null,
  }), [localValues]);

  const handleAutoSave = useCallback(async (data: typeof autoSaveData): Promise<boolean> => {
    const oldValues: Record<string, string | null> = {
      narrative: memo?.narrative || null,
      highlights: memo?.highlights || null,
      hurdles: memo?.hurdles || null,
      lender_notes: memo?.lender_notes || null,
      analyst_notes: memo?.analyst_notes || null,
      other_notes: memo?.other_notes || null,
    };
    const success = await saveMemo(data, { silent: true });
    if (success) {
      await logChanges(dealId, oldValues, data);
      setHasChanges(false);
    }
    return success;
  }, [saveMemo, memo, logChanges, dealId]);

  // Debounce delay: adjust this value (ms) to change how long after typing before auto-save fires
  const AUTOSAVE_DEBOUNCE_MS = 1500;

  const { status: autoSaveStatus, saveNow } = useAutoSave({
    data: autoSaveData,
    onSave: handleAutoSave,
    delay: AUTOSAVE_DEBOUNCE_MS,
    enabled: isOpen && hasChanges,
  });

  // Helper to convert list string to array
  const parseList = (str: string | null): string[] => {
    if (!str) return [];
    return str.split('\n').filter(h => h.trim() !== '');
  };

  // Parse hurdles with remedies (stored as "hurdle||remedy")
  const parseHurdles = (str: string | null): { hurdle: string; remedy: string; resolved: boolean; resolvedBy: string }[] => {
    if (!str) return [];
    return str.split('\n').filter(h => h.trim() !== '').map(line => {
      const parts = line.split('||');
      return { hurdle: parts[0] || '', remedy: parts[1] || '', resolved: parts[2] === 'true', resolvedBy: parts[3] || '' };
    });
  };

  const stringifyHurdles = (items: { hurdle: string; remedy: string; resolved: boolean; resolvedBy: string }[]): string => {
    return items.map(h => {
      const parts = [h.hurdle, h.remedy, h.resolved ? 'true' : 'false', h.resolvedBy];
      return parts.join('||');
    }).join('\n');
  };

  // Helper to convert list array to string
  const stringifyList = (items: string[]): string => {
    return items.join('\n');
  };

  // Sync local values with memo data when dialog opens or memo changes
  useEffect(() => {
    // CRITICAL: never blank localValues while the memo is still loading
    // from the DB. Doing so would (a) flash empty inputs and (b) let an
    // autosave/blur write those blanks over an existing persisted memo
    // after the user navigates away and returns. Only initialise once the
    // fetch has settled.
    if (isLoading) return;
    if (memo && !hasChanges) {
      setLocalValues({
        narrative: memo.narrative || dealNarrative || '',
        highlights: memo.highlights || '',
        hurdles: memo.hurdles || '',
        lender_notes: memo.lender_notes || '',
        analyst_notes: memo.analyst_notes || '',
        other_notes: memo.other_notes || '',
      });
      setHighlightsList(parseList(memo.highlights));
      setHurdlesList(parseHurdles(memo.hurdles));
    } else if (!memo) {
      setLocalValues({
        narrative: dealNarrative || '',
        highlights: '',
        hurdles: '',
        lender_notes: '',
        analyst_notes: '',
        other_notes: '',
      });
      setHighlightsList([]);
      setHurdlesList([]);
    }
    setNewHighlight('');
    setNewHurdle('');
    setHasChanges(false);
  }, [memo, isOpen, dealNarrative, isLoading]);

  const handleChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  // Save immediately on blur for any textarea field
  const handleFieldBlur = useCallback(() => {
    if (hasChanges) {
      saveNow();
    }
  }, [hasChanges, saveNow]);

  const handleAddHighlight = () => {
    if (newHighlight.trim()) {
      const updated = [...highlightsList, newHighlight.trim()];
      setHighlightsList(updated);
      setLocalValues(prev => ({ ...prev, highlights: stringifyList(updated) }));
      setNewHighlight('');
      setHasChanges(true);
    }
  };

  const handleRemoveHighlight = (index: number) => {
    const updated = highlightsList.filter((_, i) => i !== index);
    setHighlightsList(updated);
    setLocalValues(prev => ({ ...prev, highlights: stringifyList(updated) }));
    setEditingHighlight(null);
    setHasChanges(true);
  };

  const handleEditHighlight = (index: number, value: string) => {
    const updated = [...highlightsList];
    updated[index] = value;
    setHighlightsList(updated);
    setLocalValues(prev => ({ ...prev, highlights: stringifyList(updated) }));
    setHasChanges(true);
  };

  const handleAddHurdle = () => {
    if (newHurdle.trim()) {
      const updated = [...hurdlesList, { hurdle: newHurdle.trim(), remedy: '', resolved: false, resolvedBy: '' }];
      setHurdlesList(updated);
      setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
      setNewHurdle('');
      setHasChanges(true);
    }
  };

  const handleRemoveHurdle = (index: number) => {
    const updated = hurdlesList.filter((_, i) => i !== index);
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setEditingHurdle(null);
    setEditingRemedy(null);
    setHasChanges(true);
  };

  const handleEditHurdle = (index: number, value: string) => {
    const updated = [...hurdlesList];
    updated[index] = { ...updated[index], hurdle: value };
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setHasChanges(true);
  };

  const handleEditRemedy = (index: number, value: string) => {
    const updated = [...hurdlesList];
    updated[index] = { ...updated[index], remedy: value };
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setHasChanges(true);
  };

  const handleToggleHurdleResolved = (index: number) => {
    const updated = [...hurdlesList];
    const isNowResolved = !updated[index].resolved;
    const resolverName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email || 'Unknown';
    updated[index] = { 
      ...updated[index], 
      resolved: isNowResolved, 
      resolvedBy: isNowResolved ? resolverName : '' 
    };
    setHurdlesList(updated);
    setLocalValues(prev => ({ ...prev, hurdles: stringifyHurdles(updated) }));
    setHasChanges(true);
  };

  const handleHighlightKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHighlight();
    }
  };

  const handleHurdleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHurdle();
    }
  };

  // Comment helpers
  const makeCommentHandlers = (section: string, itemIndex?: number | null) => ({
    comments: getCommentsForSection(section, itemIndex),
    commentCount: getCommentCountForSection(section, itemIndex),
    onAddComment: (content: string, mentionedUserIds?: string[]) =>
      addComment(section, content, itemIndex, mentionedUserIds, null, memo?.id),
    onReply: (parentId: string, content: string, mentionedUserIds?: string[]) =>
      addComment(section, content, itemIndex, mentionedUserIds, parentId, memo?.id),
    onResolve: resolveComment,
    onUnresolve: unresolveComment,
    onDelete: deleteComment,
  });

  const handleSave = async () => {
    saveNow();
  };

  const handleRevert = (entry: import('@/hooks/useDealMemoAuditLog').MemoAuditEntry) => {
    if (entry.old_value !== null) {
      const field = entry.field_changed;
      setLocalValues(prev => ({ ...prev, [field]: entry.old_value || '' }));
      // Update lists if highlights or hurdles
      if (field === 'highlights') {
        setHighlightsList(parseList(entry.old_value));
      } else if (field === 'hurdles') {
        setHurdlesList(parseHurdles(entry.old_value));
      }
      setHasChanges(true);
    }
  };

  const handleOpenChange = (open: boolean) => {
    // If closing and there are pending changes, save immediately
    if (!open && hasChanges) {
      saveNow();
    }
    setIsOpen(open);
    if (open && hasUnreadUpdates) {
      markAsViewed();
    }
  };

  // Auto-save status label
  const autoSaveLabel = autoSaveStatus === 'pending' ? 'Unsaved changes...' 
    : autoSaveStatus === 'saving' ? 'Saving...' 
    : autoSaveStatus === 'saved' ? 'All changes saved'
    : autoSaveStatus === 'error' ? 'Save failed — click to retry'
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
              className={`deal-memo-button h-8 gap-2 relative border-primary text-primary bg-gradient-to-r from-primary/10 to-transparent hover:bg-primary/10 ${hasUnreadUpdates ? '' : ''}`}
              >
                <FileText className="h-4 w-4" />
                <span className="text-sm">Deal Memo</span>
                {hasUnreadUpdates && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive border-2 border-background" />
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>{hasUnreadUpdates ? 'Deal Memo (new updates)' : 'View Deal Memo'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <DialogContent className="sm:max-w-[1240px] w-[96vw] p-0 overflow-hidden flex flex-col h-[88vh] rounded-[22px] border-white/[0.08] bg-[#06060a]/95 backdrop-blur-xl text-[#ecedf4]">
        <DialogHeader className="px-6 py-2 border-b border-white/[0.08] flex-shrink-0 pr-14 space-y-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9DA2F5]/80">Deal Memo</div>
              <DialogTitle className="text-[20px] leading-tight tracking-tight truncate">{companyName}</DialogTitle>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {autoSaveLabel && (
                <span
                  className={`text-[11px] mr-1 inline-flex items-center gap-1.5 ${
                    autoSaveStatus === 'error' ? 'text-destructive cursor-pointer'
                    : autoSaveStatus === 'saved' ? 'text-[#5EEAD4]/80'
                    : 'text-[#ecedf4]/50'
                  }`}
                  onClick={autoSaveStatus === 'error' ? saveNow : undefined}
                >
                  {autoSaveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {autoSaveStatus === 'saved' && <Check className="h-3 w-3" />}
                  {autoSaveLabel}
                </span>
              )}
              {/* Approval Status Badge */}
              {approvalInfo.approvalState === 'approved' && !hasChanges && (
                <Badge className="gap-1.5 bg-success/15 text-success border-success/30 hover:bg-success/15">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Approved
                </Badge>
              )}
              {approvalInfo.approvalState === 'pending' && !isCurrentApprover && (
                <Badge variant="outline" className="gap-1.5 border-amber-500/30 text-amber-600">
                  <Clock className="h-3.5 w-3.5" />
                  Approval Pending
                </Badge>
              )}
              {approvalInfo.approvalState === 'rejected' && approvalInfo.rejectionReason && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="gap-1.5 border-destructive/30 text-destructive cursor-help">
                        <XCircle className="h-3.5 w-3.5" />
                        Rejected
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{approvalInfo.rejectionReason}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Approve/Reject controls for current approver */}
              {isCurrentApprover && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-success/40 text-success hover:bg-success/10"
                    onClick={approveApproval}
                    disabled={isApprovalSubmitting}
                  >
                    {isApprovalSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => setShowRejectInput(true)}
                    disabled={isApprovalSubmitting}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}

              {onGoToDataRoom && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08]"
                  onClick={() => {
                    setIsOpen(false);
                    onGoToDataRoom();
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="h-8 gap-1.5 text-[#ecedf4]/85 hover:bg-white/[0.06]"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
              {isApprovalEnabled && memo && (
                localValues.narrative.trim() || localValues.highlights.trim() || localValues.hurdles.trim() || localValues.lender_notes.trim() || localValues.analyst_notes.trim() || localValues.other_notes.trim()
              ) && !isCurrentApprover && (
                (userRole !== 'admin') || (approvalInfo.approvalState !== 'approved' || hasChanges)
              ) && (
                <Button
                  size="sm"
                  onClick={submitForApproval}
                  disabled={isApprovalSubmitting}
                  className="h-8 gap-1.5 bg-[#5EEAD4]/15 border border-[#5EEAD4]/40 text-[#5EEAD4] hover:bg-[#5EEAD4]/25"
                >
                  {isApprovalSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (userRole === 'admin' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />)}
                  {userRole === 'admin' ? 'Approve' : (approvalInfo.approvalState === 'not_submitted' ? 'Submit for approval' : 'Resubmit')}
                </Button>
              )}
              <MemoAuditLogPopover entries={auditEntries} isLoading={auditLoading} onRevert={handleRevert} />
            </div>
          </div>
          {/* Reject reason input */}
          {showRejectInput && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && rejectReason.trim()) {
                    rejectApproval(rejectReason.trim());
                    setShowRejectInput(false);
                    setRejectReason('');
                  }
                }}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={!rejectReason.trim() || isApprovalSubmitting}
                onClick={() => {
                  rejectApproval(rejectReason.trim());
                  setShowRejectInput(false);
                  setRejectReason('');
                }}
              >
                Confirm Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
              >
                Cancel
              </Button>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#ecedf4]/50" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[45fr_55fr] gap-4 p-4 overflow-y-auto">
            {/* LEFT RAIL — three text fields */}
            <div className="flex flex-col gap-3 min-h-0">
              {([
                { key: 'narrative', label: 'Narrative', placeholder: 'Describe the company, what they are looking for, and the proposed solution…', grow: 1.875, minHeight: 360 },
                { key: 'lender_notes', label: 'Lender Notes', placeholder: 'Notes about specific lenders, their feedback, or strategy…', grow: 1, minHeight: 200 },
                { key: 'other_notes', label: 'Notes & Recommendations', placeholder: 'Recommendations, observations, and additional notes…', grow: 1, minHeight: 200 },
              ] as const).map((s) => (
                <MemoSectionContextMenu
                  key={s.key}
                  section={s.key}
                  sectionLabel={s.label}
                  className="min-h-0 flex flex-col"
                  style={{ flexGrow: s.grow, flexShrink: 1, flexBasis: 0, minHeight: s.minHeight }}
                  {...makeCommentHandlers(s.key)}
                >
                  <div
                    className="min-h-0 flex-1 flex flex-col rounded-[14px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.015] backdrop-blur-md p-3"
                  >
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[#ecedf4]/65">{s.label}</span>
                    </div>
                    <Textarea
                      value={localValues[s.key]}
                      onChange={(e) => handleChange(s.key, e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder={s.placeholder}
                      className="flex-1 min-h-0 h-full resize-none bg-transparent border-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#9DA2F5]/40 text-[13px] text-[#ecedf4] placeholder:text-[#ecedf4]/35"
                    />
                  </div>
                </MemoSectionContextMenu>
              ))}
            </div>

            {/* RIGHT COLUMN — Highlights + Hurdles */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* Highlights */}
              <MemoSectionContextMenu section="highlights" sectionLabel="Highlights" {...makeCommentHandlers('highlights')}>
                <div className="flex flex-col rounded-[14px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.015] backdrop-blur-md p-3 min-h-0" style={{ flex: '1 1 0' }}>
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[#ecedf4]/65">Deal Highlights</span>
                      <span className="inline-flex items-center h-4 px-1.5 rounded-[4px] text-[9px] uppercase border border-[#9DA2F5]/30 text-[#9DA2F5]/85 bg-[#9DA2F5]/10">Why we can win it</span>
                    </div>
                    <MemoCommentThread section="highlights" sectionLabel="Highlights" {...makeCommentHandlers('highlights')} />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <ol className="space-y-1.5">
                      {Array.from({ length: Math.max(highlightsList.length, 3) }).map((_, index) => {
                        const value = highlightsList[index] ?? '';
                        const exists = index < highlightsList.length;
                        return (
                          <li key={index} className="group flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[#ecedf4]/45 w-5 text-right shrink-0">{String(index + 1).padStart(2, '0')}</span>
                            <Input
                              value={value}
                              placeholder="Add a highlight…"
                              onChange={(e) => {
                                const v = e.target.value;
                                if (exists) {
                                  handleEditHighlight(index, v);
                                } else {
                                  const updated = [...highlightsList, v];
                                  setHighlightsList(updated);
                                  setLocalValues((prev) => ({ ...prev, highlights: updated.join('\n') }));
                                  setHasChanges(true);
                                }
                              }}
                              onBlur={handleFieldBlur}
                              className="h-8 text-[12.5px] bg-white/[0.03] border-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#9DA2F5]/40 text-[#ecedf4] placeholder:text-[#ecedf4]/30"
                            />
                            {exists && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#ecedf4]/50 hover:text-destructive"
                                onClick={() => handleRemoveHighlight(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 gap-1.5 text-[11px] text-[#9DA2F5]/85 hover:bg-white/[0.04]"
                      onClick={() => {
                        const updated = [...highlightsList, ''];
                        setHighlightsList(updated);
                        setLocalValues((prev) => ({ ...prev, highlights: updated.join('\n') }));
                        setHasChanges(true);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Add highlight
                    </Button>
                  </div>
                </div>
              </MemoSectionContextMenu>

              {/* Hurdles & Remedies */}
              <MemoSectionContextMenu section="hurdles" sectionLabel="Hurdles" {...makeCommentHandlers('hurdles')}>
                <div className="flex flex-col rounded-[14px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.015] backdrop-blur-md p-3 min-h-0" style={{ flex: '1.25 1 0' }}>
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-[#ecedf4]/65">Hurdles &amp; Remedies</span>
                      <span className="inline-flex items-center h-4 px-1.5 rounded-[4px] text-[9px] uppercase border border-[#5EEAD4]/30 text-[#5EEAD4]/85 bg-[#5EEAD4]/10">Risk → mitigation</span>
                    </div>
                    <MemoCommentThread section="hurdles" sectionLabel="Hurdles" {...makeCommentHandlers('hurdles')} />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                    <ol className="space-y-3">
                      {Array.from({ length: Math.max(hurdlesList.length, 3) }).map((_, index) => {
                        const item = hurdlesList[index] ?? { hurdle: '', remedy: '', resolved: false, resolvedBy: '' };
                        const exists = index < hurdlesList.length;
                        const ensureExists = () => {
                          if (!exists) {
                            const updated = [...hurdlesList, { hurdle: '', remedy: '', resolved: false, resolvedBy: '' }];
                            setHurdlesList(updated);
                            setLocalValues((prev) => ({ ...prev, hurdles: stringifyHurdles(updated) }));
                            setHasChanges(true);
                            return updated.length - 1;
                          }
                          return index;
                        };
                        return (
                          <li key={index} className="group rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-2">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] uppercase tracking-wide bg-destructive/15 text-destructive/90 border border-destructive/30">Hurdle</span>
                              <Input
                                value={item.hurdle}
                                placeholder="What stands in the way…"
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (exists) handleEditHurdle(index, v);
                                  else {
                                    const newIdx = ensureExists();
                                    handleEditHurdle(newIdx, v);
                                  }
                                }}
                                onBlur={handleFieldBlur}
                                className="h-7 text-[12.5px] bg-transparent border-white/[0.06] focus-visible:ring-1 focus-visible:ring-destructive/30 text-[#ecedf4] placeholder:text-[#ecedf4]/30"
                              />
                              {exists && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-[#ecedf4]/50 hover:text-destructive"
                                  onClick={() => handleRemoveHurdle(index)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <div className="my-2 border-t border-dashed border-white/[0.08]" />
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] uppercase tracking-wide bg-[#5EEAD4]/15 text-[#5EEAD4] border border-[#5EEAD4]/30">Remedy</span>
                              <Input
                                value={item.remedy}
                                placeholder="How we mitigate it…"
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (exists) handleEditRemedy(index, v);
                                  else {
                                    const newIdx = ensureExists();
                                    handleEditRemedy(newIdx, v);
                                  }
                                }}
                                onBlur={handleFieldBlur}
                                className="h-7 text-[12.5px] bg-transparent border-white/[0.06] focus-visible:ring-1 focus-visible:ring-[#5EEAD4]/30 text-[#ecedf4] placeholder:text-[#ecedf4]/30"
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 gap-1.5 text-[11px] text-[#5EEAD4]/85 hover:bg-white/[0.04]"
                      onClick={() => {
                        const updated = [...hurdlesList, { hurdle: '', remedy: '', resolved: false, resolvedBy: '' }];
                        setHurdlesList(updated);
                        setLocalValues((prev) => ({ ...prev, hurdles: stringifyHurdles(updated) }));
                        setHasChanges(true);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Add hurdle / remedy
                    </Button>
                  </div>
                </div>
              </MemoSectionContextMenu>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
