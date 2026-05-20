import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useState, useMemo } from 'react';
import {
  Search as SearchIcon,
  Activity,
  ClipboardCheck,
  Mail,
  CalendarClock,
  FileText,
  TrendingUp,
  Globe2,
  Database,
  LineChart,
  Sparkles,
  Lock,
  type LucideIcon,
} from 'lucide-react';

interface CatalogAgent {
  name: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
}

const CATALOG: CatalogAgent[] = [
  {
    name: 'Funding Source Matching Agent',
    subtitle: 'Automated deal intake specialist',
    description:
      'Every time a new deal enters the pipeline, it reads the deal parameters, scores every lender for fit, ranks the top matches, and prepares personalized outreach drafts — all before a human touches the deal. Eliminates 2–3 hours of manual lender research and email drafting per new deal.',
    icon: SearchIcon,
  },
  {
    name: 'Deal Monitor Agent',
    subtitle: 'Continuous background watchdog',
    description:
      'Runs daily, checks every active deal against configurable staleness thresholds, flags stale deals, stale lenders, and overdue milestones, and sends targeted alerts to the right people. Automatically escalates deals to “At Risk” when they go 11+ days without an update.',
    icon: Activity,
  },
  {
    name: 'Due Diligence Agent',
    subtitle: 'DD project manager',
    description:
      'When a deal enters the Due Diligence stage, it auto-generates the complete DD checklist based on deal type, assigns items to the right team members with due dates, and tracks completion with automated reminders and escalations.',
    icon: ClipboardCheck,
  },
  {
    name: 'Client Communication Agent',
    subtitle: 'Weekly update drafter',
    description:
      'Drafts proactive client status updates every week, or on stage changes, so the team never writes a status email from scratch. Reads the deal’s current state and generates a professional, deal-specific draft ready to review and send in one click.',
    icon: Mail,
  },
  {
    name: 'Admin Agent',
    subtitle: 'Operational chief of staff',
    description:
      'Handles morning briefings, follow-up reminders, pipeline hygiene reports, and email action extraction. Acts as a proactive chief of staff by surfacing what needs to happen next so the team can focus on execution.',
    icon: CalendarClock,
  },
  {
    name: 'Materials Agent',
    subtitle: 'Deal document creation engine',
    description:
      'Handles all deal document creation — write-ups, teasers, proposals, and executive summaries. Reads Deal Space data, applies 5th Line’s standard formats, and generates a complete draft ready for analyst review. Cuts document creation from hours to minutes.',
    icon: FileText,
  },
  {
    name: 'Analysis Agent',
    subtitle: 'Financial analyst agent',
    description:
      'Processes uploaded financial statements, calculates key metrics and ratios, identifies trends and anomalies, generates a narrative analysis, and flags anything lenders will scrutinize. Replaces hours of manual spreadsheet work with structured analysis ready for the write-up.',
    icon: TrendingUp,
  },
  {
    name: 'Research Agent',
    subtitle: 'On-demand market intelligence engine',
    description:
      'Ask it about a company, industry, lender, or market trend and it returns a structured research brief in seconds. Feeds both the Analysis Agent and the Lender Intelligence Agent.',
    icon: Globe2,
  },
  {
    name: 'Lender Intelligence Agent',
    subtitle: 'Lender knowledge system',
    description:
      'Maintains and continuously improves the funding source database. Learns from every deal interaction — submission, pass, and close — and uses that data to make the Funding Source Matching Agent smarter over time. Also monitors the market weekly for new lenders and flags relationship-building opportunities.',
    icon: Database,
  },
  {
    name: 'Revenue & Pipeline Agent',
    subtitle: 'Firm health monitor',
    description:
      'Tracks expected fees by deal stage, projects revenue for the next 30/60/90 days, monitors AR, and alerts James when pipeline health changes materially. Feeds the Insights dashboard with live data.',
    icon: LineChart,
  },
];

export function AgentCatalog() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Pre-configured Agents
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            A catalog of purpose-built agents for the 5th Line workflow. Preview only — these will activate in a future release.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents by name or subtitle..."
          className="pl-8 h-9"
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <TooltipProvider delayDuration={150}>
        {filtered.map((agent) => {
          const Icon = agent.icon;
          return (
            <Tooltip key={agent.name}>
              <TooltipTrigger asChild>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-disabled="true"
                  onClick={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
                  }}
                  className="group relative overflow-hidden border-border/60 bg-card hover:border-border transition-colors cursor-not-allowed opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-foreground/80">
                      <Icon className="h-4.5 w-4.5" size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold leading-tight text-foreground truncate">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {agent.subtitle}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="shrink-0 h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide bg-primary/10 text-primary border border-primary/20 hover:bg-primary/10"
                  >
                    Coming Soon
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {agent.description}
                </p>
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                    Preview
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/70 select-none">
                    <Lock className="h-3 w-3" />
                    Not yet available
                  </span>
                </div>
              </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="flex items-center gap-1.5 text-xs">
                  <Lock className="h-3 w-3" />
                  <span>{agent.name} is coming soon — not yet available.</span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        </TooltipProvider>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No agents match "{query}".
        </p>
      )}
    </div>
  );
}