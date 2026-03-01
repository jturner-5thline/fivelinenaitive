import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Database, FileSpreadsheet, BarChart3, CheckCircle2,
  Upload, Link2, Sparkles, ChevronRight, Rocket
} from 'lucide-react';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  options: { id: string; label: string; description: string; recommended?: boolean }[];
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'source',
    title: 'Connect Your Data',
    description: 'Choose how to bring your financial data into the workspace.',
    icon: <Database className="h-6 w-6" />,
    options: [
      { id: 'upload', label: 'Upload Spreadsheet', description: 'Import .xlsx, .csv, or .xls files', recommended: true },
      { id: 'connector', label: 'Connect ERP/GL', description: 'QuickBooks, Xero, NetSuite' },
      { id: 'manual', label: 'Start from Scratch', description: 'Build a model manually' },
    ],
  },
  {
    id: 'template',
    title: 'Pick a Template',
    description: 'Start with a pre-built model or a blank canvas.',
    icon: <FileSpreadsheet className="h-6 w-6" />,
    options: [
      { id: 'three-statement', label: '3-Statement Model', description: 'P&L, Balance Sheet, Cash Flow', recommended: true },
      { id: 'budget', label: 'Annual Budget', description: 'Department-level budget vs actuals' },
      { id: 'forecast', label: 'Revenue Forecast', description: 'MRR/ARR growth projections' },
      { id: 'blank', label: 'Blank Workbook', description: 'Start with an empty sheet' },
    ],
  },
  {
    id: 'dashboard',
    title: 'Configure Dashboard',
    description: 'Choose which KPIs and charts to show on your home view.',
    icon: <BarChart3 className="h-6 w-6" />,
    options: [
      { id: 'full', label: 'Full Suite', description: 'All KPIs, charts, and scenarios', recommended: true },
      { id: 'executive', label: 'Executive View', description: 'High-level revenue & margin only' },
      { id: 'ops', label: 'Operations Focus', description: 'OPEX, burn, and runway metrics' },
    ],
  },
];

const STORAGE_KEY = 'fpa-setup-completed';

interface FPASetupWizardProps {
  onComplete: (config: Record<string, string>) => void;
}

export function FPASetupWizard({ onComplete }: FPASetupWizardProps) {
  const [open, setOpen] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const current = WIZARD_STEPS[step];
  const progress = ((step + 1) / WIZARD_STEPS.length) * 100;

  const handleSelect = (optionId: string) => {
    setSelections(prev => ({ ...prev, [current.id]: optionId }));
  };

  const handleNext = () => {
    if (step < WIZARD_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      localStorage.setItem(STORAGE_KEY, 'true');
      setOpen(false);
      onComplete(selections);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
    onComplete({});
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {current.icon}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Step {step + 1} of {WIZARD_STEPS.length}</p>
              <DialogTitle className="text-base">{current.title}</DialogTitle>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{current.description}</p>
        </DialogHeader>

        <Progress value={progress} className="h-1 mb-2" />

        <div className="space-y-2">
          {current.options.map(opt => (
            <Card
              key={opt.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-sm",
                selections[current.id] === opt.id && "ring-2 ring-primary"
              )}
              onClick={() => handleSelect(opt.id)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-8 w-8 rounded-md flex items-center justify-center",
                    selections[current.id] === opt.id ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    {selections[current.id] === opt.id
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <span className="text-xs font-bold text-muted-foreground">{opt.label[0]}</span>
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
                {opt.recommended && (
                  <Badge variant="secondary" className="text-[9px]">Recommended</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between mt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip setup
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              disabled={!selections[current.id]}
              className="gap-1"
            >
              {step === WIZARD_STEPS.length - 1 ? (
                <>
                  <Rocket className="h-3.5 w-3.5" /> Launch
                </>
              ) : (
                <>
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
