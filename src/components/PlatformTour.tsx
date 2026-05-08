import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  Briefcase,
  CheckSquare,
  Bot,
  BarChart3,
  TrendingUp,
  Wallet,
  Workflow,
  Shield,
  Network,
  Plug,
  Settings2,
  HelpCircle,
  Sparkles as SparklesLucide,
  ArrowRight,
  AlertTriangle,
  ListChecks,
  Send,
} from 'lucide-react';
import { NaitiveIcon } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

type StepKind = 'intro' | 'module' | 'ai-demo' | 'finish';

interface TourStep {
  kind: StepKind;
  title: string;
  body?: string;
  icon?: React.ReactNode;
  modules?: { label: string; desc: string; icon: React.ReactNode }[];
}

const moduleMap = [
  { label: 'Dashboard',       desc: 'Real-time overview of deals, tasks, action items, and pipeline status.', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Tasks',           desc: 'Personal and team follow-ups, due dates, and assignments.',              icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'Deals',           desc: 'Active deals, lender activity, status, notes, and milestones.',          icon: <Briefcase className="h-4 w-4" /> },
  { label: 'Agents',          desc: 'AI agents that automate research, drafting, and routine ops.',           icon: <Bot className="h-4 w-4" /> },
  { label: 'Insights',        desc: 'Market intelligence, deal analytics, and research views.',               icon: <BarChart3 className="h-4 w-4" /> },
  { label: 'Sales / BD',      desc: 'Partners, referral channels, and pipeline-source attribution.',           icon: <TrendingUp className="h-4 w-4" /> },
  { label: 'Finance',         desc: 'Revenue, EBITDA, controller dash, and FP&A reporting.',                  icon: <Wallet className="h-4 w-4" /> },
  { label: 'Workflow',        desc: 'Visual automations triggered by deal events and schedules.',             icon: <Workflow className="h-4 w-4" /> },
  { label: 'Admin',           desc: 'Members, roles, feature toggles, and company configuration.',            icon: <Shield className="h-4 w-4" /> },
  { label: 'Naitive Pipeline',desc: 'Internal 5th Line execution pipeline and weekly pulse.',                 icon: <Network className="h-4 w-4" /> },
  { label: 'Integrations',    desc: 'Gmail, Calendar, QuickBooks, HubSpot, Asana, and more.',                 icon: <Plug className="h-4 w-4" /> },
  { label: 'Settings',        desc: 'Pipelines, stages, preferences, and notifications.',                     icon: <Settings2 className="h-4 w-4" /> },
  { label: 'Help',            desc: 'Guides, FAQs, and the option to replay this product tour.',              icon: <HelpCircle className="h-4 w-4" /> },
];

const tourSteps: TourStep[] = [
  {
    kind: 'intro',
    title: 'Welcome to Naitive',
    body: 'Your command center for deals, lenders, tasks, pipeline, and AI workflows. This 60-second tour will show you where everything lives — and what Naitive AI can do for you out of the box.',
    icon: <NaitiveIcon className="h-8 w-8 text-primary" />,
  },
  {
    kind: 'module',
    title: 'The left navigation',
    body: 'Every workspace module lives in the left sidebar. Here\'s a quick map of what each one is for — modules you don\'t have access to are simply hidden.',
    icon: <LayoutDashboard className="h-8 w-8 text-primary" />,
    modules: moduleMap,
  },
  {
    kind: 'module',
    title: 'Dashboard',
    body: 'Your real-time overview. See active deals, urgent tasks, action items, pipeline status, and the daily briefing all on one page.',
    icon: <LayoutDashboard className="h-8 w-8 text-primary" />,
  },
  {
    kind: 'module',
    title: 'Tasks',
    body: 'Manage personal and team follow-ups across List, Board, Calendar, and Timeline views. Tasks can be linked to deals, lenders, contacts, and companies.',
    icon: <CheckSquare className="h-8 w-8 text-primary" />,
  },
  {
    kind: 'module',
    title: 'Deals',
    body: 'Where you live day-to-day: active deals, lender activity, status, notes, milestones, write-ups, and the data room — all in one place.',
    icon: <Briefcase className="h-8 w-8 text-primary" />,
  },
  {
    kind: 'module',
    title: 'Insights & research',
    body: 'Market sizing, competitive intelligence, lender research, and deal analytics — pre-wired so you can answer strategic questions without leaving the app.',
    icon: <BarChart3 className="h-8 w-8 text-primary" />,
  },
  {
    kind: 'module',
    title: 'Ask Naitive AI',
    body: 'The AI panel is on every page. Ask questions, draft follow-ups, create tasks, summarize updates, and find information in seconds. Naitive AI doesn\'t just answer — it can act, with your approval.',
    icon: <NaitiveIcon className="h-8 w-8 text-primary" />,
  },
  {
    kind: 'ai-demo',
    title: 'See Naitive AI in action',
    body: 'Here\'s a quick simulated example of what you can ask — and what Naitive AI does with it.',
  },
  {
    kind: 'finish',
    title: "You're ready to go",
    body: 'You can replay this tour anytime from Help → Restart Tour. Try asking Naitive AI any of the prompts below to get started.',
  },
];

// ---------- AI demo simulation ----------

const DEMO_USER_PROMPT = 'Show me the deals that need follow-up this week, summarize the latest status, and create action items for anything at risk.';

const DEMO_DEALS = [
  { name: 'Athyna',                  status: 'Waiting on March financials. Lender feedback is active — next response timing matters.', risk: false },
  { name: 'Xnergy United Network',   status: 'Five Crowns expected to send a term sheet early this week — follow-up recommended.',     risk: true  },
  { name: 'Czerlonka',               status: 'Founders First still in review. Deal may need to pause if no movement this week.',       risk: true  },
];

const DEMO_ACTIONS = [
  'Follow up with Five Crowns on Xnergy United Network',
  'Check lender status on Czerlonka by tomorrow',
  'Request updated materials and timing confirmation for Athyna',
];

function AiDemoSimulation() {
  const [phase, setPhase] = useState<'typing-user' | 'thinking' | 'streaming' | 'done'>('typing-user');
  const [userText, setUserText] = useState('');
  const [revealedDeals, setRevealedDeals] = useState(0);
  const [revealedActions, setRevealedActions] = useState(0);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const timers: number[] = [];
    // Type the user prompt
    let i = 0;
    const typeUser = window.setInterval(() => {
      i += 3;
      setUserText(DEMO_USER_PROMPT.slice(0, i));
      if (i >= DEMO_USER_PROMPT.length) {
        window.clearInterval(typeUser);
        timers.push(window.setTimeout(() => setPhase('thinking'), 250));
        timers.push(window.setTimeout(() => setPhase('streaming'), 900));
        // Reveal deals one-by-one
        DEMO_DEALS.forEach((_, idx) => {
          timers.push(window.setTimeout(() => setRevealedDeals(idx + 1), 1100 + idx * 550));
        });
        // Then reveal actions
        const actionStart = 1100 + DEMO_DEALS.length * 550 + 350;
        DEMO_ACTIONS.forEach((_, idx) => {
          timers.push(window.setTimeout(() => setRevealedActions(idx + 1), actionStart + idx * 450));
        });
        timers.push(window.setTimeout(() => setPhase('done'), actionStart + DEMO_ACTIONS.length * 450 + 300));
      }
    }, 18);
    timers.push(typeUser);

    return () => { timers.forEach(t => window.clearTimeout(t)); window.clearInterval(typeUser); };
  }, []);

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3 max-h-[55vh] overflow-y-auto">
      {/* User message */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/15 text-foreground px-3 py-2 text-sm">
          {userText}
          {phase === 'typing-user' && <span className="ml-0.5 inline-block w-1.5 h-3.5 align-middle bg-primary/70 animate-pulse" />}
        </div>
      </div>

      {/* AI thinking */}
      {phase === 'thinking' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
          <NaitiveIcon className="h-4 w-4 text-primary" />
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-200ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-100ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" />
          </span>
          <span>Naitive AI is reviewing your active deals…</span>
        </div>
      )}

      {/* AI response */}
      {(phase === 'streaming' || phase === 'done') && (
        <div className="flex gap-2">
          <div className="shrink-0 mt-0.5">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <NaitiveIcon className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            {revealedDeals > 0 && (
              <div>
                <p className="text-sm text-foreground mb-2">Here are the top deals that need attention this week:</p>
                <div className="space-y-1.5">
                  {DEMO_DEALS.slice(0, revealedDeals).map((d) => (
                    <div
                      key={d.name}
                      className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{d.name}</span>
                          {d.risk && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-1 border-destructive/40 text-destructive">
                              <AlertTriangle className="h-2.5 w-2.5" /> At risk
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {revealedActions > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Recommended action items created
                </p>
                <ul className="space-y-1">
                  {DEMO_ACTIONS.slice(0, revealedActions).map((a) => (
                    <li
                      key={a}
                      className="text-sm text-foreground flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
                    >
                      <CheckSquare className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {phase === 'done' && (
              <p className="text-[11px] text-muted-foreground italic">
                Action items appear in your task list pending your approval — Naitive AI never sends or commits without you.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Final-step example prompts ----------

const EXAMPLE_PROMPTS = [
  'What deals need my attention today?',
  'Draft a lender follow-up for Athyna.',
  'Summarize the latest updates across active deals.',
  'Create tasks for overdue follow-ups.',
];

function ExamplePrompts() {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <SparklesLucide className="h-3.5 w-3.5" /> Try asking Naitive AI
      </p>
      <div className="grid gap-1.5">
        {EXAMPLE_PROMPTS.map((p) => (
          <div key={p} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
            <Send className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Main component ----------

export function PlatformTour() {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const checkTourEligibility = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const isDemo = user.email === 'demo@example.com';
      setIsDemoUser(isDemo);

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

    const handleRestartTour = () => {
      setCurrentStep(0);
      setShowTour(true);
    };
    window.addEventListener('restart-platform-tour', handleRestartTour);
    window.addEventListener('restart-demo-tour', handleRestartTour);
    return () => {
      window.removeEventListener('restart-platform-tour', handleRestartTour);
      window.removeEventListener('restart-demo-tour', handleRestartTour);
    };
  }, []);

  const steps = useMemo(() => {
    if (!isDemoUser) return tourSteps;
    // For demo users, swap intro copy
    return tourSteps.map((s, i) => i === 0
      ? { ...s, title: 'Welcome to the Demo', body: "You're exploring Naitive with sample data. Nothing you do affects real accounts. Let's take a quick tour." }
      : s);
  }, [isDemoUser]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
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

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <Dialog open={showTour} onOpenChange={(open) => { if (!open) handleSkip(); setShowTour(open); }}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
        {/* Header band */}
        <div className="px-5 pt-5 pb-3 border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-background">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
                {step.icon ?? <NaitiveIcon className="h-4 w-4 text-primary" />}
              </div>
              <div className="text-xs text-muted-foreground">
                Naitive AI guide · Step {currentStep + 1} of {steps.length}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={handleSkip}>
              Skip
            </Button>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{step.title}</h2>
          {step.body && <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>}

          {step.kind === 'module' && step.modules && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2">
              {step.modules.map((m) => (
                <div key={m.label} className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
                  <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {m.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground">{m.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-snug">{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step.kind === 'ai-demo' && <AiDemoSimulation key={`demo-${currentStep}`} />}

          {step.kind === 'finish' && (
            <div className="pt-1">
              <ExamplePrompts />
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t border-border/60 bg-muted/20 flex-row items-center sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={isFirstStep}
            className="text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {isLastStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { completeTour(); navigate('/dashboard'); }}
              >
                Go to Dashboard
              </Button>
            )}
            <Button variant="gradient" size="sm" onClick={handleNext}>
              {isLastStep ? (
                <>Finish <ArrowRight className="h-4 w-4 ml-1" /></>
              ) : (
                <>Next <ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
