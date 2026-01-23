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
  id: keyof DealCriteria | 'dealSizeRange';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  options: SurveyOption[];
  multiSelect?: boolean;
}

const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'dealSizeRange',
    title: 'What size financing are you looking for?',
    subtitle: 'Select the range that best fits your capital needs',
    icon: <DollarSign className="h-5 w-5" />,
    options: [
      { value: '1M', label: 'Under $1M', description: 'Seed & early stage' },
      { value: '5M', label: '$1M - $5M', description: 'Growth financing' },
      { value: '15M', label: '$5M - $15M', description: 'Expansion capital' },
      { value: '25M', label: '$15M - $25M', description: 'Mid-market deals' },
      { value: '50M', label: '$25M - $50M', description: 'Large transactions' },
      { value: '100M', label: '$50M+', description: 'Enterprise level' },
    ],
  },
  {
    id: 'dealTypes',
    title: 'What type of financing do you need?',
    subtitle: 'You can select multiple options',
    icon: <FileText className="h-5 w-5" />,
    multiSelect: true,
    options: [
      { value: 'ABL', label: 'Asset-Based Lending', description: 'Secured by assets' },
      { value: 'Growth Capital', label: 'Growth Capital', description: 'Equity-like debt' },
      { value: 'Term Loan', label: 'Term Loan', description: 'Fixed repayment' },
      { value: 'Revolver', label: 'Revolver / LOC', description: 'Flexible credit line' },
      { value: 'Revenue-Based', label: 'Revenue-Based', description: 'Based on revenue' },
      { value: 'Mezzanine', label: 'Mezzanine', description: 'Subordinated debt' },
    ],
  },
  {
    id: 'industry',
    title: 'What industry is the company in?',
    subtitle: 'Select the primary industry vertical',
    icon: <Building2 className="h-5 w-5" />,
    options: [
      { value: 'SaaS', label: 'SaaS / Software', description: 'B2B or B2C software' },
      { value: 'Healthcare', label: 'Healthcare', description: 'Medical & health services' },
      { value: 'Fintech', label: 'Fintech', description: 'Financial technology' },
      { value: 'E-commerce', label: 'E-commerce', description: 'Online retail' },
      { value: 'Manufacturing', label: 'Manufacturing', description: 'Industrial & production' },
      { value: 'Services', label: 'Professional Services', description: 'B2B services' },
      { value: 'Technology', label: 'Technology', description: 'General tech' },
      { value: 'Consumer', label: 'Consumer Products', description: 'CPG & retail' },
    ],
  },
  {
    id: 'cashBurnOk',
    title: 'Is the company currently burning cash?',
    subtitle: 'This affects which lenders are a good fit',
    icon: <Flame className="h-5 w-5" />,
    options: [
      { value: 'true', label: 'Yes, burning cash', description: 'Pre-profit / high growth' },
      { value: 'false', label: 'No, cash flow positive', description: 'Profitable or break-even' },
    ],
  },
  {
    id: 'b2bB2c',
    title: 'What is the business model?',
    subtitle: 'Who are the primary customers?',
    icon: <Users className="h-5 w-5" />,
    options: [
      { value: 'B2B', label: 'B2B', description: 'Sells to businesses' },
      { value: 'B2C', label: 'B2C', description: 'Sells to consumers' },
      { value: 'Both', label: 'Both B2B & B2C', description: 'Mixed customer base' },
    ],
  },
  {
    id: 'geo',
    title: 'Where is the company based?',
    subtitle: 'Geographic location affects lender options',
    icon: <MapPin className="h-5 w-5" />,
    options: [
      { value: 'US', label: 'United States', description: 'US-based company' },
      { value: 'Canada', label: 'Canada', description: 'Canadian company' },
      { value: 'UK', label: 'United Kingdom', description: 'UK-based company' },
      { value: 'Europe', label: 'Europe', description: 'EU-based company' },
      { value: 'Global', label: 'Global / Multi-region', description: 'International presence' },
    ],
  },
];

export function LenderCriteriaSurvey({ initialCriteria, onComplete, onSkip }: LenderCriteriaSurveyProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>(() => {
    const initial: Record<string, string | string[] | boolean> = {};
    if (initialCriteria?.capitalAsk) initial.dealSizeRange = initialCriteria.capitalAsk;
    if (initialCriteria?.dealTypes) initial.dealTypes = initialCriteria.dealTypes;
    if (initialCriteria?.industry) initial.industry = initialCriteria.industry;
    if (initialCriteria?.cashBurnOk !== undefined) initial.cashBurnOk = initialCriteria.cashBurnOk;
    if (initialCriteria?.b2bB2c) initial.b2bB2c = initialCriteria.b2bB2c;
    if (initialCriteria?.geo) initial.geo = initialCriteria.geo;
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
      // Handle boolean conversion for cashBurnOk
      const processedValue = question.id === 'cashBurnOk' 
        ? value === 'true'
        : value;
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
      return answer === (value === 'true');
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

    if (answers.dealSizeRange) {
      criteria.capitalAsk = `$${answers.dealSizeRange}`;
      // Also set dealValue for matching
      const valueMap: Record<string, number> = {
        '1M': 500000,
        '5M': 3000000,
        '15M': 10000000,
        '25M': 20000000,
        '50M': 37500000,
        '100M': 75000000,
      };
      criteria.dealValue = valueMap[answers.dealSizeRange as string] || undefined;
    }
    if (answers.dealTypes) criteria.dealTypes = answers.dealTypes as string[];
    if (answers.industry) criteria.industry = answers.industry as string;
    if (typeof answers.cashBurnOk === 'boolean') criteria.cashBurnOk = answers.cashBurnOk;
    if (answers.b2bB2c) criteria.b2bB2c = answers.b2bB2c as string;
    if (answers.geo) criteria.geo = answers.geo as string;

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
            {answers.dealSizeRange && (
              <Badge variant="secondary" className="text-xs">${answers.dealSizeRange as string}</Badge>
            )}
            {(answers.dealTypes as string[])?.map(dt => (
              <Badge key={dt} variant="secondary" className="text-xs">{dt}</Badge>
            ))}
            {answers.industry && (
              <Badge variant="secondary" className="text-xs">{answers.industry as string}</Badge>
            )}
            {typeof answers.cashBurnOk === 'boolean' && (
              <Badge variant="secondary" className="text-xs">
                Cash burn: {answers.cashBurnOk ? 'OK' : 'No'}
              </Badge>
            )}
            {answers.b2bB2c && (
              <Badge variant="secondary" className="text-xs">{answers.b2bB2c as string}</Badge>
            )}
            {answers.geo && (
              <Badge variant="secondary" className="text-xs">{answers.geo as string}</Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
