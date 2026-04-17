import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, FolderOpen, FileText, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { EmailAttachment } from './mockEmailData';
import {
  useEmailToDataRoom,
  type DataRoomDestinationSuggestion,
  type SourceEmailMeta,
  type UploadPlanItem,
} from '@/hooks/useEmailToDataRoom';
import { DEAL_ATTACHMENT_CATEGORIES, type DealAttachmentCategory } from '@/hooks/useDealAttachments';

interface DealOption {
  id: string;
  company: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  attachments: EmailAttachment[];
  messageId: string;
  threadData: any;
  sourceEmail: SourceEmailMeta;
  initialDealId?: string;
  initialDealName?: string;
  initialSuggestion?: DataRoomDestinationSuggestion | null;
  preselectedAttachmentIds?: string[];
  onUploaded?: (info: { dealName: string; uploaded: number; failed: number }) => void;
}

function formatBytes(b: number): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function SendToDataRoomDialog({
  open,
  onClose,
  attachments,
  messageId,
  threadData,
  sourceEmail,
  initialDealId,
  initialDealName,
  initialSuggestion,
  preselectedAttachmentIds,
  onUploaded,
}: Props) {
  const { suggest, commitUpload, suggesting, uploading } = useEmailToDataRoom();
  const [suggestion, setSuggestion] = useState<DataRoomDestinationSuggestion | null>(initialSuggestion || null);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>(initialDealId || '');
  const [defaultCategory, setDefaultCategory] = useState<DealAttachmentCategory>('materials');
  const [plan, setPlan] = useState<UploadPlanItem[]>([]);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [showDealPicker, setShowDealPicker] = useState(false);

  const visibleAttachments = useMemo(() => attachments.filter((a) => !a.is_inline && !!a.id), [attachments]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase
      .from('deals')
      .select('id, company, status')
      .eq('status', 'active')
      .order('company')
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setDeals((data || []).map((d: any) => ({ id: d.id, company: d.company })));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || initialSuggestion) return;
    let cancelled = false;
    (async () => {
      const r = await suggest({
        dealId: initialDealId,
        sourceEmail,
        threadData,
        attachments: visibleAttachments,
      });
      if (!cancelled && r) setSuggestion(r);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const preselectSet = preselectedAttachmentIds && preselectedAttachmentIds.length > 0
      ? new Set(preselectedAttachmentIds)
      : null;
    const isPreselected = (att: EmailAttachment) =>
      !preselectSet || (!!att.id && preselectSet.has(att.id));

    if (!suggestion) {
      setPlan(
        visibleAttachments.map((a) => ({
          attachment: a,
          desiredName: a.filename || 'attachment',
          category: 'materials',
          include: isPreselected(a),
        })),
      );
      return;
    }
    if (!selectedDealId && suggestion.suggested_deal_id) {
      setSelectedDealId(suggestion.suggested_deal_id);
    }
    setDefaultCategory(suggestion.default_category);
    const perFileMap = new Map(suggestion.per_file.map((p) => [p.filename, p]));
    setPlan(
      visibleAttachments.map((a) => {
        const m = perFileMap.get(a.filename || '');
        const aiInclude = m?.include ?? true;
        return {
          attachment: a,
          desiredName: a.filename || 'attachment',
          category: m?.category || suggestion.default_category,
          include: preselectSet ? isPreselected(a) : aiInclude,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, visibleAttachments, preselectedAttachmentIds]);

  const selectedDealName =
    deals.find((d) => d.id === selectedDealId)?.company ||
    (selectedDealId === initialDealId ? initialDealName : undefined) ||
    suggestion?.suggested_deal_name;

  const includedCount = plan.filter((p) => p.include).length;
  const canCommit = !!selectedDealId && includedCount > 0 && !uploading;

  const updatePlanItem = (idx: number, patch: Partial<UploadPlanItem>) => {
    setPlan((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const setAllCategory = (cat: DealAttachmentCategory) => {
    setDefaultCategory(cat);
    setPlan((prev) => prev.map((p) => ({ ...p, category: cat })));
  };

  const defaultFolderLabel =
    DEAL_ATTACHMENT_CATEGORIES.find((c) => c.value === defaultCategory)?.label || 'Materials';

  const handleCommit = async () => {
    if (!canCommit) return;
    const result = await commitUpload({
      dealId: selectedDealId,
      messageId,
      sourceEmail,
      plan,
    });
    if (result && result.uploaded > 0) {
      onUploaded?.({
        dealName: selectedDealName || 'Data Room',
        uploaded: result.uploaded,
        failed: result.failed,
      });
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ===== Banner header — primary action surface ===== */}
        <div className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold leading-tight text-foreground">
                {selectedDealName ? (
                  <>Add attachments to <span className="text-primary">{selectedDealName}</span> Data Room</>
                ) : (
                  <>Add attachments to Data Room</>
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {suggesting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing this thread…
                  </span>
                ) : (
                  <>
                    We found {visibleAttachments.length} attachment{visibleAttachments.length === 1 ? '' : 's'} in this thread
                    {selectedDealName ? ' and matched them to this deal' : ''}. Review and send them in one step.
                  </>
                )}
              </p>

              {/* Compact AI context row */}
              {!suggesting && suggestion?.suggested_deal_name && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary/70 shrink-0" />
                  <span>
                    Suggested deal: <span className="font-medium text-foreground/80">{suggestion.suggested_deal_name}</span>
                    <span className="text-muted-foreground/70"> · matched from sender, subject, and attachment names</span>
                  </span>
                </div>
              )}
              {!suggesting && suggestion && !suggestion.suggested_deal_name && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Couldn't auto-match a deal — pick one below.</span>
                </div>
              )}
            </div>
          </div>

          {/* Primary action row */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleCommit}
              disabled={!canCommit}
              className="gap-1.5 h-9 px-4"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Add {includedCount} to {selectedDealName ? `${selectedDealName} ` : ''}Data Room
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilesExpanded((v) => !v)}
              className="h-9 gap-1.5"
            >
              Review files
              {filesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDealPicker((v) => !v)}
              className="h-9 text-xs text-muted-foreground hover:text-foreground"
            >
              Change deal
            </Button>
          </div>
        </div>

        {/* ===== Configuration row (tight, inline) ===== */}
        {(showDealPicker || !selectedDealId) && (
          <div className="px-6 py-3 border-b border-border/40 bg-muted/10 shrink-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
                  Deal
                </label>
                <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a deal…" />
                  </SelectTrigger>
                  <SelectContent>
                    {deals.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
                  Default folder
                </label>
                <Select value={defaultCategory} onValueChange={(v) => setAllCategory(v as DealAttachmentCategory)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_ATTACHMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* ===== Compact summary row ===== */}
        <div className="px-6 py-2.5 border-b border-border/40 shrink-0 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground/80">
              {includedCount} of {plan.length} selected
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>Default folder: <span className="text-foreground/70">{defaultFolderLabel}</span></span>
            <span className="text-muted-foreground/50">·</span>
            <span>Duplicates auto-versioned</span>
          </div>
          {!filesExpanded && (
            <button
              type="button"
              onClick={() => setFilesExpanded(true)}
              className="text-primary hover:text-primary/80 font-medium shrink-0"
            >
              Show files
            </button>
          )}
        </div>

        {/* ===== File list (collapsible / subordinate) ===== */}
        {filesExpanded && (
          <ScrollArea className="flex-1 min-h-0 max-h-[42vh]">
            <div className="px-6 py-3 space-y-1.5">
              {plan.map((item, idx) => (
                <div
                  key={item.attachment.id || idx}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 rounded-md border transition-opacity',
                    item.include
                      ? 'border-border/40 bg-background/40'
                      : 'border-border/20 bg-muted/10 opacity-60',
                  )}
                >
                  <Checkbox
                    checked={item.include}
                    onCheckedChange={(v) => updatePlanItem(idx, { include: !!v })}
                    className="mt-1.5"
                  />
                  <FileText className="h-4 w-4 text-muted-foreground mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <Input
                      value={item.desiredName}
                      onChange={(e) => updatePlanItem(idx, { desiredName: e.target.value })}
                      disabled={!item.include}
                      className="h-7 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <Select
                        value={item.category}
                        onValueChange={(v) => updatePlanItem(idx, { category: v as DealAttachmentCategory })}
                        disabled={!item.include}
                      >
                        <SelectTrigger className="h-6 text-[10px] w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEAL_ATTACHMENT_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value} className="text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground">{formatBytes(item.attachment.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* ===== Footer (cancel only — primary action is in banner) ===== */}
        <div className="px-6 py-3 border-t border-border/40 shrink-0 flex items-center justify-between bg-muted/10">
          <p className="text-[10px] text-muted-foreground">
            Files will land in <span className="font-medium text-foreground/70">{selectedDealName || 'selected deal'} Data Room — Internal</span>
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading} className="h-8">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
