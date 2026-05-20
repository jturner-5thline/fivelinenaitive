import { cn } from '@/lib/utils';
import { Briefcase, TrendingUp, Shield, Users, BarChart3, FileSpreadsheet, Megaphone, Landmark, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface GammaTemplate {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  prompt: string;
  suggestedFormat: 'presentation' | 'document';
}

export const GAMMA_TEMPLATES: GammaTemplate[] = [
  {
    id: 'deal-summary',
    label: 'Deal Summary',
    description: 'Executive overview with key metrics & timeline',
    icon: Briefcase,
    suggestedFormat: 'presentation',
    prompt: 'Create a concise executive deal summary presentation. Include: deal overview, key financial metrics, current stage & timeline, team involved, and next steps. Keep it high-level and suitable for senior leadership review.',
  },
  {
    id: 'lender-pitch',
    label: 'Lender Pitch',
    description: 'Persuasive deck for prospective lenders',
    icon: Landmark,
    suggestedFormat: 'presentation',
    prompt: 'Create a compelling lender pitch presentation. Highlight: the opportunity & company strengths, financial performance & projections, deal structure, risk mitigations, and why lenders should participate. Make it professional and data-driven.',
  },
  {
    id: 'risk-analysis',
    label: 'Risk Analysis',
    description: 'Comprehensive risk assessment report',
    icon: Shield,
    suggestedFormat: 'document',
    prompt: 'Create a thorough risk analysis document. Cover: identified risks by category (market, credit, operational, regulatory), risk severity matrix, mitigation strategies, stress scenarios, and recommended actions. Use tables where appropriate.',
  },
  {
    id: 'pipeline-review',
    label: 'Pipeline Review',
    description: 'Lender pipeline status & engagement metrics',
    icon: TrendingUp,
    suggestedFormat: 'presentation',
    prompt: 'Create a funding source pipeline review presentation. Show: lender engagement funnel, stage distribution, key lender highlights, recent activity, stalled opportunities, and action items for follow-up. Include visual data breakdowns.',
  },
  {
    id: 'quarterly-update',
    label: 'Quarterly Update',
    description: 'Periodic progress report for stakeholders',
    icon: BarChart3,
    suggestedFormat: 'presentation',
    prompt: 'Create a professional quarterly update presentation. Include: period highlights & achievements, milestone progress, lender engagement summary, key metrics & KPIs, challenges encountered, and outlook for next quarter.',
  },
  {
    id: 'due-diligence',
    label: 'Due Diligence',
    description: 'Checklist-driven due diligence overview',
    icon: FileSpreadsheet,
    suggestedFormat: 'document',
    prompt: 'Create a structured due diligence overview document. Cover: company background, financial review, legal & compliance status, operational assessment, documentation checklist status, and outstanding items. Present as a comprehensive reference.',
  },
  {
    id: 'stakeholder-brief',
    label: 'Stakeholder Brief',
    description: 'Quick status update for internal teams',
    icon: Users,
    suggestedFormat: 'presentation',
    prompt: 'Create a brief stakeholder update. Keep it concise with: deal status at a glance, recent developments, upcoming milestones, key decisions needed, and team assignments. Maximum 6-8 slides.',
  },
  {
    id: 'marketing-memo',
    label: 'Marketing Memo',
    description: 'Deal marketing document for distribution',
    icon: Megaphone,
    suggestedFormat: 'document',
    prompt: 'Create a polished marketing memo suitable for distribution to potential lenders. Include: investment highlights, company overview, financial summary, deal terms overview, and contact information. Make it visually appealing and professional.',
  },
  {
    id: 'status-update',
    label: 'Status Update',
    description: 'Periodic client-facing deal progress report',
    icon: RefreshCw,
    suggestedFormat: 'document',
    prompt: `Create a professional client-facing status update document with the following exact structure and sections:

1. TITLE: "{Company Name} — Status Update: {Current Date}" as the main heading.

2. KEY UPDATES: A bullet-point narrative section summarizing the most important recent developments — new lender outreach, materials submitted, upcoming calls, and any process milestones. Write 4-6 concise bullet points.

3. KEY LENDERS – PROCESS STATUS & NEXT ACTIONS: A detailed table with exactly these columns: Lender | Process Stage | Key Focus Areas | Current Challenges | Next Action. Include all active lenders (not passed) with specific, actionable detail in each cell.

4. LENDER PIPELINE SNAPSHOT: A visual card-based layout grouping all lenders into pipeline stages: "On Deck", "In Review", "Terms Issued", and "Passed". Show the count in each header (e.g., "In Review (4)") and list lender names as numbered items in each group. Use distinct color coding per stage.

5. RECENT MILESTONES: Show 3 key accomplishments as individual cards with icons — each card should contain a single sentence describing a concrete achievement.

6. NEXT STEPS: Show 2-3 upcoming action items as individual cards describing what will happen next in the process.

7. WHAT WE NEED FROM YOU: A final section with any client action items, or state "No action items at this time" if none are needed.

Tone should be professional, confident, and concise. Use a clean layout with clear section headers. This is meant for external client consumption.`,
  },
];

interface GammaTemplateLibraryProps {
  selected: string | null;
  onSelect: (template: GammaTemplate) => void;
  enabledTemplateIds?: string[] | null;
}

export function GammaTemplateLibrary({ selected, onSelect, enabledTemplateIds }: GammaTemplateLibraryProps) {
  const templates = enabledTemplateIds
    ? GAMMA_TEMPLATES.filter(t => enabledTemplateIds.includes(t.id))
    : GAMMA_TEMPLATES;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {templates.map((tpl) => {
        const isActive = selected === tpl.id;
        return (
          <button
            key={tpl.id}
            type="button"
            onClick={() => onSelect(tpl)}
            className={cn(
              'group flex flex-col items-center gap-2 rounded-lg border p-3 transition-all duration-150 text-center',
              isActive
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border-border hover:border-primary/40 hover:bg-muted/30'
            )}
          >
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground group-hover:text-foreground'
              )}
            >
              <tpl.icon className="h-4 w-4" />
            </div>
            <div>
              <p className={cn('text-xs font-semibold leading-tight', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {tpl.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                {tpl.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
