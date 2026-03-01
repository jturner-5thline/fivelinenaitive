import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Database, FileSpreadsheet, BarChart3, Sparkles, Zap,
  ChevronRight, ChevronLeft, X, HelpCircle, Rocket
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  tabValue: string;
  tip: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to FP&A',
    description: 'Your AI-native financial planning and analysis workspace. Let\'s walk through the key modules.',
    icon: <Rocket className="h-6 w-6" />,
    tabValue: 'dashboards',
    tip: 'You can restart this tour anytime from the help icon.',
  },
  {
    title: 'Data Consolidation',
    description: 'Connect and normalize financial data from multiple sources — ERPs, spreadsheets, and CSVs. Map accounts and validate data quality before analysis.',
    icon: <Database className="h-6 w-6" />,
    tabValue: 'data',
    tip: 'Start here to import your chart of accounts and GL data.',
  },
  {
    title: 'Spreadsheet Engine',
    description: 'A full Excel-compatible workbook with 60+ formulas, conditional formatting, and pivot tables. Upload existing workbooks or build from scratch.',
    icon: <FileSpreadsheet className="h-6 w-6" />,
    tabValue: 'sheets',
    tip: 'Drag & drop any .xlsx file to instantly load it.',
  },
  {
    title: 'Dashboards & Scenarios',
    description: 'Interactive P&L, Balance Sheet, and Cash Flow views with variance analysis. Run Base/Bull/Bear scenarios and stress tests side-by-side.',
    icon: <BarChart3 className="h-6 w-6" />,
    tabValue: 'dashboards',
    tip: 'Click any KPI card to drill down into its components.',
  },
  {
    title: 'AI Intelligence',
    description: 'Ask questions in natural language — get instant analysis, anomaly detection, and forecast suggestions powered by AI.',
    icon: <Sparkles className="h-6 w-6" />,
    tabValue: 'ai',
    tip: 'Try: "What\'s driving the EBITDA increase this month?"',
  },
  {
    title: 'Automations & Collaboration',
    description: 'Set up automated reports, comment on P&L lines with @mentions, flag variances for review, and manage budget approval workflows.',
    icon: <Zap className="h-6 w-6" />,
    tabValue: 'automations',
    tip: 'Use the Collaborate tab inside Dashboards for approvals.',
  },
];

const TOUR_STORAGE_KEY = 'fpa-tour-completed';

interface FPATourProps {
  onNavigateToTab: (tab: string) => void;
}

export function FPATour({ onNavigateToTab }: FPATourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      onNavigateToTab(TOUR_STEPS[nextStep].tabValue);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      onNavigateToTab(TOUR_STEPS[prevStep].tabValue);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  };

  const handleRestart = () => {
    setStep(0);
    setIsOpen(true);
    onNavigateToTab(TOUR_STEPS[0].tabValue);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleRestart}
        title="Start FP&A tour"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
    );
  }

  const current = TOUR_STEPS[step];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Tour Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <Card className="pointer-events-auto w-full max-w-md shadow-xl border-primary/20">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  {current.icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Step {step + 1} of {TOUR_STEPS.length}</p>
                  <h3 className="text-lg font-semibold">{current.title}</h3>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Body */}
            <p className="text-sm text-muted-foreground mb-3">{current.description}</p>

            {/* Tip */}
            <div className="bg-muted/50 rounded-md px-3 py-2 mb-5">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">💡 Tip:</span> {current.tip}
              </p>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                  )}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                disabled={step === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Skip tour
                </Button>
                <Button size="sm" onClick={handleNext} className="gap-1">
                  {step === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}
                  {step < TOUR_STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
