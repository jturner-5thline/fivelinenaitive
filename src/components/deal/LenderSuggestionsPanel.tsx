import { useState, useEffect } from 'react';
import { Sparkles, ClipboardList, ArrowLeft } from 'lucide-react';
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
import { useMasterLenders } from '@/hooks/useMasterLenders';
import { useLenderMatching } from '@/hooks/useLenderMatching';

interface LenderSuggestionsPanelProps {
  criteria: DealCriteria;
  existingLenderNames: string[];
  onAddLender: (lenderName: string) => void;
  onAddMultipleLenders?: (lenderNames: string[]) => void;
}

export function LenderSuggestionsPanel({
  criteria: initialCriteria,
  existingLenderNames,
  onAddLender,
  onAddMultipleLenders,
}: LenderSuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [enhancedCriteria, setEnhancedCriteria] = useState<DealCriteria>(initialCriteria);
  const { lenders: masterLenders } = useMasterLenders();
  
  // Reset to initial criteria when dialog opens
  useEffect(() => {
    if (isOpen) {
      setEnhancedCriteria(initialCriteria);
    }
  }, [isOpen, initialCriteria]);
  
  const { matches } = useLenderMatching(masterLenders, enhancedCriteria, {
    minScore: -10,
    maxResults: 100,
    excludeNames: existingLenderNames,
  });
  
  const excellentCount = matches.filter(m => m.score >= 50).length;
  const goodCount = matches.filter(m => m.score >= 25 && m.score < 50).length;
  const totalMatches = matches.filter(m => m.score >= 0).length;
  
  const handleAddLender = (name: string) => {
    onAddLender(name);
  };

  const handleAddMultipleLenders = (names: string[]) => {
    if (onAddMultipleLenders) {
      onAddMultipleLenders(names);
    } else {
      names.forEach(name => onAddLender(name));
    }
  };

  const handleSurveyComplete = (criteria: DealCriteria) => {
    setEnhancedCriteria(criteria);
    setShowSurvey(false);
  };

  const handleOpenSurvey = () => {
    setShowSurvey(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-primary/30 hover:border-primary/50 hover:bg-primary/5"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Suggestions</span>
                {totalMatches > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                    {totalMatches}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>View lender suggestions based on deal criteria</p>
            {totalMatches > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {excellentCount > 0 && `${excellentCount} excellent, `}
                {goodCount > 0 && `${goodCount} good matches`}
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
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 mr-1"
                  onClick={() => setShowSurvey(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                {showSurvey ? 'Refine Your Search' : 'Suggested Lenders'}
              </span>
              {!showSurvey && totalMatches > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {totalMatches} matches
                </Badge>
              )}
            </div>
            {!showSurvey && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSurvey}
                className="gap-1.5"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Refine Criteria
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6">
          {showSurvey ? (
            <div className="py-4 h-full">
              <LenderCriteriaSurvey
                initialCriteria={enhancedCriteria}
                onComplete={handleSurveyComplete}
                onSkip={() => setShowSurvey(false)}
              />
            </div>
          ) : (
            <LenderSuggestionsContent
              criteria={enhancedCriteria}
              existingLenderNames={existingLenderNames}
              onAddLender={handleAddLender}
              onAddMultipleLenders={handleAddMultipleLenders}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Floating action button variant for quick access
export function LenderSuggestionsFAB({
  criteria,
  existingLenderNames,
  onAddLender,
  onAddMultipleLenders,
}: LenderSuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [enhancedCriteria, setEnhancedCriteria] = useState<DealCriteria>(criteria);
  const { lenders: masterLenders } = useMasterLenders();
  
  useEffect(() => {
    if (isOpen) {
      setEnhancedCriteria(criteria);
    }
  }, [isOpen, criteria]);
  
  const { matches } = useLenderMatching(masterLenders, enhancedCriteria, {
    minScore: 25,
    maxResults: 100,
    excludeNames: existingLenderNames,
  });
  
  const matchCount = matches.length;

  if (matchCount === 0) return null;

  const handleAddMultipleLenders = (names: string[]) => {
    if (onAddMultipleLenders) {
      onAddMultipleLenders(names);
    } else {
      names.forEach(name => onAddLender(name));
    }
  };

  const handleSurveyComplete = (newCriteria: DealCriteria) => {
    setEnhancedCriteria(newCriteria);
    setShowSurvey(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 bg-primary hover:bg-primary/90"
        >
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
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 mr-1"
                  onClick={() => setShowSurvey(false)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                {showSurvey ? 'Refine Your Search' : 'Suggested Lenders'}
              </span>
              {!showSurvey && matchCount > 0 && (
                <Badge variant="secondary" className="font-normal">
                  {matchCount} matches
                </Badge>
              )}
            </div>
            {!showSurvey && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSurvey(true)}
                className="gap-1.5"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Refine Criteria
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6">
          {showSurvey ? (
            <div className="py-4 h-full">
              <LenderCriteriaSurvey
                initialCriteria={enhancedCriteria}
                onComplete={handleSurveyComplete}
                onSkip={() => setShowSurvey(false)}
              />
            </div>
          ) : (
            <LenderSuggestionsContent
              criteria={enhancedCriteria}
              existingLenderNames={existingLenderNames}
              onAddLender={onAddLender}
              onAddMultipleLenders={handleAddMultipleLenders}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
