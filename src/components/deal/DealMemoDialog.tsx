import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Save, Loader2, Plus, X, FolderOpen, Check, Send, CheckCircle2, XCircle, Clock, ShieldCheck, MessageSquare } from 'lucide-react';
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
    } else {
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
  }, [memo, isOpen, dealNarrative]);

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
                className={`h-8 gap-2 relative border-primary text-primary bg-gradient-to-r from-primary/10 to-transparent hover:bg-primary/10 ${hasUnreadUpdates ? '' : ''}`}
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
      
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0 pr-14">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">Deal Memo</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {companyName}
              </p>
            </div>
            <div className="flex items-center gap-2">
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

              {/* Submit for Approval button - only show when memo has content */}
              {userRole && !isCurrentApprover && userRole !== 'admin' && memo && (
                localValues.narrative.trim() || localValues.highlights.trim() || localValues.hurdles.trim() || localValues.lender_notes.trim() || localValues.analyst_notes.trim() || localValues.other_notes.trim()
              ) && (
                <Button
                  size="sm"
                  onClick={submitForApproval}
                  disabled={isApprovalSubmitting}
                >
                  {isApprovalSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  {approvalInfo.approvalState === 'not_submitted' ? 'Submit for Approval' : hasChanges ? 'Resubmit' : 'Resubmit for Approval'}
                </Button>
              )}

              {/* Admin self-approve button - only show when memo has content and is not already approved without changes */}
              {userRole === 'admin' && !isCurrentApprover && memo && (
                approvalInfo.approvalState !== 'approved' || hasChanges
              ) && (
                localValues.narrative.trim() || localValues.highlights.trim() || localValues.hurdles.trim() || localValues.lender_notes.trim() || localValues.analyst_notes.trim() || localValues.other_notes.trim()
              ) && (
                <Button
                  size="sm"
                  onClick={submitForApproval}
                  disabled={isApprovalSubmitting}
                >
                  {isApprovalSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                  Approve
                </Button>
              )}

              {onGoToDataRoom && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setIsOpen(false);
                    onGoToDataRoom();
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              )}
              <MemoAuditLogPopover entries={auditEntries} isLoading={auditLoading} onRevert={handleRevert} />
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || isSaving}
                size="icon"
                className="h-8 w-8"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
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

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="py-4 px-6 space-y-6">
              {/* Narrative Section */}
              <MemoSectionContextMenu section="narrative" sectionLabel="Narrative" {...makeCommentHandlers('narrative')}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">Narrative</label>
                    <MemoCommentThread section="narrative" sectionLabel="Narrative" {...makeCommentHandlers('narrative')} />
                  </div>
                  <Textarea
                    value={localValues.narrative}
                    onChange={(e) => handleChange('narrative', e.target.value)}
                    onBlur={handleFieldBlur}
                    placeholder="Describe the company, what they are looking for, and the proposed solution..."
                    className="min-h-[100px] resize-none"
                  />
                  <Separator className="mt-6" />
                </div>
              </MemoSectionContextMenu>

              {/* Deal Highlights Section - List based */}
              <MemoSectionContextMenu section="highlights" sectionLabel="Highlights" {...makeCommentHandlers('highlights')}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">
                      Deal Highlights: Why We Can Get Them an Offer
                    </label>
                    <MemoCommentThread section="highlights" sectionLabel="Highlights" {...makeCommentHandlers('highlights')} />
                  </div>
                  <div className="flex gap-2 mb-3">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="icon"
                      onClick={handleAddHighlight}
                      disabled={!newHighlight.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Input
                      value={newHighlight}
                      onChange={(e) => setNewHighlight(e.target.value)}
                      onKeyDown={handleHighlightKeyDown}
                      placeholder="Add a highlight..."
                      className="flex-1"
                    />
                  </div>
                  {highlightsList.length > 0 ? (
                    <ol className="space-y-2">
                      {highlightsList.map((highlight, index) => (
                        <MemoSectionContextMenu key={index} section="highlights" sectionLabel="Highlight" itemIndex={index} {...makeCommentHandlers('highlights', index)}>
                          <li className="flex items-start gap-2 p-2 bg-muted/50 rounded-md group">
                            <span className="text-sm font-medium text-muted-foreground min-w-[20px] mt-0.5">
                              {index + 1}.
                            </span>
                            {editingHighlight === index ? (
                              <Input
                                autoFocus
                                value={highlight}
                                onChange={(e) => handleEditHighlight(index, e.target.value)}
                                onBlur={() => setEditingHighlight(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingHighlight(null);
                                  if (e.key === 'Escape') setEditingHighlight(null);
                                }}
                                className="flex-1 h-7 text-sm"
                              />
                            ) : (
                              <span
                                className="flex-1 text-sm cursor-pointer hover:text-primary transition-colors"
                                onClick={() => setEditingHighlight(index)}
                              >
                                {highlight}
                              </span>
                            )}
                            <MemoCommentThread section="highlights" sectionLabel="Highlight" itemIndex={index} {...makeCommentHandlers('highlights', index)} />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveHighlight(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </li>
                        </MemoSectionContextMenu>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No highlights added yet
                    </p>
                  )}
                  <Separator className="mt-6" />
                </div>
              </MemoSectionContextMenu>

              {/* Deal Hurdles Section - List based */}
              <MemoSectionContextMenu section="hurdles" sectionLabel="Hurdles" {...makeCommentHandlers('hurdles')}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-foreground">
                      Deal Hurdles & Remedies
                    </label>
                    <MemoCommentThread section="hurdles" sectionLabel="Hurdles" {...makeCommentHandlers('hurdles')} />
                  </div>
                  <div className="flex gap-2 mb-3">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="icon"
                      onClick={handleAddHurdle}
                      disabled={!newHurdle.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Input
                      value={newHurdle}
                      onChange={(e) => setNewHurdle(e.target.value)}
                      onKeyDown={handleHurdleKeyDown}
                      placeholder="Add a hurdle..."
                      className="flex-1"
                    />
                  </div>
                  {hurdlesList.length > 0 ? (
                    <TooltipProvider>
                    <ol className="space-y-2">
                      {hurdlesList.map((item, index) => (
                        <MemoSectionContextMenu key={index} section="hurdles" sectionLabel="Hurdle" itemIndex={index} {...makeCommentHandlers('hurdles', index)}>
                          <li 
                            className={`p-2 rounded-md group ${item.resolved ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}
                          >
                            <div className="flex items-start gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleHurdleResolved(index)}
                                    className={`mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors ${
                                      item.resolved 
                                        ? 'bg-primary border-primary text-primary-foreground' 
                                        : 'border-muted-foreground/30 hover:border-primary'
                                    }`}
                                  >
                                    {item.resolved && <Check className="h-3 w-3" />}
                                  </button>
                                </TooltipTrigger>
                                {item.resolved && item.resolvedBy && (
                                  <TooltipContent side="top">
                                    <p>Resolved by {item.resolvedBy}</p>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                              <div className="flex-1 min-w-0">
                                {editingHurdle === index ? (
                                  <Input
                                    autoFocus
                                    value={item.hurdle}
                                    onChange={(e) => handleEditHurdle(index, e.target.value)}
                                    onBlur={() => setEditingHurdle(null)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') setEditingHurdle(null);
                                      if (e.key === 'Escape') setEditingHurdle(null);
                                    }}
                                    className="h-7 text-sm"
                                  />
                                ) : (
                                  <span
                                    className={`text-sm cursor-pointer hover:text-primary transition-colors block ${item.resolved ? 'line-through text-muted-foreground' : ''}`}
                                    onClick={() => setEditingHurdle(index)}
                                  >
                                    {item.hurdle}
                                  </span>
                                )}
                                {/* Remedy sub-field */}
                                {editingRemedy === index ? (
                                  <Input
                                    autoFocus
                                    value={item.remedy}
                                    onChange={(e) => handleEditRemedy(index, e.target.value)}
                                    onBlur={() => setEditingRemedy(null)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') setEditingRemedy(null);
                                      if (e.key === 'Escape') setEditingRemedy(null);
                                    }}
                                    placeholder="Add a remedy..."
                                    className="h-7 text-sm mt-1"
                                  />
                                ) : (
                                  <span
                                    className={`text-xs cursor-pointer hover:text-primary transition-colors block mt-1 ${item.resolved ? 'line-through text-muted-foreground/60' : 'text-muted-foreground'}`}
                                    onClick={() => setEditingRemedy(index)}
                                  >
                                    {item.remedy ? `Remedy: ${item.remedy}` : '+ Add remedy'}
                                  </span>
                                )}
                              </div>
                              <MemoCommentThread section="hurdles" sectionLabel="Hurdle" itemIndex={index} {...makeCommentHandlers('hurdles', index)} />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveHurdle(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </li>
                        </MemoSectionContextMenu>
                      ))}
                    </ol>
                    </TooltipProvider>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No hurdles added yet
                    </p>
                  )}
                  <Separator className="mt-6" />
                </div>
              </MemoSectionContextMenu>

              {/* Other sections */}
              {MEMO_SECTIONS.map((section, index) => (
                <MemoSectionContextMenu key={section.key} section={section.key} sectionLabel={section.label} {...makeCommentHandlers(section.key)}>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-foreground">
                        {section.label}
                      </label>
                      <MemoCommentThread section={section.key} sectionLabel={section.label} {...makeCommentHandlers(section.key)} />
                    </div>
                    <Textarea
                      value={localValues[section.key]}
                      onChange={(e) => handleChange(section.key, e.target.value)}
                      onBlur={handleFieldBlur}
                      placeholder={section.placeholder}
                      className="min-h-[100px] resize-none"
                    />
                    {index < MEMO_SECTIONS.length - 1 && (
                      <Separator className="mt-6" />
                    )}
                  </div>
                </MemoSectionContextMenu>
              ))}

              {/* Financial Comments from IS/BS */}
              {financialComments.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border">
                  <FinancialCommentsSection
                    comments={financialComments}
                    onDelete={deleteFinancialComment}
                    compact
                  />
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {autoSaveLabel && (
          <div 
            className={`px-6 py-2 border-t text-xs flex items-center gap-2 ${
              autoSaveStatus === 'error' ? 'bg-destructive/10 text-destructive cursor-pointer' 
              : autoSaveStatus === 'saved' ? 'bg-success/10 text-success' 
              : 'bg-muted/30 text-muted-foreground'
            }`}
            onClick={autoSaveStatus === 'error' ? saveNow : undefined}
          >
            {autoSaveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
            {autoSaveStatus === 'saved' && <Check className="h-3 w-3" />}
            {autoSaveLabel}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
