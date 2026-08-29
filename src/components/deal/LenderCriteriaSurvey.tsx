import { useState, useCallback, useEffect, useMemo } from 'react';
import { getIndustryOptions, useIndustryOptionsList } from '@/lib/industryOptions';
import { Check, Flame, Building2, ArrowRight, RotateCcw, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DealCriteria } from '@/hooks/useLenderMatching';
import { useDealMatchingCriteria, DealMatchingCriteria } from '@/hooks/useDealMatchingCriteria';
import { useMasterLenders } from '@/hooks/useMasterLenders';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LenderCriteriaSurveyProps {
  dealId?: string;
  initialCriteria?: DealCriteria;
  onComplete: (criteria: DealCriteria) => void;
  onSkip?: () => void;
}

interface SurveyOption {
  value: string;
  label: string;
  description?: string;
}

interface SurveyQuestion {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  options?: SurveyOption[];
  type?: 'options' | 'dropdown';
}

const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'cashBurnOk',
    title: 'Cash Burn Status',
    subtitle: 'Is the company currently burning cash?',
    icon: <Flame className="h-6 w-6" />,
    type: 'options',
    options: [
      { value: 'true', label: 'Yes, burning cash', description: 'Pre-profit or high-growth phase' },
      { value: 'false', label: 'No, cash flow positive', description: 'Profitable or break-even' },
    ],
  },
  {
    id: 'industry',
    title: 'Industry',
    subtitle: 'What industry is the company in?',
    icon: <Building2 className="h-6 w-6" />,
    type: 'dropdown',
  },
  {
    id: 'sponsorship',
    title: 'Sponsor-backed',
    subtitle: 'Is the company backed by a private equity or venture capital sponsor?',
    icon: <Users className="h-6 w-6" />,
    type: 'options',
    options: [
      { value: 'Yes', label: 'Yes, sponsor-backed', description: 'PE or VC backed company' },
      { value: 'No', label: 'No, not sponsor-backed', description: 'Founder-owned or independent' },
    ],
  },
];

export function LenderCriteriaSurvey({ dealId, initialCriteria, onComplete, onSkip }: LenderCriteriaSurveyProps) {
  const { criteria: savedCriteria, isLoading: isLoadingCriteria, isSaving, saveCriteria } = useDealMatchingCriteria(dealId);
  const { lenders: masterLenders } = useMasterLenders();
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});

  // Fixed industry options
  const industryOptions = useIndustryOptionsList();

  // Initialize answers from saved criteria when loaded
  useEffect(() => {
    if (!isLoadingCriteria && savedCriteria) {
      const initial: Record<string, string | boolean> = {};
      if (savedCriteria.cashBurnOk !== undefined) initial.cashBurnOk = savedCriteria.cashBurnOk;
      if (savedCriteria.industry) initial.industry = savedCriteria.industry;
      if (savedCriteria.sponsorship) initial.sponsorship = savedCriteria.sponsorship;
      setAnswers(initial);
    }
  }, [savedCriteria, isLoadingCriteria]);

  const answeredCount = Object.keys(answers).length;
  const isLastSlide = currentIndex === SURVEY_QUESTIONS.length - 1;

  const onSelect = useCallback(() => {
    if (!api) return;
    setCurrentIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api, onSelect]);

  const handleSelectOption = (questionId: string, value: string) => {
    let processedValue: string | boolean = value;
    if (questionId === 'cashBurnOk') {
      if (value === 'true') processedValue = true;
      else if (value === 'false') processedValue = false;
    }
    const updatedAnswers = { ...answers, [questionId]: processedValue };
    setAnswers(updatedAnswers);

    // Auto-save criteria to database
    if (dealId) {
      const matchingCriteria: DealMatchingCriteria = {};
      if (typeof updatedAnswers.cashBurnOk === 'boolean') {
        matchingCriteria.cashBurnOk = updatedAnswers.cashBurnOk;
      }
      if (updatedAnswers.industry) matchingCriteria.industry = updatedAnswers.industry as string;
      if (updatedAnswers.sponsorship) matchingCriteria.sponsorship = updatedAnswers.sponsorship as string;
      saveCriteria(matchingCriteria);
    }

    // Auto-advance to next slide after selection
    setTimeout(() => {
      if (api && currentIndex < SURVEY_QUESTIONS.length - 1) {
        api.scrollNext();
      }
    }, 300);
  };

  const isOptionSelected = (questionId: string, value: string): boolean => {
    const answer = answers[questionId];
    if (questionId === 'cashBurnOk') {
      if (value === 'true') return answer === true;
      if (value === 'false') return answer === false;
      return answer === value;
    }
    return answer === value;
  };

  const handleComplete = async () => {
    // Build matching criteria for database
    const matchingCriteria: DealMatchingCriteria = {};
    
    if (typeof answers.cashBurnOk === 'boolean') {
      matchingCriteria.cashBurnOk = answers.cashBurnOk;
    }
    
    if (answers.industry) matchingCriteria.industry = answers.industry as string;
    if (answers.sponsorship) matchingCriteria.sponsorship = answers.sponsorship as string;

    // Save to database if we have a dealId
    if (dealId) {
      await saveCriteria(matchingCriteria);
    }

    // Build DealCriteria for matching
    const criteria: DealCriteria = { ...initialCriteria };

    if (matchingCriteria.cashBurnOk !== undefined) {
      criteria.cashBurnOk = matchingCriteria.cashBurnOk;
    }
    if (matchingCriteria.industry) {
      criteria.industry = matchingCriteria.industry;
    }
    if (matchingCriteria.sponsorship) {
      criteria.sponsorship = matchingCriteria.sponsorship;
    }

    onComplete(criteria);
  };

  const handleReset = () => {
    setAnswers({});
    api?.scrollTo(0);
  };

  if (isLoadingCriteria) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress indicators */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {SURVEY_QUESTIONS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => api?.scrollTo(idx)}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              idx === currentIndex 
                ? "w-8 bg-primary" 
                : answers[SURVEY_QUESTIONS[idx].id] !== undefined
                  ? "w-2 bg-primary/60"
                  : "w-2 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      {/* Carousel */}
      <div className="flex-1 px-12">
        <Carousel
          setApi={setApi}
          opts={{ align: 'center', loop: false }}
          className="w-full"
        >
          <CarouselContent>
            {SURVEY_QUESTIONS.map((question) => (
              <CarouselItem key={question.id}>
                <div className="flex flex-col items-center text-center p-4">
                  {/* Question header */}
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                    {question.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-1">{question.title}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{question.subtitle}</p>

                  {/* Dropdown for industry */}
                  {question.type === 'dropdown' && question.id === 'industry' && (
                    <div className="w-full max-w-sm">
                      <Select
                        value={answers.industry as string || ''}
                        onValueChange={(value) => handleSelectOption('industry', value)}
                      >
                        <SelectTrigger className="w-full h-12 text-left">
                          <SelectValue placeholder="Select an industry..." />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border">
                          <ScrollArea className="h-[300px]">
                            {industryOptions.map((industry) => (
                              <SelectItem key={industry} value={industry}>
                                {industry}
                              </SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                      {answers.industry && (
                        <p className="text-sm text-primary mt-3 flex items-center justify-center gap-2">
                          <Check className="h-4 w-4" />
                          Selected: {answers.industry as string}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Stacked options for regular questions */}
                  {question.type === 'options' && question.options && (
                    <div className="w-full max-w-sm space-y-3">
                      {question.options.map((option) => {
                        const selected = isOptionSelected(question.id, option.value);
                        return (
                          <button
                            key={option.value}
                            onClick={() => handleSelectOption(question.id, option.value)}
                            className={cn(
                              "w-full relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left",
                              "hover:border-primary/50 hover:bg-primary/5",
                              selected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                                : "border-border bg-card"
                            )}
                          >
                            <div className={cn(
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                              selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                            )}>
                              {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm block">{option.label}</span>
                              {option.description && (
                                <span className="text-xs text-muted-foreground">{option.description}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-0" />
          <CarouselNext className="right-0" />
        </Carousel>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
          {onSkip && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {answeredCount} of {SURVEY_QUESTIONS.length} answered
          </span>
          <Button
            onClick={handleComplete}
            disabled={answeredCount === 0 || isSaving}
            size="sm"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            See Matches
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Quick Summary */}
      {answeredCount > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {typeof answers.cashBurnOk === 'boolean' && (
              <Badge variant="secondary" className="text-xs">
                Cash burn: {answers.cashBurnOk ? 'OK' : 'No'}
              </Badge>
            )}
            {answers.cashBurnOk === 'breakeven' && (
              <Badge variant="secondary" className="text-xs">Near break-even</Badge>
            )}
            {answers.b2bB2c && (
              <Badge variant="secondary" className="text-xs">{answers.b2bB2c as string}</Badge>
            )}
            {answers.revenueType && (
              <Badge variant="secondary" className="text-xs">
                Revenue: {answers.revenueType as string}
              </Badge>
            )}
            {answers.collateralAvailable && (
              <Badge variant="secondary" className="text-xs">
                Collateral: {answers.collateralAvailable as string}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
