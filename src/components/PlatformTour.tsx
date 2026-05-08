import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  X,
  MousePointerClick,
  Sparkles as SparklesLucide,
  AlertTriangle,
  ListChecks,
  CheckSquare,
  Send,
} from 'lucide-react';
import { NaitiveIcon } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useCopilotStore } from '@/stores/copilotStore';
import { cn } from '@/lib/utils';

// ---------- Step definitions ----------

type StepKind = 'intro' | 'spotlight' | 'ai-demo' | 'finish';

interface TourStep {
  id: string;
  kind: StepKind;
  title: string;
  body: string;
  /** CSS selector for spotlight target. Step is auto-skipped if not found. */
  target?: string;
  /** Hint label shown near the target ("Click to continue"). */
  hint?: string;
  /** Auto-advance when user clicks the highlighted target. */
  clickToAdvance?: boolean;
  /** Navigate here before showing the step (and wait for target if any). */
  route?: string;
  /** Optional callback fired when step becomes active. */
  onEnter?: () => void;
  /** Skip if this returns false (permission-aware). */
  isAvailable?: () => boolean;
}

const isInDOM = (sel: string) => !!document.querySelector(sel);

const buildSteps = (): TourStep[] => [
  {
    id: 'welcome',
    kind: 'intro',
    title: 'Welcome to Naitive',
    body: "Your command center for deals, lenders, tasks, and AI workflows. This is a hands-on tour — you'll click through real navigation as we go. About 60 seconds.",
  },
  {
    id: 'sidebar',
    kind: 'spotlight',
    title: 'Your left navigation',
    body: 'Every workspace module lives here. The sidebar adapts to what your account has access to — anything hidden simply isn\'t in your plan or role.',
    target: '[data-tour="sidebar"]',
    hint: 'Take a look — then continue',
  },
  {
    id: 'dashboard',
    kind: 'spotlight',
    title: 'Open your Dashboard',
    body: 'Your real-time overview: active deals, urgent tasks, pipeline status, and the daily briefing — all on one page.',
    target: '[data-tour="nav-dashboard"]',
    hint: 'Click Dashboard to continue',
    clickToAdvance: true,
    isAvailable: () => isInDOM('[data-tour="nav-dashboard"]'),
  },
  {
    id: 'workspace',
    kind: 'spotlight',
    title: 'This is your workspace',
    body: 'Each module renders here. Use widgets, filters, and inline AI to work without context-switching.',
    target: '[data-tour="workspace"]',
    hint: 'Looks good — next',
    route: '/dashboard',
  },
  {
    id: 'tasks',
    kind: 'spotlight',
    title: 'Open Tasks',
    body: 'Manage personal and team follow-ups across List, Board, Calendar, and Timeline views — all linked back to deals and contacts.',
    target: '[data-tour="nav-tasks"]',
    hint: 'Click Tasks to continue',
    clickToAdvance: true,
    isAvailable: () => isInDOM('[data-tour="nav-tasks"]'),
  },
  {
    id: 'deals',
    kind: 'spotlight',
    title: 'Open Deals',
    body: 'Where you live day-to-day: lender activity, status, write-ups, the data room, and notes — one record per deal.',
    target: '[data-tour="nav-deals"]',
    hint: 'Click Deals to continue',
    clickToAdvance: true,
    isAvailable: () => isInDOM('[data-tour="nav-deals"]'),
  },
  {
    id: 'ask-ai',
    kind: 'spotlight',
    title: 'Meet Ask Naitive AI',
    body: "Your AI partner is on every page. Ask questions, summarize updates, draft follow-ups, and create tasks. Naitive AI doesn't just answer — it can act, with your approval.",
    target: '[data-tour="ask-ai"]',
    hint: 'Continue to see it work',
    isAvailable: () => isInDOM('[data-tour="ask-ai"]'),
  },
  {
    id: 'ai-demo',
    kind: 'ai-demo',
    title: 'See Naitive AI in action',
    body: 'Here is a quick simulated example of what you can ask — and what Naitive AI does with it.',
  },
  {
    id: 'finish',
    kind: 'finish',
    title: "You're ready to go",
    body: 'You can replay this tour anytime from Help → Restart Tour. Try one of these prompts to get started.',
  },
];

// ---------- AI demo simulation (kept intact) ----------

const DEMO_USER_PROMPT =
  'Show me the deals that need follow-up this week, summarize the latest status, and create action items for anything at risk.';

const DEMO_DEALS = [
  { name: 'Northstar HVAC', status: 'Waiting on updated trailing twelve-month financials — lender follow-up recommended.', risk: false },
  { name: 'BluePeak Logistics', status: 'Term sheet expected early next week — confirm timeline with capital partner.', risk: true },
  { name: 'Harbor Ridge Dental', status: 'Underwriting paused pending owner clarification on add-backs.', risk: true },
];

const DEMO_ACTIONS = [
  'Follow up with Meridian Capital on BluePeak Logistics',
  'Request updated financial package for Northstar HVAC',
  'Confirm underwriting status and owner responses for Harbor Ridge Dental',
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
    let i = 0;
    const typeUser = window.setInterval(() => {
      i += 3;
      setUserText(DEMO_USER_PROMPT.slice(0, i));
      if (i >= DEMO_USER_PROMPT.length) {
        window.clearInterval(typeUser);
        timers.push(window.setTimeout(() => setPhase('thinking'), 250));
        timers.push(window.setTimeout(() => setPhase('streaming'), 900));
        DEMO_DEALS.forEach((_, idx) => {
          timers.push(window.setTimeout(() => setRevealedDeals(idx + 1), 1100 + idx * 550));
        });
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
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3 max-h-[50vh] overflow-y-auto">
      {/* Sandboxed demo notice — no real workspace data is queried, displayed, or written. */}
      <div className="flex items-center justify-between gap-2 -mt-1 -mx-1">
        <Badge variant="outline" className="h-5 px-2 text-[10px] gap-1 border-primary/40 text-primary bg-primary/10">
          <SparklesLucide className="h-2.5 w-2.5" /> Demo example
        </Badge>
        <span className="text-[10px] text-muted-foreground italic">Sample data · nothing saved</span>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/15 text-foreground px-3 py-2 text-sm">
          {userText}
          {phase === 'typing-user' && <span className="ml-0.5 inline-block w-1.5 h-3.5 align-middle bg-primary/70 animate-pulse" />}
        </div>
      </div>
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
                    <div key={d.name} className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
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
                    <li key={a} className="text-sm text-foreground flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
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

const EXAMPLE_PROMPTS = [
  'What deals need my attention today?',
  'Draft a lender follow-up for an active deal.',
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

// ---------- Spotlight overlay ----------

interface Rect { top: number; left: number; width: number; height: number; }

function useTargetRect(selector: string | undefined, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector || !active) { setRect(null); return; }
    let raf = 0;
    let cancelled = false;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect((prev) => {
        const next: Rect = { top: r.top, left: r.left, width: r.width, height: r.height };
        if (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height) return prev;
        return next;
      });
    };
    const tick = () => { if (cancelled) return; measure(); raf = window.requestAnimationFrame(tick); };
    tick();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { cancelled = true; cancelAnimationFrame(raf); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [selector, active]);

  return rect;
}

function popoverPosition(rect: Rect, popW: number, popH: number) {
  const PAD = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Prefer right of target on desktop, otherwise below
  const spaceRight = vw - (rect.left + rect.width);
  const spaceBelow = vh - (rect.top + rect.height);
  let top: number; let left: number;
  if (vw >= 768 && spaceRight >= popW + PAD) {
    left = rect.left + rect.width + PAD;
    top = Math.min(Math.max(rect.top, PAD), vh - popH - PAD);
  } else if (spaceBelow >= popH + PAD) {
    top = rect.top + rect.height + PAD;
    left = Math.min(Math.max(rect.left, PAD), vw - popW - PAD);
  } else {
    // Above
    top = Math.max(PAD, rect.top - popH - PAD);
    left = Math.min(Math.max(rect.left, PAD), vw - popW - PAD);
  }
  return { top, left };
}

// ---------- Main component ----------

const STEP_INDEX_KEY = 'tour-step-index';

export function PlatformTour() {
  const [shouldShowTour, setShouldShowTour] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const startDemo = useCopilotStore((s) => s.startDemo);
  const stopDemo = useCopilotStore((s) => s.stopDemo);
  const allSteps = useMemo(() => buildSteps(), []);

  // Filter to only available steps for this user (permission-aware re-evaluation each render)
  const steps = useMemo(() => {
    return allSteps.filter((s) => !s.isAvailable || s.isAvailable());
  // Re-evaluate when route changes (DOM may differ).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSteps, location.pathname, showTour]);

  const step = steps[currentStep];

  useEffect(() => {
    const checkTourEligibility = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const isDemo = user.email === 'demo@example.com';
      setIsDemoUser(isDemo);

      const demoTourShownThisSession = sessionStorage.getItem('demo-tour-shown-this-session');
      const savedStep = Number(localStorage.getItem(STEP_INDEX_KEY) || '0') || 0;

      if (isDemo) {
        setShouldShowTour(true);
        if (!demoTourShownThisSession) {
          localStorage.removeItem('tour-completed');
          localStorage.removeItem('dismissed-hints');
          localStorage.removeItem('hints-fully-dismissed');
          localStorage.removeItem(STEP_INDEX_KEY);
          sessionStorage.setItem('demo-tour-shown-this-session', 'true');
          setCurrentStep(0);
          setTimeout(() => setShowTour(true), 500);
        }
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, tour_completed_at')
        .eq('user_id', user.id)
        .maybeSingle();

      setShouldShowTour(true);

      const tourAlreadyCompleted = !!(profile as { tour_completed_at?: string | null } | null)?.tour_completed_at
        || localStorage.getItem('tour-completed') === 'true';
      if (tourAlreadyCompleted) return;

      const justCompletedOnboarding = sessionStorage.getItem('just-completed-onboarding');
      const isNewUser = profile && !profile.onboarding_completed;

      if (justCompletedOnboarding || isNewUser) {
        setCurrentStep(savedStep);
        setTimeout(() => setShowTour(true), 500);
        sessionStorage.removeItem('just-completed-onboarding');
      }
    };
    checkTourEligibility();

    const handleRestartTour = () => {
      localStorage.removeItem(STEP_INDEX_KEY);
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

  // Persist progress
  useEffect(() => {
    if (showTour) localStorage.setItem(STEP_INDEX_KEY, String(currentStep));
  }, [currentStep, showTour]);

  // Navigate when step.route is set
  useEffect(() => {
    if (!showTour || !step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    // The AI demo step opens the real Ask Naitive AI panel in a sandboxed
    // demo mode — it shows a fully fake conversation and disables the live
    // input. No real workspace data is queried, displayed, or written.
    if (step.kind === 'ai-demo') {
      startDemo();
    } else {
      stopDemo();
    }
    step.onEnter?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTour, currentStep, step?.id]);

  const completeTour = useCallback(() => {
    localStorage.setItem('tour-completed', 'true');
    localStorage.removeItem(STEP_INDEX_KEY);
    setShowTour(false);
    stopDemo();
    if (userId && !isDemoUser) {
      void supabase
        .from('profiles')
        .update({ tour_completed_at: new Date().toISOString() })
        .eq('user_id', userId);
    }
  }, [userId, isDemoUser, stopDemo]);

  const advance = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  }, [steps.length]);

  const handleNext = () => {
    if (!step) return;
    if (currentStep >= steps.length - 1) completeTour();
    else advance();
  };
  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));
  const handleSkip = () => completeTour();

  // Click-to-advance: listen on the document for clicks within the target.
  useEffect(() => {
    if (!showTour || !step?.clickToAdvance || !step.target) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(step.target!)) {
        // Let the click happen naturally (NavLink will navigate),
        // then advance after a small delay so the next step's DOM is ready.
        window.setTimeout(advance, 350);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [showTour, step, advance]);

  // Keyboard
  useEffect(() => {
    if (!showTour) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTour, currentStep, steps.length]);

  const targetRect = useTargetRect(step?.target, showTour && step?.kind === 'spotlight');

  if (!shouldShowTour || !showTour || !step) return null;

  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isCentered = step.kind !== 'spotlight' || !targetRect;

  // Popover dimensions (responsive). The AI demo step is now a slim coach
  // mark — the real demo conversation plays inside the live Ask Naitive AI
  // panel rather than inside the popover.
  const popW = Math.min(380, window.innerWidth - 32);
  const popH = 280;

  let popStyle: React.CSSProperties;
  if (isCentered) {
    popStyle = {
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: popW,
      maxHeight: popH,
    };
  } else {
    const pos = popoverPosition(targetRect!, popW, popH);
    popStyle = { top: pos.top, left: pos.left, width: popW };
  }

  // SVG mask cutout (pad 6px around target)
  const PAD = 6;
  const cutout = targetRect ? {
    x: targetRect.left - PAD,
    y: targetRect.top - PAD,
    w: targetRect.width + PAD * 2,
    h: targetRect.height + PAD * 2,
    r: 12,
  } : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-live="polite">
      {/* Backdrop with cutout (SVG mask) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-auto"
        style={{ pointerEvents: cutout ? 'none' : 'auto' }}
        onClick={() => { /* clicking blank backdrop does nothing — use Skip */ }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {cutout && (
              <rect x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx={cutout.r} ry={cutout.r} fill="black" />
            )}
          </mask>
        </defs>
        <rect
          width="100%" height="100%"
          fill="rgba(2, 6, 18, 0.72)"
          mask="url(#tour-mask)"
          style={{ transition: 'opacity 200ms', pointerEvents: 'auto' }}
        />
      </svg>

      {/* Pulsing halo around the cutout */}
      {cutout && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: cutout.y - 3,
            left: cutout.x - 3,
            width: cutout.w + 6,
            height: cutout.h + 6,
            borderRadius: cutout.r + 3,
            boxShadow: '0 0 0 2px hsl(var(--primary) / 0.85), 0 0 0 8px hsl(var(--primary) / 0.18), 0 0 32px hsl(var(--primary) / 0.35)',
            animation: 'tour-pulse 1.8s ease-out infinite',
          }}
        />
      )}

      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.85), 0 0 0 6px hsl(var(--primary) / 0.18), 0 0 24px hsl(var(--primary) / 0.30); }
          50% { box-shadow: 0 0 0 2px hsl(var(--primary) / 1), 0 0 0 12px hsl(var(--primary) / 0.10), 0 0 40px hsl(var(--primary) / 0.45); }
        }
      `}</style>

      {/* Popover */}
      <div
        className={cn(
          'absolute pointer-events-auto rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
        style={popStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-border/60 bg-gradient-to-br from-primary/10 via-background to-background">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <NaitiveIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-[11px] text-muted-foreground">
                Naitive guide · {currentStep + 1} of {steps.length}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={handleSkip} aria-label="Skip tour">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2 overflow-y-auto flex-1">
          <h2 id="tour-title" className="text-base font-semibold tracking-tight text-foreground">
            {step.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>

          {step.hint && step.kind === 'spotlight' && (
            <div className="flex items-center gap-2 text-xs text-primary/90 bg-primary/10 border border-primary/20 rounded-md px-2 py-1.5 mt-2">
              <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
              <span>{step.hint}</span>
            </div>
          )}

          {step.kind === 'ai-demo' && <AiDemoSimulation key={`demo-${currentStep}`} />}
          {step.kind === 'finish' && <div className="pt-1"><ExamplePrompts /></div>}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handlePrev} disabled={isFirstStep} className="text-muted-foreground h-8">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {isLastStep && (
              <Button variant="outline" size="sm" onClick={() => { completeTour(); navigate('/dashboard'); }} className="h-8">
                Go to Dashboard
              </Button>
            )}
            <Button variant="gradient" size="sm" onClick={handleNext} className="h-8">
              {isLastStep ? (<>Finish <ArrowRight className="h-4 w-4 ml-1" /></>)
                : step.clickToAdvance ? (<>Skip step <ChevronRight className="h-4 w-4 ml-1" /></>)
                : (<>Next <ChevronRight className="h-4 w-4 ml-1" /></>)}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
