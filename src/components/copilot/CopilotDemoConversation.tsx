import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckSquare, ListChecks, Sparkles, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { NaitiveIcon } from '@/components/NaitiveIcon';
import { useCopilotStore } from '@/stores/copilotStore';

// Sandboxed onboarding demo: fully fake, no API calls, no workspace data.
const DEMO_USER_PROMPT =
  'Show me the deals that need follow-up this week, summarize the latest status, and create action items for anything at risk.';

const DEMO_DEALS = [
  {
    name: 'Northstar HVAC',
    status: 'Waiting on updated trailing twelve-month financials — lender follow-up recommended.',
    risk: false,
  },
  {
    name: 'BluePeak Logistics',
    status: 'Term sheet expected early next week — confirm timeline with capital partner.',
    risk: true,
  },
  {
    name: 'Harbor Ridge Dental',
    status: 'Underwriting paused pending owner clarification on add-backs.',
    risk: true,
  },
];

const DEMO_ACTIONS = [
  'Follow up with Meridian Capital on BluePeak Logistics',
  'Request updated financial package for Northstar HVAC',
  'Confirm underwriting status and owner responses for Harbor Ridge Dental',
];

type Phase = 'typing-user' | 'thinking' | 'streaming' | 'done';

export function CopilotDemoConversation() {
  const setDemoTypedPrompt = useCopilotStore((s) => s.setDemoTypedPrompt);
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>('typing-user');
  const [userText, setUserText] = useState('');
  const [revealedDeals, setRevealedDeals] = useState(0);
  const [revealedActions, setRevealedActions] = useState(0);
  const [acceptedActions, setAcceptedActions] = useState<Set<number>>(new Set());
  const ranRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Animate the user prompt → typing → streaming response.
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const timers: number[] = [];
    let i = 0;
    const typeUser = window.setInterval(() => {
      i += 3;
      const slice = DEMO_USER_PROMPT.slice(0, i);
      setUserText(slice);
      setDemoTypedPrompt(slice);
      if (i >= DEMO_USER_PROMPT.length) {
        window.clearInterval(typeUser);
        timers.push(window.setTimeout(() => {
          setPhase('thinking');
          // Clear the bar input now that the message has been "sent".
          setDemoTypedPrompt('');
        }, 280));
        timers.push(window.setTimeout(() => setPhase('streaming'), 1000));
        DEMO_DEALS.forEach((_, idx) => {
          timers.push(window.setTimeout(() => setRevealedDeals(idx + 1), 1200 + idx * 550));
        });
        const actionStart = 1200 + DEMO_DEALS.length * 550 + 350;
        DEMO_ACTIONS.forEach((_, idx) => {
          timers.push(window.setTimeout(() => setRevealedActions(idx + 1), actionStart + idx * 450));
        });
        timers.push(window.setTimeout(() => setPhase('done'), actionStart + DEMO_ACTIONS.length * 450 + 300));
      }
    }, 18);
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.clearInterval(typeUser); setDemoTypedPrompt(''); };
  }, [setDemoTypedPrompt]);

  // Auto-scroll to bottom as new content streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [phase, revealedDeals, revealedActions]);

  const acceptAction = (idx: number) => {
    if (acceptedActions.has(idx)) return;
    setAcceptedActions((prev) => new Set(prev).add(idx));
    toast({
      title: 'Demo action acknowledged',
      description: 'Nothing was actually saved — this is a sandboxed walkthrough.',
    });
  };

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {/* Demo banner */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5">
        <Badge variant="outline" className="h-5 px-2 text-[10px] gap-1 border-primary/40 text-primary bg-primary/15">
          <Sparkles className="h-2.5 w-2.5" /> Demo example
        </Badge>
        <span className="text-[10px] text-muted-foreground italic">Sample data only · nothing saved</span>
      </div>

      {/* User message bubble */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div
          style={{
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: '12px 12px 2px 12px',
            background: 'rgba(126,184,247,0.12)',
            border: '1px solid rgba(126,184,247,0.22)',
            color: 'var(--foreground)',
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {userText || ' '}
          {phase === 'typing-user' && (
            <span className="ml-0.5 inline-block w-1.5 h-3.5 align-middle bg-primary/70 animate-pulse" />
          )}
        </div>
      </div>

      {/* Thinking indicator */}
      {phase === 'thinking' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
          <NaitiveIcon className="h-4 w-4 text-primary" />
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-200ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce [animation-delay:-100ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" />
          </span>
          <span>Reviewing the sample deals…</span>
        </div>
      )}

      {/* Assistant response */}
      {(phase === 'streaming' || phase === 'done') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <div className="flex items-center gap-1.5 pl-0.5">
            <div className="h-4 w-4 rounded-full bg-primary/15 flex items-center justify-center">
              <NaitiveIcon className="h-3 w-3 text-primary" />
            </div>
            <span className="text-[11px] text-muted-foreground">Naitive AI · demo</span>
          </div>
          <div
            style={{
              maxWidth: '95%',
              padding: '12px 14px',
              borderRadius: '12px 12px 12px 2px',
              background: 'var(--glass-surface)',
              border: '1px solid var(--glass-border)',
              color: 'var(--foreground)',
              fontSize: 14,
              lineHeight: 1.5,
            }}
            className="space-y-3"
          >
            {revealedDeals > 0 && (
              <div>
                <p className="text-sm text-foreground mb-2">
                  Here are the sample deals that need attention this week:
                </p>
                <div className="space-y-1.5">
                  {DEMO_DEALS.slice(0, revealedDeals).map((d) => (
                    <div
                      key={d.name}
                      className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-300"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{d.name}</span>
                        {d.risk && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-[10px] gap-1 border-destructive/40 text-destructive"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" /> At risk
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.status}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {revealedActions > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Suggested action items
                </p>
                <ul className="space-y-1.5">
                  {DEMO_ACTIONS.slice(0, revealedActions).map((a, idx) => {
                    const accepted = acceptedActions.has(idx);
                    return (
                      <li key={a} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <button
                          type="button"
                          onClick={() => acceptAction(idx)}
                          aria-pressed={accepted}
                          className={
                            'group w-full flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-all ' +
                            (accepted
                              ? 'border-primary/40 bg-primary/10 text-foreground'
                              : 'border-border/60 bg-background/40 hover:border-primary/40 hover:bg-primary/5 text-foreground cursor-pointer')
                          }
                        >
                          {accepted ? (
                            <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          ) : (
                            <CheckSquare className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          )}
                          <span className={accepted ? 'line-through opacity-80' : ''}>{a}</span>
                          {!accepted && (
                            <span className="ml-auto text-[10px] uppercase tracking-wide text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                              Add (demo)
                            </span>
                          )}
                          {accepted && (
                            <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                              Added
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {phase === 'done' && (
              <p className="text-[11px] text-muted-foreground italic">
                In your real workspace, action items appear in your task list pending your approval — Naitive AI never sends or commits without you.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
