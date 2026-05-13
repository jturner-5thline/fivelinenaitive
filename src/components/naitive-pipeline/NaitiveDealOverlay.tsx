import { useEffect, useMemo, useRef, useState } from 'react';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, X, ExternalLink, Plus, Mail, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';
import { Link } from 'react-router-dom';

const ICP_STYLES: Record<string, string> = {
  'Debt Advisory': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'M&A': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Equity': 'bg-green-500/15 text-green-300 border-green-500/30',
  'Placement Agent': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'Broker': 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  'Other': 'bg-gray-500/15 text-gray-300 border-gray-500/30',
};

const OWNER_STYLES: Record<string, string> = {
  Paz: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  Flor: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
  James: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
};

function getInitials(name?: string) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}

function formatLastActivity(updatedAt?: string) {
  if (!updatedAt) return null;
  const d = differenceInDays(new Date(), new Date(updatedAt));
  if (d <= 0) return 'today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

function formatDate(d?: string | null) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return null; }
}

interface Props {
  /** Currently open deal. Null when overlay is closed. */
  deal: Deal | null;
  /** Flat ordered list used for prev/next traversal (column-by-column, top-to-bottom). */
  orderedDeals: Deal[];
  stages: DealStageOption[];
  onClose: () => void;
  onNavigate: (deal: Deal) => void;
  onStageChange: (dealId: string, newStage: string) => void;
}

/**
 * Full-page-feel overlay that renders the existing deal detail route inside
 * an iframe, so we keep the kanban board mounted behind it and let users
 * sweep through deals with ←/→ without losing context.
 */
export function NaitiveDealOverlay({ deal, orderedDeals, stages, onClose, onNavigate, onStageChange }: Props) {
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(m.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    m.addEventListener?.('change', handler);
    return () => m.removeEventListener?.('change', handler);
  }, []);

  const idx = useMemo(
    () => (deal ? orderedDeals.findIndex(d => d.id === deal.id) : -1),
    [deal, orderedDeals],
  );
  const prevDeal = idx > 0 ? orderedDeals[idx - 1] : null;
  const nextDeal = idx >= 0 && idx < orderedDeals.length - 1 ? orderedDeals[idx + 1] : null;

  const goPrev = () => {
    if (!prevDeal) return;
    setSlideDir('right');
    onNavigate(prevDeal);
    window.setTimeout(() => setSlideDir(null), 200);
  };
  const goNext = () => {
    if (!nextDeal) return;
    setSlideDir('left');
    onNavigate(nextDeal);
    window.setTimeout(() => setSlideDir(null), 200);
  };

  // Esc + arrow key navigation. Skip when focus is in an editable element
  // inside the overlay so typing still works inside DealDetail.
  useEffect(() => {
    if (!deal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id, prevDeal?.id, nextDeal?.id]);

  if (!deal) return null;

  const owner = deal.ownedBy || deal.manager;
  const lastActivity = formatLastActivity(deal.updatedAt);
  const nextDate = formatDate(deal.nextStepDate);

  const slideClass = reduceMotion || !slideDir
    ? ''
    : slideDir === 'left'
      ? 'animate-[slide-from-right_180ms_ease-in-out]'
      : 'animate-[slide-from-left_180ms_ease-in-out]';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Deal details for ${deal.company || 'deal'}`}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/55 backdrop-blur-sm',
          reduceMotion ? '' : 'animate-fade-in',
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-[90vw] h-[90vh] flex flex-col rounded-xl border border-white/10 bg-background shadow-2xl overflow-hidden',
          reduceMotion ? '' : 'animate-scale-in',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={goPrev}
              disabled={!prevDeal}
              aria-label="Previous deal"
              title="Previous deal (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={goNext}
              disabled={!nextDeal}
              aria-label="Next deal"
              title="Next deal (→)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-xl font-bold truncate">{deal.company || 'Unnamed deal'}</h2>
              {deal.contact && (
                <span className="text-xs text-muted-foreground truncate">{deal.contact}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {deal.icpCategory && (
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border',
                ICP_STYLES[deal.icpCategory] || ICP_STYLES['Other'],
              )}>
                {deal.icpCategory}
              </span>
            )}
            {owner && (
              <span
                className={cn(
                  'inline-flex items-center justify-center h-6 min-w-[24px] px-1.5 rounded-full text-[11px] font-semibold border',
                  OWNER_STYLES[owner] || 'bg-muted text-muted-foreground border-border',
                )}
                title={`Owned by ${owner}`}
              >
                {getInitials(owner)}
              </span>
            )}

            <Select
              value={deal.stage}
              onValueChange={(v) => onStageChange(deal.id, v)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Link
              to={`/deal/${deal.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              title="Open full page"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body — embeds the existing deal detail page so every tab/feature
            (Deal Info, Deal Space, Lenders, Management, Write Up, Data Room…)
            stays identical to the standalone /deal/:id route. */}
        <div className={cn('relative flex-1 min-h-0 bg-background', slideClass)}>
          <iframe
            key={deal.id}
            ref={iframeRef}
            src={`/deal/${deal.id}?embedded=1`}
            title={`Deal ${deal.company || deal.id}`}
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-white/10 bg-background/95 backdrop-blur text-xs">
          <span className="text-muted-foreground">
            Last activity: <span className="text-foreground">{lastActivity || '—'}</span>
          </span>
          <span className="text-muted-foreground truncate">
            Next: <span className="text-foreground">{deal.nextStep || '—'}</span>
            {nextDate ? <span className="text-muted-foreground"> · {nextDate}</span> : null}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
              iframeRef.current?.contentWindow?.postMessage({ type: 'naitive:add-task' }, window.location.origin);
            }}>
              <Plus className="h-3.5 w-3.5" /> Add Task
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
              iframeRef.current?.contentWindow?.postMessage({ type: 'naitive:follow-up' }, window.location.origin);
            }}>
              <Mail className="h-3.5 w-3.5" /> Follow Up
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
              <Link to={`/deal/${deal.id}`}>
                <Pencil className="h-3.5 w-3.5" /> Edit Deal
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}