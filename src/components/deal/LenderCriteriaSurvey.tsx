import { useState } from 'react';
import { Check, DollarSign, Building2, MapPin, Flame, Users, FileText, ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DealCriteria } from '@/hooks/useLenderMatching';

interface LenderCriteriaSurveyProps {
  initialCriteria?: DealCriteria;
  onComplete: (criteria: DealCriteria) => void;
  onSkip?: () => void;
}

interface SurveyOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SurveyQuestion {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  options: SurveyOption[];
  multiSelect?: boolean;
}

const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'cashBurnOk',
    title: 'Is the company currently burning cash?',
    subtitle: 'This significantly affects which lenders will be interested',
    icon: <Flame className="h-5 w-5" />,
    options: [
      { value: 'true', label: 'Yes, burning cash', description: 'Pre-profit or high-growth phase' },
      { value: 'false', label: 'No, cash flow positive', description: 'Profitable or break-even' },
      { value: 'breakeven', label: 'Near break-even', description: 'Close to profitability' },
    ],
  },
  {
    id: 'b2bB2c',
    title: 'What is the business model?',
    subtitle: 'Some lenders specialize in specific customer types',
    icon: <Users className="h-5 w-5" />,
    options: [
      { value: 'B2B', label: 'B2B', description: 'Sells to businesses' },
      { value: 'B2C', label: 'B2C', description: 'Sells to consumers' },
      { value: 'Both', label: 'Both B2B & B2C', description: 'Mixed customer base' },
    ],
  },
  {
    id: 'revenueRecurring',
    title: 'What type of revenue does the company have?',
    subtitle: 'Revenue model affects lender appetite',
    icon: <DollarSign className="h-5 w-5" />,
    options: [
      { value: 'recurring', label: 'Recurring / Subscription', description: 'SaaS, memberships, etc.' },
      { value: 'transactional', label: 'Transactional', description: 'One-time purchases' },
      { value: 'contractual', label: 'Contractual', description: 'Long-term contracts' },
      { value: 'mixed', label: 'Mixed', description: 'Combination of models' },
    ],
  },
  {
    id: 'collateralAvailable',
    title: 'Does the company have hard assets for collateral?',
    subtitle: 'Asset-based lenders require collateral',
    icon: <Building2 className="h-5 w-5" />,
    options: [
      { value: 'yes', label: 'Yes, significant assets', description: 'Real estate, equipment, inventory' },
      { value: 'ar', label: 'Accounts receivable only', description: 'AR as primary collateral' },
      { value: 'minimal', label: 'Minimal hard assets', description: 'Mostly software/IP' },
      { value: 'none', label: 'No collateral available', description: 'Cash flow based only' },
    ],
  },
];

export function LenderCriteriaSurvey({ initialCriteria, onComplete, onSkip }: LenderCriteriaSurveyProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>(() => {
    const initial: Record<string, string | string[] | boolean> = {};
    if (initialCriteria?.cashBurnOk !== undefined) initial.cashBurnOk = initialCriteria.cashBurnOk;
    if (initialCriteria?.b2bB2c) initial.b2bB2c = initialCriteria.b2bB2c;
    return initial;
  });

  const currentQuestion = SURVEY_QUESTIONS[currentStep];
  const isLastStep = currentStep === SURVEY_QUESTIONS.length - 1;
  const answeredCount = Object.keys(answers).length;
  const progress = (currentStep / SURVEY_QUESTIONS.length) * 100;

  const handleSelectOption = (value: string) => {
    const question = currentQuestion;
    
    if (question.multiSelect) {
      const currentValues = (answers[question.id] as string[]) || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      setAnswers(prev => ({ ...prev, [question.id]: newValues }));
    } else {
      // Handle special processing for cashBurnOk (true/false/breakeven)
      let processedValue: string | boolean = value;
      if (question.id === 'cashBurnOk') {
        if (value === 'true') processedValue = true;
        else if (value === 'false') processedValue = false;
        // 'breakeven' stays as string, treated as false for matching
      }
      setAnswers(prev => ({ ...prev, [question.id]: processedValue }));
      
      // Auto-advance for single-select questions
      if (!isLastStep) {
        setTimeout(() => setCurrentStep(prev => prev + 1), 300);
      }
    }
  };

  const isOptionSelected = (value: string): boolean => {
    const answer = answers[currentQuestion.id];
    if (currentQuestion.multiSelect) {
      return ((answer as string[]) || []).includes(value);
    }
    if (currentQuestion.id === 'cashBurnOk') {
      if (value === 'true') return answer === true;
      if (value === 'false') return answer === false;
      return answer === value; // for 'breakeven'
    }
    return answer === value;
  };

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    const criteria: DealCriteria = {
      ...initialCriteria,
    };

    // Only set survey-specific fields that aren't already in deal info
    // Handle cashBurnOk - 'breakeven' is treated as false (not burning)
    if (typeof answers.cashBurnOk === 'boolean') {
      criteria.cashBurnOk = answers.cashBurnOk;
    } else if (answers.cashBurnOk === 'breakeven') {
      criteria.cashBurnOk = false;
    }
    
    if (answers.b2bB2c) criteria.b2bB2c = answers.b2bB2c as string;
    
    // Store additional survey data in companyRequirements for matching context
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
    setCurrentStep(0);
  };

  const canProceed = currentQuestion.multiSelect 
    ? ((answers[currentQuestion.id] as string[])?.length || 0) > 0
    : answers[currentQuestion.id] !== undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            Question {currentStep + 1} of {SURVEY_QUESTIONS.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {answeredCount} answered
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {currentQuestion.icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{currentQuestion.title}</h3>
            <p className="text-sm text-muted-foreground">{currentQuestion.subtitle}</p>
          </div>
        </div>

        {/* Options Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6 flex-1">
          {currentQuestion.options.map((option) => {
            const selected = isOptionSelected(option.value);
            return (
              <button
                key={option.value}
                onClick={() => handleSelectOption(option.value)}
                className={cn(
                  "relative flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 text-left",
                  "hover:border-primary/50 hover:bg-primary/5",
                  selected 
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20" 
                    : "border-border bg-card"
                )}
              >
                {selected && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <span className="font-medium text-sm">{option.label}</span>
                {option.description && (
                  <span className="text-xs text-muted-foreground mt-1">{option.description}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 mt-4 border-t">
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <Button variant="ghost" size="sm" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {onSkip && (
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip Survey
            </Button>
          )}
          {currentQuestion.multiSelect && (
            <Button 
              onClick={handleNext}
              disabled={!canProceed}
              size="sm"
            >
              {isLastStep ? 'See Matches' : 'Next'}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {isLastStep && !currentQuestion.multiSelect && (
            <Button 
              onClick={handleComplete}
              disabled={answeredCount === 0}
              size="sm"
            >
              See Matches
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Quick Summary */}
      {answeredCount > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Your selections:</p>
          <div className="flex flex-wrap gap-1.5">
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
