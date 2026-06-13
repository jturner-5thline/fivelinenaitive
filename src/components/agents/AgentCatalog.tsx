import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useMemo } from 'react';
import {
  Search as SearchIcon,
  FolderOpen,
  Mail,
  ClipboardList,
  FileText,
  TrendingUp,
  Globe2,
  LineChart,
  Sparkles,
  Banknote,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AdminAgentDuty1Config } from './admin-agent/AdminAgentDuty1Config';

interface CatalogAgent {
  name: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  /** Stable key the configure dialog uses to pick the right config surface. */
  configKey?: 'admin-agent';
}

const CATALOG: CatalogAgent[] = [
  {
    name: 'Admin Agent',
    subtitle: 'Operational copilot · Verify Deal Information',
    description:
      'Audits active deals for stale or missing critical updates — status, stage, milestones, status notes, and per-lender funding sources — and surfaces findings in Ask nAItive AI for review.',
    icon: ShieldCheck,
    configKey: 'admin-agent',
  },
  {
    name: 'Data Room Manager',
    subtitle: 'Document & VDR specialist',
    description:
      'Organizes and manages deal-related documents, files, and data room access for borrowers and lenders.',
    icon: FolderOpen,
  },
  {
    name: 'Financial Analyst',
    subtitle: 'Statements & metrics analyst',
    description:
      'Reviews financial statements, models, and metrics; generates analysis summaries and flags key risks or highlights.',
    icon: TrendingUp,
  },
  {
    name: 'Funding Source Sourcing',
    subtitle: 'Lender matching engine',
    description:
      'Identifies and matches potential lenders or capital sources based on deal parameters and borrower profile.',
    icon: Banknote,
  },
  {
    name: 'Materials',
    subtitle: 'Teasers, memos & decks',
    description:
      'Creates and formats deal materials including teasers, memos, one-pagers, and pitch decks.',
    icon: FileText,
  },
  {
    name: 'Deal Admin',
    subtitle: 'Lifecycle & workflow coordinator',
    description:
      'Handles deal lifecycle administration: status updates, task tracking, deadline management, and workflow coordination.',
    icon: ClipboardList,
  },
  {
    name: 'Communication',
    subtitle: 'Outbound correspondence drafter',
    description:
      'Drafts and manages outbound communications to lenders, borrowers, and counterparties; logs correspondence to the deal record.',
    icon: Mail,
  },
  {
    name: 'Research',
    subtitle: 'Market & company intelligence',
    description:
      'Conducts market, sector, and company research to support deal underwriting and sourcing decisions.',
    icon: Globe2,
  },
  {
    name: 'Revenue & Pipeline',
    subtitle: 'BD & pipeline reporting',
    description:
      'Tracks pipeline activity, revenue projections, deal stages, and provides reporting on business development metrics.',
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
            A catalog of purpose-built agents for the 5th Line workflow.
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
        {filtered.map((agent) => {
          const Icon = agent.icon;
          return (
            <Card
              key={agent.name}
              className="group relative overflow-hidden border-border/60 bg-card hover:border-border transition-colors"
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
                    Available
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {agent.description}
                </p>
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    Configure
                  </Button>
                  <Button size="sm" className="h-7 text-xs">
                    Activate
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No agents match "{query}".
        </p>
      )}
    </div>
  );
}