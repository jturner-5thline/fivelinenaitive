import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronLeft, LayoutDashboard, Briefcase, Users, FolderOpen, Settings2, BarChart3, CheckSquare, Bot, Milestone } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
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

const platformTourSteps: TourStep[] = [
  {
    title: 'Welcome to naitive!',
    description: "You're all set up! Let's take a quick tour of the platform to help you hit the ground running.",
    icon: <Sparkles className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Dashboard',
    description: 'Your command center. Get a quick overview of your deals, key metrics, and recent activity all in one place.',
    icon: <LayoutDashboard className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Deals Pipeline',
    description: 'Manage your entire deal flow. Create new deals, track progress through stages, and filter by status, type, or assignee.',
    icon: <Briefcase className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Milestones',
    description: "Track key milestones for each deal — from kick-off to closing. Mark progress, set due dates, and keep your entire team aligned on what's next.",
    icon: <Milestone className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Tasks',
    description: 'Stay on top of your work with the task manager. Create, assign, and track tasks linked to your deals.',
    icon: <CheckSquare className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Lender Management',
    description: 'Search your lender database, view lender profiles, track interactions, and manage your lender relationships — all from the deal detail page.',
    icon: <Users className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Data Room',
    description: 'Each deal has a built-in data room. Upload documents, organize by category, track checklist completion, and share files securely with external parties.',
    icon: <FolderOpen className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Analytics & Insights',
    description: 'Track performance with customizable charts and metrics. Monitor deal velocity, lender activity, and team productivity.',
    icon: <BarChart3 className="h-8 w-8 text-primary" />,
  },
  {
    title: 'AI Agents',
    description: 'Set up AI-powered agents to automate tasks, generate insights, and get recommendations based on your deal data.',
    icon: <Bot className="h-8 w-8 text-primary" />,
  },
  {
    title: 'Settings & Customization',
    description: "Configure your pipeline stages, deal types, notification preferences, and team permissions. Make naitive work the way you do.",
    icon: <Settings2 className="h-8 w-8 text-primary" />,
  },
];

const demoTourSteps: TourStep[] = [
  {
    title: 'Welcome to the Demo!',
    description: 'This quick tour will show you the key features. You can explore freely with sample data—nothing you do here affects real accounts.',
    icon: <Sparkles className="h-8 w-8 text-primary" />,
  },
  ...platformTourSteps.slice(1),
];

export function PlatformTour() {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const checkTourEligibility = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const isDemo = user.email === 'demo@example.com';
      setIsDemoUser(isDemo);

      // For demo users: Always show tour on each login session
      const demoTourShownThisSession = sessionStorage.getItem('demo-tour-shown-this-session');

      if (isDemo) {
        setShouldShowTour(true);
        if (!demoTourShownThisSession) {
          localStorage.removeItem('tour-completed');
          localStorage.removeItem('dismissed-hints');
          localStorage.removeItem('hints-fully-dismissed');
          sessionStorage.setItem('demo-tour-shown-this-session', 'true');
          setTimeout(() => setShowTour(true), 500);
        }
        return;
      }

      // For regular users: Check if they just completed onboarding
      const justCompletedOnboarding = sessionStorage.getItem('just-completed-onboarding');

      const tourCompleted = localStorage.getItem('tour-completed');

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      const isNewUser = profile && !profile.onboarding_completed;

      if (justCompletedOnboarding || (isNewUser && !tourCompleted)) {
        setShouldShowTour(true);
        if (!tourCompleted) {
          setTimeout(() => setShowTour(true), 500);
        }
        sessionStorage.removeItem('just-completed-onboarding');
      } else {
        setShouldShowTour(true);
      }
    };
    checkTourEligibility();

    // Listen for restart tour event
    const handleRestartTour = () => {
      setCurrentStep(0);
      setShowTour(true);
    };
    window.addEventListener('restart-platform-tour', handleRestartTour);
    // Keep backward compat with old event name
    window.addEventListener('restart-demo-tour', handleRestartTour);
    return () => {
      window.removeEventListener('restart-platform-tour', handleRestartTour);
      window.removeEventListener('restart-demo-tour', handleRestartTour);
    };
  }, []);

  const tourSteps = isDemoUser ? demoTourSteps : platformTourSteps;

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
