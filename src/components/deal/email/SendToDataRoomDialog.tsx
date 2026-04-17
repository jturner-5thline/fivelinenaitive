import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, FolderOpen, FileText, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  /** Optional pre-fetched suggestion (so the AI Assist sidebar can hand it off without a re-call). */
  initialSuggestion?: DataRoomDestinationSuggestion | null;
  /** If provided, only these attachment ids will be pre-included; others default to excluded. */
  preselectedAttachmentIds?: string[];
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
}: Props) {
  const { suggest, commitUpload, suggesting, uploading } = useEmailToDataRoom();
  const [suggestion, setSuggestion] = useState<DataRoomDestinationSuggestion | null>(initialSuggestion || null);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>(initialDealId || '');
  const [defaultCategory, setDefaultCategory] = useState<DealAttachmentCategory>('materials');
  const [plan, setPlan] = useState<UploadPlanItem[]>([]);

  const visibleAttachments = useMemo(() => attachments.filter((a) => !a.is_inline && !!a.id), [attachments]);

  // Fetch active deal list for the selector
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

  // Run AI suggestion on open if not provided
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

  // Apply suggestion → preselect deal + build plan
  useEffect(() => {
    if (!suggestion) {
      // No suggestion yet — initialize a default plan with all files included as 'materials'
      setPlan(
        visibleAttachments.map((a) => ({
          attachment: a,
          desiredName: a.filename || 'attachment',
          category: 'materials',
          include: true,
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
        return {
          attachment: a,
          desiredName: a.filename || 'attachment',
          category: m?.category || suggestion.default_category,
          include: m?.include ?? true,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, visibleAttachments]);

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

  const handleCommit = async () => {
    if (!canCommit) return;
    const result = await commitUpload({
      dealId: selectedDealId,
      messageId,
      sourceEmail,
      plan,
    });
    if (result && result.uploaded > 0) {
      onClose();
    }
  };

  const confidenceTone =
    suggestion?.confidence === 'high'
      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
      : suggestion?.confidence === 'medium'
        ? 'border-amber-500/30 text-amber-400 bg-amber-500/5'
        : 'border-muted-foreground/30 text-muted-foreground bg-muted/20';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4 text-primary" />
            Send to Data Room
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload {visibleAttachments.length} attachment{visibleAttachments.length === 1 ? '' : 's'} from
            “{sourceEmail.subject || 'this email'}” to a deal's data room.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-5 space-y-5">
            {/* AI suggestion banner */}
            {suggesting && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>AI is analyzing the email to suggest a destination…</span>
              </div>
            )}
            {!suggesting && suggestion && (
              <div className="rounded-md border border-border/40 bg-background/40 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    AI Suggestion
                  </span>
                  <Badge variant="outline" className={cn('ml-auto text-[9px] h-4 px-1.5 border', confidenceTone)}>
                    {suggestion.confidence}
                  </Badge>
                </div>
                {suggestion.suggested_deal_name ? (
                  <p className="text-xs text-foreground/90">
                    Suggested deal: <span className="font-medium">{suggestion.suggested_deal_name}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    Couldn't auto-match a deal — please pick one below.
                  </p>
                )}
                {suggestion.reason && (
                  <p className="text-[11px] text-muted-foreground italic leading-relaxed">{suggestion.reason}</p>
                )}
              </div>
            )}

            {/* Deal picker */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Deal Data Room
              </Label>
              <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a deal…" />
                </SelectTrigger>
                <SelectContent>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-sm">
                      {d.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDealName && (
                <p className="text-[11px] text-muted-foreground">
                  Files will land in <span className="font-medium text-foreground/80">{selectedDealName} Data Room — Internal</span>
                </p>
              )}
            </div>

            {/* Default category */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Default folder (applies to all)
              </Label>
              <Select value={defaultCategory} onValueChange={(v) => setAllCategory(v as DealAttachmentCategory)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_ATTACHMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-sm">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Files ({includedCount}/{plan.length} selected)
                </Label>
              </div>
              <div className="space-y-1.5">
                {plan.map((item, idx) => (
                  <div
                    key={item.attachment.id || idx}
                    className={cn(
                      'flex items-start gap-2 p-2.5 rounded-md border transition-opacity',
                      item.include ? 'border-border/40 bg-background/40' : 'border-border/20 bg-muted/10 opacity-60',
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
                          <SelectTrigger className="h-6 text-[10px] w-[110px]">
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
              <p className="text-[10px] text-muted-foreground">
                Files with names that already exist in the data room will be auto-saved as -v2, -v3, etc.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t border-border/40 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCommit} disabled={!canCommit} className="gap-1.5">
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <FolderOpen className="h-3.5 w-3.5" /> Add {includedCount} to Data Room
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
