import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Users, 
  FileText, 
  Settings,
  ChevronRight,
  ChevronLeft,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to 5th Line',
    description: 'Your deal pipeline management platform. Let\'s take a quick tour of the key features.',
    icon: <LayoutDashboard className="h-12 w-12" />,
    features: [
      'Track all your deals in one place',
      'Monitor deal progress and status',
      'Customize your dashboard widgets'
    ]
  },
  {
    title: 'Manage Lenders',
    description: 'Track lender relationships and their progress on each deal.',
    icon: <Users className="h-12 w-12" />,
    features: [
      'Add multiple lenders to each deal',
      'Track lender stages and substages',
      'Monitor quote amounts and terms',
      'View lender activity timeline'
    ]
  },
  {
    title: 'Analytics & Insights',
    description: 'Gain insights into your deal performance with customizable charts.',
    icon: <TrendingUp className="h-12 w-12" />,
    features: [
      'View deals by stage and status',
      'Track lender activity patterns',
      'Analyze deal value distribution',
      'Create custom charts'
    ]
  },
  {
    title: 'Export & Reports',
    description: 'Export your data and generate reports for stakeholders.',
    icon: <FileText className="h-12 w-12" />,
    features: [
      'Export pipeline to CSV, PDF, or Word',
      'Generate deal status reports',
      'Filter exports by date range'
    ]
  },
  {
    title: 'Customize Your Experience',
    description: 'Personalize the app to match your workflow.',
    icon: <Settings className="h-12 w-12" />,
    features: [
      'Configure deal types and stages',
      'Set up lender stages and substages',
      'Customize pass reasons',
      'Adjust display preferences'
    ]
  }
];

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const step = ONBOARDING_STEPS[currentStep];

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-lg p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress indicators */}
        <div className="flex gap-1 px-6 pt-6">
          {ONBOARDING_STEPS.map((_, index) => (
            <div
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                index <= currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-4">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="p-4 rounded-full bg-primary/10 text-primary mb-4">
              {step.icon}
            </div>
            <h2 className="text-2xl font-semibold mb-2">{step.title}</h2>
            <p className="text-muted-foreground">{step.description}</p>
          </div>

          {/* Features list */}
          <div className="space-y-3 mb-8">
            {step.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip tour
            </Button>
            
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button variant="outline" onClick={handlePrevious}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button onClick={handleNext}>
                {isLastStep ? (
                  <>
                    Get Started
                    <CheckCircle2 className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Step counter */}
          <p className="text-center text-xs text-muted-foreground mt-4">
            Step {currentStep + 1} of {ONBOARDING_STEPS.length}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
