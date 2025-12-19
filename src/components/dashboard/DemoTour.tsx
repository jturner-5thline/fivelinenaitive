import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, LayoutDashboard, BarChart3, Settings2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const demoTourSteps: TourStep[] = [
  {
    title: 'Welcome to the Demo!',
    description: 'This quick tour will show you the key features. You can explore freely with sample data—nothing you do here affects real accounts.',
    icon: <Sparkles className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Pipeline Dashboard',
    description: 'View all your deals at a glance. Use filters to find specific deals, group by status, and export your data in multiple formats.',
    icon: <LayoutDashboard className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Analytics & Insights',
    description: 'Track performance with customizable widgets and charts. Save different configurations as presets for quick access.',
    icon: <BarChart3 className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Create New Deals',
    description: 'Click the "New Deal" button in the header to create deals. Each deal has its own detail page where you can manage lenders and track progress.',
    icon: <Plus className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Customize Your Setup',
    description: 'Use Settings to manage lender stages, deal types, and pass reasons. Preferences let you customize your dashboard experience.',
    icon: <Settings2 className="h-8 w-8 text-primary" />,
  },
];

const newUserTourSteps: TourStep[] = [
  {
    title: 'Welcome to nAItive!',
    description: "You're all set up! Let's take a quick tour of the key features to help you get started with managing your deals.",
    icon: <Sparkles className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Your Pipeline Dashboard',
    description: 'This is your home base. View all deals, filter by status or type, and export data to CSV, PDF, or Word anytime.',
    icon: <LayoutDashboard className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Track Your Performance',
    description: 'Head to Analytics to see customizable charts and metrics. Create widget presets to quickly switch between different views.',
    icon: <BarChart3 className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Create Your First Deal',
    description: 'Ready to add a deal? Click "New Deal" in the header. You can track lenders, quotes, and progress all in one place.',
    icon: <Plus className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Make It Yours',
    description: 'Visit Settings to configure lender stages, deal types, and more. Use Preferences to personalize your dashboard layout and currency format.',
    icon: <Settings2 className="h-8 w-8 text-primary" />,
  },
];

export function DemoTour() {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const checkTourEligibility = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user just completed onboarding
      const justCompletedOnboarding = sessionStorage.getItem('just-completed-onboarding');
      const isDemo = user.email === 'demo@example.com';
      setIsDemoUser(isDemo);
      
      if (justCompletedOnboarding || isDemo) {
        setShouldShowTour(true);
        const tourCompleted = localStorage.getItem('tour-completed');
        if (!tourCompleted) {
          // Small delay to let the page render first
          setTimeout(() => setShowTour(true), 500);
        }
        // Clear the onboarding flag after checking
        sessionStorage.removeItem('just-completed-onboarding');
      }
    };
    checkTourEligibility();

    // Listen for restart tour event
    const handleRestartTour = () => {
      setCurrentStep(0);
      setShowTour(true);
    };
    window.addEventListener('restart-demo-tour', handleRestartTour);
    return () => window.removeEventListener('restart-demo-tour', handleRestartTour);
  }, []);

  const tourSteps = isDemoUser ? demoTourSteps : newUserTourSteps;

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTour = () => {
    localStorage.setItem('tour-completed', 'true');
    setShowTour(false);
  };

  const handleSkip = () => {
    completeTour();
  };

  if (!shouldShowTour) {
    return null;
  }

  const step = tourSteps[currentStep];
  const isLastStep = currentStep === tourSteps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <Dialog open={showTour} onOpenChange={(open) => { if (!open) handleSkip(); setShowTour(open); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {step.icon}
          </div>
          <DialogTitle className="text-xl">{step.title}</DialogTitle>
          <DialogDescription className="text-base">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex justify-center gap-1.5 py-4">
          {tourSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={cn(
                "h-2 w-2 rounded-full transition-all",
                index === currentStep
                  ? "w-6 bg-primary"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={isFirstStep ? handleSkip : handlePrev}
            className="flex-1"
          >
            {isFirstStep ? 'Skip tour' : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </>
            )}
          </Button>
          <Button
            variant="gradient"
            onClick={handleNext}
            className="flex-1"
          >
            {isLastStep ? "Get started" : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
