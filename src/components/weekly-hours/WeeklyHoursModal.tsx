import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SaveIndicator } from '@/components/ui/save-indicator';
import { ChevronLeft, ChevronRight, Clock, Check, Briefcase, ArrowRight } from 'lucide-react';
import { useWeeklyHours, formatWeekLabel } from '@/hooks/useWeeklyHours';
import { cn } from '@/lib/utils';

interface WeeklyHoursModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  week?: string;
}

export function WeeklyHoursModal({ open, onOpenChange, week }: WeeklyHoursModalProps) {
  const { deals, week: currentWeek, task, isLoading, saveEntry, completeTask } = useWeeklyHours(week);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localHours, setLocalHours] = useState<Record<string, string>>({});
  const [savedDeals, setSavedDeals] = useState<Set<string>>(new Set());
  const [savingDeal, setSavingDeal] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset all state when modal opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setLocalHours({});
      setSavedDeals(new Set());
      setSavingDeal(null);
      setShowSaveSuccess(null);
    }
  }, [open]);

  // Sync existing hours to local state
  useEffect(() => {
    if (deals.length > 0) {
      const existing: Record<string, string> = {};
      const saved = new Set<string>();
      deals.forEach(d => {
        if (d.existingHours !== null) {
          existing[d.dealId] = String(d.existingHours);
          saved.add(d.dealId);
        }
      });
      setLocalHours(existing);
      setSavedDeals(saved);
    }
  }, [deals, open]);

  // Focus input when card changes
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentIndex, open]);

  const currentDeal = deals[currentIndex];
  const totalDeals = deals.length;
  const savedCount = savedDeals.size;
  const isTaskComplete = task?.status === 'completed';

  const goNext = useCallback(() => {
    if (currentIndex < totalDeals - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, totalDeals]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  const handleSave = useCallback(async () => {
    if (!currentDeal) return;
    const hours = parseFloat(localHours[currentDeal.dealId] || '0');
    if (isNaN(hours) || hours < 0 || hours > 168) return;

    setSavingDeal(currentDeal.dealId);
    try {
      await saveEntry.mutateAsync({ dealId: currentDeal.dealId, hours });
      setSavedDeals(prev => new Set(prev).add(currentDeal.dealId));
      setShowSaveSuccess(currentDeal.dealId);
      setTimeout(() => setShowSaveSuccess(null), 1500);
      // Auto-advance after save
      if (currentIndex < totalDeals - 1) {
        setTimeout(goNext, 600);
      }
    } finally {
      setSavingDeal(null);
    }
  }, [currentDeal, localHours, saveEntry, currentIndex, totalDeals, goNext]);

  const handleComplete = useCallback(async () => {
    await completeTask.mutateAsync();
    onOpenChange(false);
  }, [completeTask, onOpenChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'ArrowLeft' && e.altKey) {
      goPrev();
    } else if (e.key === 'ArrowRight' && e.altKey) {
      goNext();
    }
  }, [handleSave, goPrev, goNext]);

  const hasUnsavedChanges = currentDeal && (
    (localHours[currentDeal.dealId] || '0') !== String(currentDeal.existingHours ?? '0')
    && !savedDeals.has(currentDeal.dealId)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Weekly Hours
          </DialogTitle>
          <DialogDescription>
            Week of {formatWeekLabel(currentWeek)} · Log your hours for each active deal.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : totalDeals === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No active deals assigned to you this week.</p>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${totalDeals > 0 ? (savedCount / totalDeals) * 100 : 0}%` }}
                />
              </div>
              <span className="font-medium shrink-0">{savedCount} of {totalDeals} saved</span>
            </div>

            {/* Deal card */}
            <div className="border rounded-lg p-4 space-y-4 bg-card">
              {/* Header with nav */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentIndex === 0}
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="text-center flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{currentDeal?.dealName}</h3>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{currentDeal?.stage}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{currentDeal?.role}</Badge>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentIndex === totalDeals - 1}
                  onClick={goNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Dots navigation */}
              {totalDeals > 1 && (
                <div className="flex justify-center gap-1.5">
                  {deals.map((d, i) => (
                    <button
                      key={d.dealId}
                      onClick={() => setCurrentIndex(i)}
                      className={cn(
                        'h-2 w-2 rounded-full transition-all',
                        i === currentIndex
                          ? 'bg-primary w-4'
                          : savedDeals.has(d.dealId)
                            ? 'bg-primary/40'
                            : 'bg-muted-foreground/30'
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Hours input */}
              {currentDeal && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Hours this week</label>
                  <div className="flex items-center gap-2">
                    <Input
                      ref={inputRef}
                      type="number"
                      min="0"
                      max="168"
                      step="0.5"
                      placeholder="0"
                      value={localHours[currentDeal.dealId] ?? ''}
                      onChange={(e) => setLocalHours(prev => ({ ...prev, [currentDeal.dealId]: e.target.value }))}
                      className="text-center text-lg font-semibold"
                    />
                    <Button
                      onClick={handleSave}
                      disabled={savingDeal === currentDeal.dealId}
                      size="sm"
                      className="shrink-0"
                    >
                      {savingDeal === currentDeal.dealId ? (
                        <SaveIndicator isSaving={true} size="sm" />
                      ) : showSaveSuccess === currentDeal.dealId ? (
                        <Check className="h-4 w-4" />
                      ) : savedDeals.has(currentDeal.dealId) ? (
                        <>Update</>
                      ) : (
                        <>Save</>
                      )}
                    </Button>
                  </div>
                  {savedDeals.has(currentDeal.dealId) && showSaveSuccess !== currentDeal.dealId && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="h-3 w-3 text-primary" /> Saved
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Complete button */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {isTaskComplete ? 'Completed ✓' : `${savedCount} of ${totalDeals} deals logged`}
              </p>
              {!isTaskComplete && (
                <Button
                  onClick={handleComplete}
                  disabled={completeTask.isPending}
                  size="sm"
                  variant={savedCount === totalDeals ? 'default' : 'outline'}
                >
                  {completeTask.isPending ? (
                    <SaveIndicator isSaving={true} size="sm" />
                  ) : (
                    <>
                      Mark Week Complete
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
