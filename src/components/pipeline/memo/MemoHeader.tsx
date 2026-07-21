import type { Deal } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { formatDealType } from '@/utils/dealTypeLabels';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { EditableDealStatusTag } from '@/components/deal/EditableDealStatusTag';
import { EditableDealStageTag } from '@/components/deal/EditableDealStageTag';
import { DraftEmailToClientContactButton } from '@/components/deal/DraftEmailToClientContactButton';
import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, X } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';

interface MemoHeaderProps {
  deal: Deal;
  /** Show pulsing live-deal dot (only on the topmost visible card). */
  showLiveDot?: boolean;
  /** Opens the full deal details drawer/page. The card itself is no
   *  longer a click target — only this header button navigates. */
  onOpenDeal?: () => void;
  /** Optional close handler — when provided, renders an X button on the
   *  right edge of the header actions row (used by the inline detail
   *  panel on the Deals page). */
  onClose?: () => void;
}

function formatAmount(value: number | undefined | null): string {
  if (!value || value <= 0) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

/**
 * Memo card header. Renders deal/company name, inline pill badges for
 * deal size, engagement type and asset class, and a "Live deal" status
 * indicator on the right edge.
 */
export function MemoHeader({ deal, showLiveDot = true, onOpenDeal, onClose }: MemoHeaderProps) {
  const amountLabel = formatAmount(deal.value);
  const structureLabel = deal.engagementType
    ? deal.engagementType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;
  const assetClassRaw = (deal.dealTypes && deal.dealTypes[0]) || null;
  const assetClass = assetClassRaw ? formatDealType(assetClassRaw) : null;
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const rawStage = (deal.stage as string | undefined) || '';
  const resolvedLabel = rawStage
    ? getStageConfigForDeal(rawStage, deal.pipelineId)?.label
    : null;
  const stageLabel =
    resolvedLabel ||
    (rawStage
      ? rawStage.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : null);

  // Real deal status text: comes from the deal's free-text "status notes"
  // field (stored as rich-text HTML in `deal.notes`), which is the same
  // value shown in the deal detail header tile.
  const statusText = (() => {
    const raw = (deal.notes || '').toString();
    if (!raw.trim()) return null;
    const stripped = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped || null;
  })();
  const statusDisplay = statusText || stageLabel;

  // Inline edit state for the Status row. Persists into deal.notes
  // via the same updateDeal mutation used by DealCard + DealDetail so
  // every other consumer (memo, card, detail header) refreshes in lockstep.
  const { updateDeal } = useDealsContext();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setOptimistic(null); }, [deal.id, deal.notes]);

  const effectiveStatusText = optimistic ?? statusText;
  const effectiveDisplay = effectiveStatusText || stageLabel;

  const beginEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(effectiveStatusText || '');
    setErrorMsg(null);
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const cancelEdit = () => {
    setIsEditing(false);
    setErrorMsg(null);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    if (next === (effectiveStatusText || '')) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    const prevOptimistic = optimistic;
    setOptimistic(next);
    try {
      await updateDeal(deal.id, { notes: next ? next : null });
      setIsEditing(false);
    } catch (e) {
      setOptimistic(prevOptimistic);
      const msg = e instanceof Error ? e.message : 'Save failed';
      setErrorMsg(msg);
      toast.error(`Failed to update status — ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
    e.stopPropagation();
  };

  return (
    <div className="px-5 pt-4 pb-3 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {onOpenDeal ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenDeal(); }}
                title={`Open details for ${deal.company || deal.name}`}
                className="text-[20px] font-semibold leading-tight tracking-tight text-white truncate text-left hover:text-primary hover:underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
              >
                <h2 className="truncate">{deal.company || deal.name}</h2>
              </button>
            ) : (
              <h2
                className="text-[20px] font-semibold leading-tight tracking-tight text-white truncate"
                title={deal.company || deal.name}
              >
                {deal.company || deal.name}
              </h2>
            )}
            {amountLabel !== '—' && (
              <span className="text-[17px] font-semibold text-white shrink-0">{amountLabel}</span>
            )}
            <EditableDealStatusTag dealId={deal.id} status={deal.status} className="scale-115 origin-left" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <EditableDealStageTag
              dealId={deal.id}
              stage={deal.stage}
              pipelineId={deal.pipelineId}
              className="scale-115 origin-left"
            />
            {structureLabel && (
              <Badge variant="gray" className="rounded-full font-medium">{structureLabel}</Badge>
            )}
            {assetClass && (
              <Badge variant="gray" className="rounded-full font-medium">{assetClass}</Badge>
            )}
          </div>
        </div>
        <div
          className="flex flex-wrap items-center justify-end gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Email — launches the existing thread-aware Draft Email to
              Client Contact dialog. Reuses the same composer + thread
              picker shipped on the deal detail page. */}
          <DraftEmailToClientContactButton
            dealId={deal.id}
            dealName={deal.name || deal.company}
            contactName={deal.contact}
            contactInfo={deal.contactInfo}
            companyDomain={deal.companyUrl}
            size="sm"
            variant="outline"
            label="Email"
            className="h-7 px-2 shrink-0"
          />
          {onOpenDeal && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 shrink-0 gap-1"
              onClick={(e) => { e.stopPropagation(); onOpenDeal(); }}
              aria-label={`Open details for ${deal.company || deal.name}`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Open details
            </Button>
          )}
          {onClose && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0 text-[#9697a6] hover:text-[#f4f4f7]"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label="Close deal summary"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div
        className="mt-1.5"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[12px] text-muted-foreground/70 pt-1.5 shrink-0">Status:</span>
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
                placeholder="Add a status update…"
                className="min-h-[56px] text-[12px] leading-snug bg-background/40"
              />
            </div>
            <div className="flex items-center justify-end gap-1.5">
              {errorMsg && (
                <span className="mr-auto text-[11px] text-destructive">{errorMsg}</span>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={beginEdit}
            title={effectiveDisplay ? `${effectiveDisplay} — click to edit` : 'Add a status update'}
            className="group w-full text-left text-[13px] leading-snug text-foreground/85 break-words rounded px-1 -mx-1 py-0.5 hover:bg-white/5 transition-colors"
          >
            <span className="text-foreground/60 font-medium uppercase tracking-wider text-[10px]">Status</span>{' '}
            {effectiveDisplay ? (
              <span className="text-foreground">{effectiveDisplay}</span>
            ) : (
              <span className="italic text-muted-foreground/60">Add a status update</span>
            )}
            <Pencil className="inline-block ml-1.5 h-3 w-3 align-[-2px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>
    </div>
  );
}