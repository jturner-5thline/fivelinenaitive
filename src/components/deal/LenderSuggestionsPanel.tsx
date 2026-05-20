import { useState, useMemo } from 'react';
import { ClipboardList, ArrowLeft, AlertCircle } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LenderSuggestionsContent } from './LenderSuggestionsContent';
import { LenderCriteriaSurvey } from './LenderCriteriaSurvey';
import { DealCriteria } from '@/hooks/useLenderMatching';
import { useDealEnrichedCriteria } from '@/hooks/useDealEnrichedCriteria';
import { useMasterLenders } from '@/hooks/useMasterLenders';
import { useLenderMatching } from '@/hooks/useLenderMatching';
import { useDealMatchingCriteria } from '@/hooks/useDealMatchingCriteria';

function getMissingCriteria(criteria: DealCriteria): string[] {
  const missing: string[] = [];
  if (!criteria.dealValue && !criteria.capitalAsk) missing.push('Deal Size');
  if (!criteria.dealTypes || criteria.dealTypes.length === 0) missing.push('Deal Type');
  if (criteria.cashBurnOk === undefined) missing.push('Cash-burn OK');
  if (!criteria.industry) missing.push('Industry');
  if (!criteria.sponsorship) missing.push('Sponsorship');
  return missing;
}

interface LenderSuggestionsPanelProps {
  dealId?: string;
  criteria: DealCriteria;
  existingLenderNames: string[];
  onAddLender: (lenderName: string) => void;
  onAddMultipleLenders?: (lenderNames: string[]) => void;
  onNavigateToCriteria?: () => void;
}

export function LenderSuggestionsPanel({
  dealId,
  criteria: initialCriteria,
  existingLenderNames,
  onAddLender,
  onAddMultipleLenders,
  onNavigateToCriteria,
}: LenderSuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);

  // Use enriched criteria when dialog is open
  const { criteria: enrichedCriteria, autoDetected, refetch: refetchEnriched } = useDealEnrichedCriteria(dealId);
  const { criteria: savedCriteria, refetch: refetchCriteria } = useDealMatchingCriteria(dealId);

  // Merge: enriched takes all data, but manual saved criteria overrides
  const finalCriteria = useMemo<DealCriteria>(() => ({
    ...enrichedCriteria,
    ...initialCriteria,
    // Saved/manual criteria wins over everything
    cashBurnOk: savedCriteria.cashBurnOk ?? enrichedCriteria.cashBurnOk ?? initialCriteria.cashBurnOk,
    industry: savedCriteria.industry || enrichedCriteria.industry || initialCriteria.industry,
    sponsorship: savedCriteria.sponsorship || enrichedCriteria.sponsorship || initialCriteria.sponsorship,
    // Keep enriched rich-text fields
    companyDescription: enrichedCriteria.companyDescription,
    dealNotes: enrichedCriteria.dealNotes,
    existingLenderFeedback: enrichedCriteria.existingLenderFeedback,
    revenue: enrichedCriteria.revenue || initialCriteria.revenue,
  }), [initialCriteria, enrichedCriteria, savedCriteria]);

  const { lenders: masterLenders } = useMasterLenders();
  const { matches } = useLenderMatching(masterLenders, finalCriteria, {
    minScore: 30,
    maxResults: 100,
    excludeNames: existingLenderNames,
  });

  const topCount = matches.filter(m => m.tier === 'top').length;
  const strongCount = matches.filter(m => m.tier === 'strong').length;
  const totalMatches = matches.length;
  const missingCriteria = useMemo(() => getMissingCriteria(finalCriteria), [finalCriteria]);
  const hasMissingCriteria = missingCriteria.length > 0;

  const handleSurveyComplete = (_criteria: DealCriteria) => {
    refetchCriteria();
    refetchEnriched();
    setShowSurvey(false);
  };

  const handleAddMultipleLenders = (names: string[]) => {
    if (onAddMultipleLenders) onAddMultipleLenders(names);
    else names.forEach(name => onAddLender(name));
  };

  const hasNoLenders = existingLenderNames.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              {hasNoLenders ? (
                <Button
                  variant="default"
                  size="default"
                  className="gap-2 bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-primary-foreground shadow-md"
                >
                  <Sparkles className="h-4 w-4" />
                  Suggested Funding Sources
                  {totalMatches > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal bg-background/20 text-primary-foreground border-0">
                      {totalMatches}
                    </Badge>
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-primary/30 hover:border-primary/50 hover:bg-primary/5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </Button>
              )}
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>View lender suggestions based on deal criteria</p>
            {totalMatches > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {topCount > 0 && `${topCount} top, `}
                {strongCount > 0 && `${strongCount} strong matches`}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showSurvey && (
                <Button variant="ghost" size="icon" className="h-8 w-8 mr-1" onClick={() => setShowSurvey(false)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">
                {showSurvey ? 'Refine Your Search' : 'Suggested Funding Sources'}
              </span>
              {!showSurvey && totalMatches > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {totalMatches} matches
                </Badge>
              )}
            </div>
            {!showSurvey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={hasMissingCriteria ? "destructive" : "default"}
                      size="sm"
                      onClick={() => setShowSurvey(true)}
                      className={hasMissingCriteria
                        ? "gap-1.5 border-l-4 border-l-red-400"
                        : "gap-1.5 bg-primary/90 hover:bg-primary"
                      }
                    >
                      {hasMissingCriteria ? (
                        <AlertCircle className="h-3.5 w-3.5 animate-bounce [animation-iteration-count:3] [animation-duration:0.4s]" />
                      ) : (
                        <ClipboardList className="h-3.5 w-3.5" />
                      )}
                      {hasMissingCriteria
                        ? `Complete Criteria (${missingCriteria.length} missing)`
                        : 'Refine Criteria'
                      }
                    </Button>
                  </TooltipTrigger>
                  {hasMissingCriteria && (
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-medium">Missing criteria for accurate matching:</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        {missingCriteria.map(c => <li key={c}>• {c}</li>)}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6">
          {showSurvey ? (
            <div className="py-4 h-full">
              <LenderCriteriaSurvey
                dealId={dealId}
                initialCriteria={finalCriteria}
                onComplete={handleSurveyComplete}
                onSkip={() => setShowSurvey(false)}
              />
            </div>
          ) : (
            <LenderSuggestionsContent
              criteria={finalCriteria}
              existingLenderNames={existingLenderNames}
              onAddLender={onAddLender}
              onAddMultipleLenders={handleAddMultipleLenders}
              onClose={() => setIsOpen(false)}
              onNavigateToCriteria={onNavigateToCriteria}
              autoDetected={autoDetected}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// FAB variant
export function LenderSuggestionsFAB({
  dealId,
  criteria,
  existingLenderNames,
  onAddLender,
  onAddMultipleLenders,
}: LenderSuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const { criteria: enrichedCriteria, autoDetected, refetch: refetchEnriched } = useDealEnrichedCriteria(dealId);
  const { criteria: savedCriteriaFAB, refetch: refetchCriteriaFAB } = useDealMatchingCriteria(dealId);
  const { lenders: masterLenders } = useMasterLenders();

  const finalCriteria = useMemo<DealCriteria>(() => ({
    ...enrichedCriteria,
    ...criteria,
    cashBurnOk: savedCriteriaFAB.cashBurnOk ?? enrichedCriteria.cashBurnOk ?? criteria.cashBurnOk,
    industry: savedCriteriaFAB.industry || enrichedCriteria.industry || criteria.industry,
    sponsorship: savedCriteriaFAB.sponsorship || enrichedCriteria.sponsorship || criteria.sponsorship,
    companyDescription: enrichedCriteria.companyDescription,
    dealNotes: enrichedCriteria.dealNotes,
    existingLenderFeedback: enrichedCriteria.existingLenderFeedback,
    revenue: enrichedCriteria.revenue || criteria.revenue,
  }), [criteria, enrichedCriteria, savedCriteriaFAB]);

  const { matches } = useLenderMatching(masterLenders, finalCriteria, {
    minScore: 30,
    maxResults: 100,
    excludeNames: existingLenderNames,
  });

  const matchCount = matches.length;
  const missingCriteriaFAB = useMemo(() => getMissingCriteria(finalCriteria), [finalCriteria]);
  const hasMissingCriteriaFAB = missingCriteriaFAB.length > 0;

  if (matchCount === 0) return null;

  const handleAddMultipleLenders = (names: string[]) => {
    if (onAddMultipleLenders) onAddMultipleLenders(names);
    else names.forEach(name => onAddLender(name));
  };

  const handleSurveyComplete = () => {
    refetchCriteriaFAB();
    refetchEnriched();
    setShowSurvey(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 bg-primary hover:bg-primary/90">
          <Sparkles className="h-6 w-6" />
          {matchCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
              {matchCount > 99 ? '99+' : matchCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {showSurvey && (
                <Button variant="ghost" size="icon" className="h-8 w-8 mr-1" onClick={() => setShowSurvey(false)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">
                {showSurvey ? 'Refine Your Search' : 'Suggested Funding Sources'}
              </span>
              {!showSurvey && matchCount > 0 && (
                <Badge variant="secondary" className="font-normal">{matchCount} matches</Badge>
              )}
            </div>
            {!showSurvey && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={hasMissingCriteriaFAB ? "destructive" : "default"}
                      size="sm"
                      onClick={() => setShowSurvey(true)}
                      className={hasMissingCriteriaFAB ? "gap-1.5 border-l-4 border-l-red-400" : "gap-1.5 bg-primary/90 hover:bg-primary"}
                    >
                      {hasMissingCriteriaFAB ? <AlertCircle className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
                      {hasMissingCriteriaFAB ? `Complete Criteria (${missingCriteriaFAB.length} missing)` : 'Refine Criteria'}
                    </Button>
                  </TooltipTrigger>
                  {hasMissingCriteriaFAB && (
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-medium">Missing criteria:</p>
                      <ul className="text-xs mt-1 space-y-0.5">
                        {missingCriteriaFAB.map(c => <li key={c}>• {c}</li>)}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden px-6">
          {showSurvey ? (
            <div className="py-4 h-full">
              <LenderCriteriaSurvey dealId={dealId} initialCriteria={finalCriteria} onComplete={handleSurveyComplete} onSkip={() => setShowSurvey(false)} />
            </div>
          ) : (
            <LenderSuggestionsContent
              criteria={finalCriteria}
              existingLenderNames={existingLenderNames}
              onAddLender={onAddLender}
              onAddMultipleLenders={handleAddMultipleLenders}
              onClose={() => setIsOpen(false)}
              autoDetected={autoDetected}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
