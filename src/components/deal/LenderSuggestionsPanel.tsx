import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LenderSuggestionsContent } from './LenderSuggestionsContent';
import { DealCriteria } from '@/hooks/useLenderMatching';
import { useMasterLenders } from '@/hooks/useMasterLenders';
import { useLenderMatching } from '@/hooks/useLenderMatching';

interface LenderSuggestionsPanelProps {
  criteria: DealCriteria;
  existingLenderNames: string[];
  onAddLender: (lenderName: string) => void;
}

export function LenderSuggestionsPanel({
  criteria,
  existingLenderNames,
  onAddLender,
}: LenderSuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { lenders: masterLenders } = useMasterLenders();
  
  const { matches } = useLenderMatching(masterLenders, criteria, {
    minScore: -10,
    maxResults: 100,
    excludeNames: existingLenderNames,
  });
  
  const excellentCount = matches.filter(m => m.score >= 40).length;
  const goodCount = matches.filter(m => m.score >= 20 && m.score < 40).length;
  const totalMatches = matches.filter(m => m.score >= 0).length;
  
  const handleAddLender = (name: string) => {
    onAddLender(name);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
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
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>View AI-powered lender suggestions based on deal criteria</p>
            {totalMatches > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {excellentCount > 0 && `${excellentCount} excellent, `}
                {goodCount > 0 && `${goodCount} good matches`}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <SheetContent side="right" className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
              Suggested Lenders
            </span>
            {totalMatches > 0 && (
              <Badge variant="secondary" className="font-normal">
                {totalMatches} matches
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden -mx-6 px-6">
          <LenderSuggestionsContent
            criteria={criteria}
            existingLenderNames={existingLenderNames}
            onAddLender={handleAddLender}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Floating action button variant for quick access
export function LenderSuggestionsFAB({
  criteria,
  existingLenderNames,
  onAddLender,
}: LenderSuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { lenders: masterLenders } = useMasterLenders();
  
  const { matches } = useLenderMatching(masterLenders, criteria, {
    minScore: 20, // Only count good+ matches for FAB
    maxResults: 100,
    excludeNames: existingLenderNames,
  });
  
  const matchCount = matches.length;

  if (matchCount === 0) return null;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
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
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
              Suggested Lenders
            </span>
            {matchCount > 0 && (
              <Badge variant="secondary" className="font-normal">
                {matchCount} matches
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden -mx-6 px-6">
          <LenderSuggestionsContent
            criteria={criteria}
            existingLenderNames={existingLenderNames}
            onAddLender={onAddLender}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
