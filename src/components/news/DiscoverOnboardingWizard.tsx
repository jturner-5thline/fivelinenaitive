import { useState } from 'react';
import { Newspaper, TrendingUp, Layout, Bell, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ViewLayout } from './NewsFilters';

const INDUSTRIES = [
  'Commercial Real Estate', 'Healthcare', 'Technology', 'Energy',
  'Manufacturing', 'Retail', 'Financial Services', 'Infrastructure',
  'Hospitality', 'Education', 'Agriculture', 'Transportation',
];

const SOURCES = [
  'Bloomberg', 'Reuters', 'Wall Street Journal', 'Financial Times',
  'CNBC', 'The Economist', 'Barron\'s', 'MarketWatch',
  'Business Insider', 'Forbes', 'TechCrunch', 'Pitchbook',
];

const LAYOUTS: { id: ViewLayout; label: string; desc: string }[] = [
  { id: 'magazine', label: 'Magazine', desc: 'Featured article with a rich layout' },
  { id: 'grid', label: 'Grid', desc: 'Cards in a uniform grid' },
  { id: 'list', label: 'List', desc: 'Compact list view' },
];

const TABS = [
  { id: 'for-you', label: 'For You', desc: 'Personalized based on your interests' },
  { id: 'all', label: 'All News', desc: 'Everything in one feed' },
  { id: 'saved', label: 'Saved', desc: 'Your bookmarked articles' },
];

const DIGEST_OPTIONS = [
  { id: 'none', label: 'None', desc: 'No email digest' },
  { id: 'daily', label: 'Daily', desc: 'Every morning' },
  { id: 'weekly', label: 'Weekly', desc: 'Every Monday' },
];

interface Step {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  { id: 'industries', title: 'Your Industries', subtitle: 'What sectors do you follow?', icon: <TrendingUp className="h-5 w-5" /> },
  { id: 'keywords', title: 'Topics & Keywords', subtitle: 'What topics interest you most?', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'sources', title: 'Preferred Sources', subtitle: 'Which publications do you trust?', icon: <Newspaper className="h-5 w-5" /> },
  { id: 'layout', title: 'Layout & View', subtitle: 'How do you like to browse?', icon: <Layout className="h-5 w-5" /> },
  { id: 'digest', title: 'Notifications', subtitle: 'Stay in the loop your way', icon: <Bell className="h-5 w-5" /> },
];

interface DiscoverOnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (prefs: {
    industries: string[];
    keywords: string[];
    preferred_sources: string[];
    default_layout: string;
    default_tab: string;
    digest_frequency: string;
  }) => void;
}

export function DiscoverOnboardingWizard({ open, onClose, onComplete }: DiscoverOnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [industries, setIndustries] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [layout, setLayout] = useState<ViewLayout>('grid');
  const [defaultTab, setDefaultTab] = useState('all');
  const [digestFreq, setDigestFreq] = useState('none');

  const progress = ((step + 1) / STEPS.length) * 100;

  const toggleItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords([...keywords, trimmed]);
    }
    setKeywordInput('');
  };

  const handleComplete = () => {
    onComplete({
      industries,
      keywords,
      preferred_sources: sources,
      default_layout: layout,
      default_tab: defaultTab,
      digest_frequency: digestFreq,
    });
  };

  const isLastStep = step === STEPS.length - 1;

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'industries':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {INDUSTRIES.map(ind => (
              <button
                key={ind}
                onClick={() => toggleItem(industries, setIndustries, ind)}
                className={cn(
                  'px-3 py-2.5 rounded-md text-sm font-medium border transition-all text-left',
                  industries.includes(ind)
                    ? 'bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground border-primary/50 shadow-sm'
                    : 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                )}
              >
                <span className="flex items-center gap-2">
                  {industries.includes(ind) && <Check className="h-3.5 w-3.5 shrink-0" />}
                  {ind}
                </span>
              </button>
            ))}
          </div>
        );

      case 'keywords':
        return (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. SBA loans, bridge financing, M&A..."
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={addKeyword} disabled={!keywordInput.trim()}>
                Add
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {keywords.map(kw => (
                  <Badge
                    key={kw}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/20 transition-colors gap-1"
                    onClick={() => setKeywords(keywords.filter(k => k !== kw))}
                  >
                    {kw} ×
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              These keywords will power your "For You" feed and keyword alerts. Press Enter or click Add.
            </p>
          </div>
        );

      case 'sources':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SOURCES.map(src => (
              <button
                key={src}
                onClick={() => toggleItem(sources, setSources, src)}
                className={cn(
                  'px-3 py-2.5 rounded-md text-sm font-medium border transition-all text-left',
                  sources.includes(src)
                    ? 'bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground border-primary/50 shadow-sm'
                    : 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                )}
              >
                <span className="flex items-center gap-2">
                  {sources.includes(src) && <Check className="h-3.5 w-3.5 shrink-0" />}
                  {src}
                </span>
              </button>
            ))}
          </div>
        );

      case 'layout':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Default Layout</p>
              <div className="grid grid-cols-3 gap-3">
                {LAYOUTS.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLayout(l.id)}
                    className={cn(
                      'p-4 rounded-md border text-center transition-all',
                      layout === l.id
                        ? 'bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground border-primary/50 shadow-sm'
                        : 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                    )}
                  >
                    <p className="text-sm font-medium">{l.label}</p>
                    <p className={cn('text-xs mt-1', layout === l.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{l.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-3">Default Tab</p>
              <div className="grid grid-cols-3 gap-3">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDefaultTab(t.id)}
                    className={cn(
                      'p-4 rounded-md border text-center transition-all',
                      defaultTab === t.id
                        ? 'bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground border-primary/50 shadow-sm'
                        : 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                    )}
                  >
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className={cn('text-xs mt-1', defaultTab === t.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'digest':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Get a curated email digest of the top articles matching your interests.
            </p>
            {DIGEST_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setDigestFreq(opt.id)}
                className={cn(
                  'w-full px-4 py-3 rounded-md border text-left transition-all flex items-center justify-between',
                  digestFreq === opt.id
                    ? 'bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground border-primary/50 shadow-sm'
                    : 'bg-muted/30 text-foreground border-border hover:bg-muted/50'
                )}
              >
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className={cn('text-xs mt-0.5', digestFreq === opt.id ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{opt.desc}</p>
                </div>
                {digestFreq === opt.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            {STEPS[step].icon}
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
          <DialogTitle className="text-xl">{STEPS[step].title}</DialogTitle>
          <DialogDescription>{STEPS[step].subtitle}</DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="h-1.5 mb-2" />

        <div className="py-2">
          {renderStep()}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            {step > 0 ? 'Back' : 'Skip'}
          </Button>

          <div className="flex items-center gap-2">
            {!isLastStep && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Skip All
              </Button>
            )}
            <Button
              size="sm"
              onClick={isLastStep ? handleComplete : () => setStep(step + 1)}
              className="gap-1 bg-gradient-to-r from-primary/90 to-primary/60 text-primary-foreground"
            >
              {isLastStep ? 'Finish Setup' : 'Next'}
              {isLastStep ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
