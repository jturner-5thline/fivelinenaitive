import { useState } from 'react';
import { LucideIcon, ChevronLeft, ChevronRight, ExternalLink, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface WalkthroughStep {
  title: string;
  description: string;
  action?: string;
  route?: string;
  tip?: string;
}

export interface FeatureGuide {
  icon: LucideIcon;
  title: string;
  description: string;
  tips: string[];
  walkthrough: WalkthroughStep[];
}

interface FeatureWalkthroughProps {
  guide: FeatureGuide | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeatureWalkthrough({ guide, open, onOpenChange }: FeatureWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!guide) return null;

  const steps = guide.walkthrough;
  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const Icon = guide.icon;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    setCurrentStep(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">{guide.title}</DialogTitle>
              <DialogDescription>{guide.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Progress indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-1.5">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={cn(
                  "h-2 w-2 rounded-full transition-all",
                  index === currentStep
                    ? "bg-primary w-4"
                    : index < currentStep
                    ? "bg-primary/50"
                    : "bg-muted-foreground/30"
                )}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>

          {/* Current step content */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                {currentStep + 1}
              </div>
              <div className="space-y-1">
                <h4 className="font-medium text-sm">{step.title}</h4>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>

            {step.action && (
              <div className="ml-10">
                <Badge variant="outline" className="text-xs font-normal">
                  <Check className="h-3 w-3 mr-1" />
                  {step.action}
                </Badge>
              </div>
            )}

            {step.tip && (
              <div className="ml-10 text-xs text-muted-foreground bg-background rounded p-2 border-l-2 border-primary/50">
                💡 {step.tip}
              </div>
            )}

            {step.route && (
              <div className="ml-10">
                <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                  <Link to={step.route} onClick={handleClose}>
                    Go to page
                    <ExternalLink className="h-3 w-3 ml-1.5" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          {currentStep === steps.length - 1 ? (
            <Button size="sm" onClick={handleClose}>
              Done
            </Button>
          ) : (
            <Button size="sm" onClick={handleNext} className="gap-1">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
