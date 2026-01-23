import { useState, useCallback } from 'react';
import { Check, Flame, Users, DollarSign, Building2, ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DealCriteria } from '@/hooks/useLenderMatching';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';

interface LenderCriteriaSurveyProps {
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
  options: SurveyOption[];
}

const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'cashBurnOk',
    title: 'Cash Burn Status',
    subtitle: 'Is the company currently burning cash?',
    icon: <Flame className="h-6 w-6" />,
    options: [
      { value: 'true', label: 'Yes, burning cash', description: 'Pre-profit or high-growth phase' },
      { value: 'false', label: 'No, cash flow positive', description: 'Profitable or break-even' },
      { value: 'breakeven', label: 'Near break-even', description: 'Close to profitability' },
    ],
  },
  {
    id: 'b2bB2c',
    title: 'Business Model',
    subtitle: 'What type of customers does the company serve?',
    icon: <Users className="h-6 w-6" />,
    options: [
      { value: 'B2B', label: 'B2B', description: 'Sells to businesses' },
      { value: 'B2C', label: 'B2C', description: 'Sells to consumers' },
      { value: 'Both', label: 'Both B2B & B2C', description: 'Mixed customer base' },
    ],
  },
  {
    id: 'revenueRecurring',
    title: 'Revenue Type',
    subtitle: 'What type of revenue does the company have?',
    icon: <DollarSign className="h-6 w-6" />,
    options: [
      { value: 'recurring', label: 'Recurring / Subscription', description: 'SaaS, memberships, etc.' },
      { value: 'transactional', label: 'Transactional', description: 'One-time purchases' },
      { value: 'contractual', label: 'Contractual', description: 'Long-term contracts' },
      { value: 'mixed', label: 'Mixed', description: 'Combination of models' },
    ],
  },
  {
    id: 'collateralAvailable',
    title: 'Collateral',
    subtitle: 'Does the company have hard assets for collateral?',
    icon: <Building2 className="h-6 w-6" />,
    options: [
      { value: 'yes', label: 'Yes, significant assets', description: 'Real estate, equipment, inventory' },
      { value: 'ar', label: 'Accounts receivable only', description: 'AR as primary collateral' },
      { value: 'minimal', label: 'Minimal hard assets', description: 'Mostly software/IP' },
      { value: 'none', label: 'No collateral available', description: 'Cash flow based only' },
    ],
  },
];

export function LenderCriteriaSurvey({ initialCriteria, onComplete, onSkip }: LenderCriteriaSurveyProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    if (initialCriteria?.cashBurnOk !== undefined) initial.cashBurnOk = initialCriteria.cashBurnOk;
    if (initialCriteria?.b2bB2c) initial.b2bB2c = initialCriteria.b2bB2c;
    return initial;
  });

  const answeredCount = Object.keys(answers).length;
  const isLastSlide = currentIndex === SURVEY_QUESTIONS.length - 1;

  const onSelect = useCallback(() => {
    if (!api) return;
    setCurrentIndex(api.selectedScrollSnap());
  }, [api]);

  useState(() => {
    if (!api) return;
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  });

  const handleSelectOption = (questionId: string, value: string) => {
    let processedValue: string | boolean = value;
    if (questionId === 'cashBurnOk') {
      if (value === 'true') processedValue = true;
      else if (value === 'false') processedValue = false;
    }
    setAnswers(prev => ({ ...prev, [questionId]: processedValue }));

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

  const handleComplete = () => {
    const criteria: DealCriteria = { ...initialCriteria };

    if (typeof answers.cashBurnOk === 'boolean') {
      criteria.cashBurnOk = answers.cashBurnOk;
    } else if (answers.cashBurnOk === 'breakeven') {
      criteria.cashBurnOk = false;
    }

    if (answers.b2bB2c) criteria.b2bB2c = answers.b2bB2c as string;

    const additionalContext: string[] = [];
    if (answers.revenueRecurring) additionalContext.push(`Revenue: ${answers.revenueRecurring}`);
    if (answers.collateralAvailable) additionalContext.push(`Collateral: ${answers.collateralAvailable}`);

    if (additionalContext.length > 0) {
      criteria.companyRequirements = [
        initialCriteria?.companyRequirements,
        ...additionalContext
      ].filter(Boolean).join('; ');
    }

    onComplete(criteria);
  };

  const handleReset = () => {
    setAnswers({});
    api?.scrollTo(0);
  };

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

                  {/* Stacked options */}
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
            disabled={answeredCount === 0}
            size="sm"
          >
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
            {answers.revenueRecurring && (
              <Badge variant="secondary" className="text-xs">
                Revenue: {answers.revenueRecurring as string}
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
