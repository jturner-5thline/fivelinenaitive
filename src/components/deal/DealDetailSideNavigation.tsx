import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  setDealCarouselDirection,
  lockDealCarousel,
  isDealCarouselLocked,
} from '@/lib/dealCarouselNav';

interface SiblingDeal {
  id: string;
  company: string;
  stage: string;
}

interface DealDetailSideNavigationProps {
  currentDealId: string;
  pipelineId?: string;
  dealClass?: 'standard' | 'naitive' | 'finserv';
  companyId?: string;
}

/**
 * Fetches the stage order for a pipeline from deal_pipelines, 
 * then returns deals ordered by stage position + company name.
 */
async function fetchOrderedDeals(
  pipelineId: string | undefined,
  dealClass: string,
  companyId: string | undefined,
): Promise<SiblingDeal[]> {
  // 1. Resolve stage order from pipeline
  let stageOrder: string[] = [];

  if (pipelineId) {
    const { data: pipeline } = await supabase
      .from('deal_pipelines')
      .select('stages')
      .eq('id', pipelineId)
      .maybeSingle();

    if (pipeline?.stages && Array.isArray(pipeline.stages)) {
      stageOrder = (pipeline.stages as any[])
        .filter((s: any) => s && typeof s.id === 'string')
        .map((s: any) => s.id);
    }
  }

  // 2. Fetch deals in this pipeline
  let query = supabase
    .from('deals')
    .select('id, company, stage')
    .order('company', { ascending: true });

  if (pipelineId) {
    query = query.eq('pipeline_id', pipelineId);
  }
  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  // For standard deals without a specific pipeline, filter by deal_class
  if (!pipelineId && dealClass === 'standard') {
    // Standard deals in default pipeline — no pipeline filter, just company
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const deals: SiblingDeal[] = data.map((d: any) => ({
    id: d.id,
    company: d.company || '',
    stage: d.stage || '',
  }));

  // 3. Sort by stage order, then alphabetically within stage
  if (stageOrder.length > 0) {
    const stageIndex = new Map(stageOrder.map((s, i) => [s, i]));
    deals.sort((a, b) => {
      const ai = stageIndex.get(a.stage) ?? 999;
      const bi = stageIndex.get(b.stage) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.company.localeCompare(b.company);
    });
  }

  return deals;
}

export function DealDetailSideNavigation({
  currentDealId,
  pipelineId,
  dealClass = 'standard',
  companyId,
}: DealDetailSideNavigationProps) {
  const navigate = useNavigate();
  const [orderedDeals, setOrderedDeals] = useState<SiblingDeal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOrderedDeals(pipelineId, dealClass, companyId).then((deals) => {
      if (!cancelled) {
        setOrderedDeals(deals);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [pipelineId, dealClass, companyId]);

  const currentIndex = useMemo(
    () => orderedDeals.findIndex((d) => d.id === currentDealId),
    [orderedDeals, currentDealId],
  );

  const prevDeal = currentIndex > 0 ? orderedDeals[currentIndex - 1] : null;
  const nextDeal = currentIndex >= 0 && currentIndex < orderedDeals.length - 1
    ? orderedDeals[currentIndex + 1]
    : null;

  const goTo = useCallback(
    (dealId: string, dir: 'left' | 'right') => {
      if (isDealCarouselLocked()) return;
      setDealCarouselDirection(dir);
      lockDealCarousel();
      navigate(`/deal/${dealId}`, { replace: false });
    },
    [navigate],
  );

  // Keyboard navigation — only when no input/textarea is focused
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isEditable) return;

      if (e.key === 'ArrowLeft' && prevDeal) {
        e.preventDefault();
        goTo(prevDeal.id, 'left');
      } else if (e.key === 'ArrowRight' && nextDeal) {
        e.preventDefault();
        goTo(nextDeal.id, 'right');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevDeal, nextDeal, goTo]);

  // Don't render until loaded and we have at least 2 deals
  if (!loaded || orderedDeals.length < 2 || currentIndex < 0) return null;

  return (
    <>
      {/* Left arrow — previous deal */}
      <NavArrow
        direction="left"
        deal={prevDeal}
        onClick={() => prevDeal && goTo(prevDeal.id, 'left')}
      />

      {/* Right arrow — next deal */}
      <NavArrow
        direction="right"
        deal={nextDeal}
        onClick={() => nextDeal && goTo(nextDeal.id, 'right')}
      />
    </>
  );
}

function NavArrow({
  direction,
  deal,
  onClick,
}: {
  direction: 'left' | 'right';
  deal: SiblingDeal | null;
  onClick: () => void;
}) {
  const isLeft = direction === 'left';
  const Icon = isLeft ? ChevronLeft : ChevronRight;
  const disabled = !deal;

  // Outer wrapper is viewport-fixed and vertically centered. Hidden on
  // narrow viewports (<sm) so the arrows never overlap mobile content.
  // pointer-events-none when disabled so dead arrows don't swallow clicks
  // on the underlying page.
  const positionClasses = isLeft ? 'left-3 sm:left-4' : 'right-3 sm:right-4';

  return (
    <div
      className={`hidden sm:block fixed top-1/2 -translate-y-1/2 z-40 ${positionClasses} ${
        disabled ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={isLeft ? 'Previous deal' : 'Next deal'}
            className={`
              group flex items-center justify-center
              h-9 w-9 rounded-full
              border border-border/60
              bg-background/80 backdrop-blur-xl
              shadow-[0_6px_20px_-10px_rgba(0,0,0,0.45)]
              opacity-75
              transition-all duration-200
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100
              ${disabled
                ? 'opacity-0 cursor-not-allowed pointer-events-none'
                : 'hover:opacity-100 hover:scale-105 hover:bg-background/90 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55)] active:scale-95 cursor-pointer'
              }
            `}
          >
            <Icon className="h-[18px] w-[18px] text-foreground" strokeWidth={2.25} />
          </button>
        </TooltipTrigger>
        {deal && (
          <TooltipContent side={isLeft ? 'right' : 'left'} className="max-w-[200px]">
            <p className="text-xs font-medium truncate">{deal.company}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}
