import { Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GammaGenerationProgressProps {
  status: 'pending' | 'completed' | 'failed';
}

const steps = [
  { label: 'Analyzing deal data', key: 'analyze' },
  { label: 'Creating outline', key: 'outline' },
  { label: 'Generating content', key: 'generate' },
  { label: 'Applying design', key: 'design' },
];

export function GammaGenerationProgress({ status }: GammaGenerationProgressProps) {
  const isComplete = status === 'completed';
  const isFailed = status === 'failed';

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        {status === 'pending' && (
          <>
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Generating your presentation...</p>
              <p className="text-xs text-muted-foreground">This usually takes 30-60 seconds</p>
            </div>
          </>
        )}
        {isComplete && (
          <>
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Presentation ready!</p>
              <p className="text-xs text-muted-foreground">Your content has been generated</p>
            </div>
          </>
        )}
        {isFailed && (
          <>
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Generation failed</p>
              <p className="text-xs text-muted-foreground">Please try again</p>
            </div>
          </>
        )}
      </div>

      {status === 'pending' && (
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center gap-3">
              <div className="relative h-5 w-5 flex items-center justify-center">
                <Loader2 className={cn('h-4 w-4 text-primary', i === 0 ? 'animate-spin' : 'animate-spin opacity-30')} />
              </div>
              <span className={cn('text-xs', i === 0 ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
