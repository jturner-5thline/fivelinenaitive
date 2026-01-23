import { AppLayout } from '@/components/AppLayout';
import { 
  LenderMatchingPanel, 
  CompetitiveIntelPanel, 
  MarketSizingPanel, 
  TermSheetBenchmarkPanel, 
  SecFilingsPanel, 
  RateTrackingPanel 
} from '@/components/research';
import { Sparkles } from 'lucide-react';

export default function Research() {
  return (
    <AppLayout mainClassName="bg-background">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">AI Research Hub</h1>
            <p className="text-muted-foreground">Perplexity-powered market intelligence and research tools</p>
          </div>
        </div>
        
        <div className="grid gap-4">
          <LenderMatchingPanel />
          <TermSheetBenchmarkPanel />
          <RateTrackingPanel />
          <CompetitiveIntelPanel />
          <MarketSizingPanel />
          <SecFilingsPanel />
        </div>
      </div>
    </AppLayout>
  );
}
