import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Sparkles,
  FolderOpen,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Archive,
  Database,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EmailAttachment } from './mockEmailData';
import {
  useEmailToDataRoom,
  type DataRoomDestinationSuggestion,
  type SourceEmailMeta,
  type UploadPlanItem,
} from '@/hooks/useEmailToDataRoom';
import { DEAL_ATTACHMENT_CATEGORIES, type DealAttachmentCategory } from '@/hooks/useDealAttachments';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import type { Deal } from '@/types/deal';

interface DealOption {
  id: string;
  name: string;
  company: string;
  stageLabel: string;
  updatedAt: string;
  isArchived: boolean;
  isActivePipeline: boolean;
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

function formatLastActivity(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
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
  const { deals: allDeals } = useDealsContext();
  const { activePipelineId } = usePipelineContext();
  const { stages } = useDealStages();

  const [suggestion, setSuggestion] = useState<DataRoomDestinationSuggestion | null>(initialSuggestion || null);
  const [selectedDealId, setSelectedDealId] = useState<string>(initialDealId || '');
  const [userChangedDeal, setUserChangedDeal] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState<DealAttachmentCategory>('materials');
  const [plan, setPlan] = useState<UploadPlanItem[]>([]);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [dealPickerOpen, setDealPickerOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const stageLabelById = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach((s) => m.set(s.id, s.label));
    return m;
  }, [stages]);

  const handleUserSelectDeal = (id: string) => {
    setUserChangedDeal(true);
    setSelectedDealId(id);
    setDealPickerOpen(false);
  };

  const visibleAttachments = useMemo(() => attachments.filter((a) => !a.is_inline && !!a.id), [attachments]);

  // Fetch AI suggestion (only once per open)
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

  // Build plan + auto-apply suggested deal
  useEffect(() => {
    const preselectSet =
      preselectedAttachmentIds && preselectedAttachmentIds.length > 0
        ? new Set(preselectedAttachmentIds)
        : null;
    const isPreselected = (att: EmailAttachment) => !preselectSet || (!!att.id && preselectSet.has(att.id));

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

    // Auto-apply suggested deal — only if user hasn't manually changed it
    if (
      !userChangedDeal &&
      suggestion.suggested_deal_id &&
      (suggestion.confidence === 'high' || suggestion.confidence === 'medium') &&
      suggestion.suggested_deal_id !== selectedDealId
    ) {
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

  // Build dealOptions from the live deals context (same source as Active Deals sidebar)
  const dealOptions: DealOption[] = useMemo(() => {
    const map = new Map<string, DealOption>();
    const toOpt = (d: Deal): DealOption => ({
      id: d.id,
      name: d.name || d.company,
      company: d.company,
      stageLabel: stageLabelById.get(d.stage) || d.stage || '',
      updatedAt: d.updatedAt,
      isArchived: d.status === 'archived',
      isActivePipeline: !!activePipelineId && d.pipelineId === activePipelineId,
    });
    allDeals.forEach((d) => map.set(d.id, toOpt(d)));

    // Always inject initial + suggested deal so the trigger never shows blank
    if (initialDealId && !map.has(initialDealId)) {
      map.set(initialDealId, {
        id: initialDealId,
        name: initialDealName || 'Deal',
        company: initialDealName || 'Deal',
        stageLabel: '',
        updatedAt: new Date().toISOString(),
        isArchived: false,
        isActivePipeline: false,
      });
    }
    if (suggestion?.suggested_deal_id && !map.has(suggestion.suggested_deal_id)) {
      map.set(suggestion.suggested_deal_id, {
        id: suggestion.suggested_deal_id,
        name: suggestion.suggested_deal_name || 'Suggested Deal',
        company: suggestion.suggested_deal_name || 'Suggested Deal',
        stageLabel: '',
        updatedAt: new Date().toISOString(),
        isArchived: false,
        isActivePipeline: false,
      });
    }
    return Array.from(map.values());
  }, [allDeals, activePipelineId, stageLabelById, initialDealId, initialDealName, suggestion]);

  const selectedOption = useMemo(
    () => dealOptions.find((d) => d.id === selectedDealId),
    [dealOptions, selectedDealId],
  );
  const selectedDealName = selectedOption?.name || selectedOption?.company || '';

  // Grouped & sorted options
  const grouped = useMemo(() => {
    const suggestedId = suggestion?.suggested_deal_id;
    const sortByRecent = (a: DealOption, b: DealOption) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

    const suggested = suggestedId ? dealOptions.find((d) => d.id === suggestedId) : undefined;
    const rest = dealOptions.filter((d) => d.id !== suggestedId);
    const activePipeline = rest.filter((d) => !d.isArchived && d.isActivePipeline).sort(sortByRecent);
    const otherActive = rest.filter((d) => !d.isArchived && !d.isActivePipeline).sort(sortByRecent);
    const archived = rest.filter((d) => d.isArchived).sort(sortByRecent);
    return { suggested, activePipeline, otherActive, archived };
  }, [dealOptions, suggestion?.suggested_deal_id]);

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

  const renderDealItem = (d: DealOption, opts?: { suggested?: boolean }) => {
    const isSelected = d.id === selectedDealId;
    return (
      <CommandItem
        key={d.id}
        value={`${d.name} ${d.company} ${d.stageLabel}`}
        onSelect={() => handleUserSelectDeal(d.id)}
        className="flex items-start gap-2 py-2"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{d.name}</span>
            {opts?.suggested && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-medium gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                Suggested
              </Badge>
            )}
            <Database className="h-3 w-3 text-muted-foreground/50 shrink-0" aria-label="Has data room" />
          </div>
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
            {d.company !== d.name && <span>{d.company}</span>}
            {d.company !== d.name && d.stageLabel && <span className="mx-1">·</span>}
            {d.stageLabel && <span>{d.stageLabel}</span>}
            {d.updatedAt && (
              <>
                <span className="mx-1">·</span>
                <span>{formatLastActivity(d.updatedAt)}</span>
              </>
            )}
          </div>
        </div>
        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />}
      </CommandItem>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Add attachments to Data Room</DialogTitle>
        </VisuallyHidden>
        {/* ===== Banner header — primary action surface ===== */}
        <div className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold leading-tight text-foreground">
                {selectedDealName ? (
                  <>
                    Add attachments to <span className="text-primary">{selectedDealName}</span> Data Room
                  </>
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
                    We found {visibleAttachments.length} attachment
                    {visibleAttachments.length === 1 ? '' : 's'} in this thread
                    {selectedDealName ? ' and matched them to this deal' : ''}. Review and send them in one step.
                  </>
                )}
              </p>

              {/* Compact AI context row */}
              {!suggesting && suggestion?.suggested_deal_name && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary/70 shrink-0" />
                  <span>
                    Suggested deal:{' '}
                    <span className="font-medium text-foreground/80">{suggestion.suggested_deal_name}</span>
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
            <Button size="sm" onClick={handleCommit} disabled={!canCommit} className="gap-1.5 h-9 px-4">
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

            {/* Searchable Deal combobox — replaces the prior Select */}
            <Popover open={dealPickerOpen} onOpenChange={setDealPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <Search className="h-3 w-3" />
                  {selectedDealName ? 'Change deal' : 'Choose deal'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[380px]" align="start">
                <Command
                  filter={(value, search) => {
                    if (!search) return 1;
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput placeholder="Search deals by name, company, or stage…" className="h-9 text-xs" />
                  <CommandList className="max-h-[340px]">
                    <CommandEmpty>
                      <div className="py-3 px-2 text-center space-y-2">
                        <p className="text-xs text-muted-foreground">No deals match.</p>
                        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled>
                          + Create new deal from this email
                        </Button>
                      </div>
                    </CommandEmpty>

                    {grouped.suggested && (
                      <>
                        <CommandGroup heading="AI Suggested">
                          {renderDealItem(grouped.suggested, { suggested: true })}
                        </CommandGroup>
                        <CommandSeparator />
                      </>
                    )}

                    {grouped.activePipeline.length > 0 && (
                      <CommandGroup heading="Active Pipeline">
                        {grouped.activePipeline.map((d) => renderDealItem(d))}
                      </CommandGroup>
                    )}

                    {grouped.otherActive.length > 0 && (
                      <>
                        {grouped.activePipeline.length > 0 && <CommandSeparator />}
                        <CommandGroup heading="Other Active Deals">
                          {grouped.otherActive.map((d) => renderDealItem(d))}
                        </CommandGroup>
                      </>
                    )}

                    {grouped.archived.length > 0 && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Recently Closed / Archived">
                          <CommandItem
                            value="__toggle_archived__"
                            onSelect={() => setShowArchived((v) => !v)}
                            className="text-[11px] text-muted-foreground gap-1.5"
                          >
                            <Archive className="h-3 w-3" />
                            {showArchived
                              ? `Hide ${grouped.archived.length} archived`
                              : `Show ${grouped.archived.length} archived`}
                            {showArchived ? (
                              <ChevronUp className="h-3 w-3 ml-auto" />
                            ) : (
                              <ChevronDown className="h-3 w-3 ml-auto" />
                            )}
                          </CommandItem>
                          {showArchived && grouped.archived.map((d) => renderDealItem(d))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* ===== Configuration row — only the folder selector (deal lives in combobox above) ===== */}
        <div className="px-6 py-2.5 border-b border-border/40 bg-muted/10 shrink-0 flex items-center gap-3 flex-wrap">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Default folder
          </label>
          <Select value={defaultCategory} onValueChange={(v) => setAllCategory(v as DealAttachmentCategory)}>
            <SelectTrigger className="h-7 text-xs w-[160px]">
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

        {/* ===== Compact summary row ===== */}
        <div className="px-6 py-2.5 border-b border-border/40 shrink-0 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground/80">{includedCount} files</span>
            <span className="text-muted-foreground/50">→</span>
            <span className="text-foreground/80">{selectedDealName || 'select a deal'}</span>
            <span className="text-muted-foreground/50">→</span>
            <span>{defaultFolderLabel}</span>
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

        {/* ===== Footer ===== */}
        <div className="px-6 py-3 border-t border-border/40 shrink-0 flex items-center justify-between bg-muted/10">
          <p className="text-[10px] text-muted-foreground">
            Files will land in{' '}
            <span className="font-medium text-foreground/70">
              {selectedDealName || 'selected deal'} Data Room — Internal
            </span>
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading} className="h-8">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
