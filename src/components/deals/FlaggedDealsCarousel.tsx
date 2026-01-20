import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Flag, ChevronLeft, ChevronRight, MessageSquare, X, DollarSign, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Deal } from '@/types/deal';
import { usePreferences } from '@/contexts/PreferencesContext';

interface FlaggedDealsCarouselProps {
  deals: Deal[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

function CarouselInner({ deals, onClose, initialIndex = 0 }: { 
  deals: Deal[]; 
  onClose: () => void; 
  initialIndex: number;
}) {
  const navigate = useNavigate();
  const { formatCurrencyValue } = usePreferences();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll('[data-card-index]');
    const target = cards[index] as HTMLElement | undefined;
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const containerCenter = containerRect.left + containerRect.width / 2;
    const targetCenter = targetRect.left + targetRect.width / 2;
    const delta = targetCenter - containerCenter;

    container.scrollTo({ left: container.scrollLeft + delta, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    const cards = container.querySelectorAll('[data-card-index]');
    
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    cards.forEach((card, index) => {
      const cardElement = card as HTMLElement;
      const cardCenter = cardElement.offsetLeft + cardElement.offsetWidth / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    setActiveIndex(closestIndex);
  }, []);

  const goToPrevious = useCallback(() => {
    const newIndex = Math.max(0, activeIndex - 1);
    setActiveIndex(newIndex);
    scrollToIndex(newIndex);
  }, [activeIndex, scrollToIndex]);

  const goToNext = useCallback(() => {
    const newIndex = Math.min(deals.length - 1, activeIndex + 1);
    setActiveIndex(newIndex);
    scrollToIndex(newIndex);
  }, [activeIndex, deals.length, scrollToIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      goToPrevious();
    } else if (e.key === 'ArrowRight') {
      goToNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [goToPrevious, goToNext, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
    setTouchStart(null);
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setActiveIndex(initialIndex);
    let raf1 = 0;
    let raf2 = 0;

    raf1 = requestAnimationFrame(() => {
      scrollToIndex(initialIndex, 'auto');
      raf2 = requestAnimationFrame(() => scrollToIndex(initialIndex, 'auto'));
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [scrollToIndex, initialIndex]);

  const handleCardClick = (deal: Deal, index: number) => {
    if (index !== activeIndex) {
      setActiveIndex(index);
      scrollToIndex(index);
    } else {
      onClose();
      navigate(`/deal/${deal.id}`);
    }
  };

  return (
    <div className="relative py-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-destructive" />
          <h3 className="text-lg font-medium text-foreground">Flagged Deals</h3>
          <Badge variant="destructive" className="ml-1">{deals.length}</Badge>
        </div>
        
        {/* Navigation Arrows */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={goToPrevious}
            disabled={activeIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={goToNext}
            disabled={activeIndex === deals.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full ml-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Carousel Container */}
      <div
        ref={scrollRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide items-center"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left Spacer */}
        <div className="flex-shrink-0 w-[calc(50%-190px)] md:w-[calc(50%-240px)]" />

        {/* Cards */}
        {deals.map((deal, index) => {
          const distance = Math.abs(index - activeIndex);
          const isActive = index === activeIndex;
          const opacity = isActive ? 1 : Math.max(0.4, 1 - distance * 0.25);

          return (
            <div
              key={deal.id}
              data-card-index={index}
              className="flex-shrink-0 snap-center px-3"
              style={{
                opacity,
                transform: isActive ? 'scale(1)' : `scale(${Math.max(0.85, 1 - distance * 0.05)})`,
                transition: 'opacity 0.6s cubic-bezier(0.25, 0.1, 0.25, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <Card
                className={`cursor-pointer transition-all duration-500 ease-out ${
                  isActive
                    ? 'w-[380px] md:w-[480px] min-h-[420px] md:min-h-[480px] shadow-2xl z-10'
                    : 'w-[280px] md:w-[320px] min-h-[320px] md:min-h-[360px] shadow-md'
                }`}
                onClick={() => handleCardClick(deal, index)}
              >
                <CardContent className="p-6 h-full flex flex-col">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-destructive/10">
                      <Flag className={`text-destructive fill-current ${isActive ? 'h-6 w-6' : 'h-5 w-5'}`} />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {deal.status}
                    </Badge>
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-4">
                    <div>
                      <h4 className={`font-semibold text-foreground ${isActive ? 'text-xl' : 'text-base'}`}>
                        {deal.company}
                      </h4>
                      <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span className={isActive ? 'text-base' : 'text-sm'}>
                          {formatCurrencyValue(deal.value)}
                        </span>
                      </div>
                      {deal.dealTypes && deal.dealTypes.length > 0 && (
                        <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                          <Building2 className="h-4 w-4" />
                          <span className={isActive ? 'text-sm' : 'text-xs'}>
                            {deal.dealTypes.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Flag Notes */}
                    {deal.flagNotes && (
                      <div className="p-3 rounded-md bg-muted/50 border border-border/50">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <p className={`text-muted-foreground leading-relaxed ${isActive ? 'text-sm' : 'text-xs line-clamp-3'}`}>
                            {deal.flagNotes}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-primary font-medium">
                        {deal.stage}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Updated {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}

        {/* Right Spacer */}
        <div className="flex-shrink-0 w-[calc(50%-190px)] md:w-[calc(50%-240px)]" />
      </div>

      {/* Dot Indicators */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {deals.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              setActiveIndex(index);
              scrollToIndex(index);
            }}
            className={`rounded-full transition-all duration-300 ${
              index === activeIndex
                ? 'w-8 h-2 bg-destructive'
                : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function FlaggedDealsCarousel({ deals, isOpen, onClose, initialIndex = 0 }: FlaggedDealsCarouselProps) {
  const flaggedDeals = deals.filter((deal) => deal.isFlagged);

  if (flaggedDeals.length === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle>Flagged Deals</DialogTitle>
          </DialogHeader>
        </VisuallyHidden>
        <CarouselInner 
          deals={flaggedDeals} 
          onClose={onClose}
          initialIndex={initialIndex}
        />
      </DialogContent>
    </Dialog>
  );
}
