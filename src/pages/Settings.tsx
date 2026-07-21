import { useState, useMemo, useEffect, useCallback, ComponentType } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Briefcase,
  Building2,
  Plug,
  Sparkles,
  Landmark,
  Mail,
  Eye,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { LenderStagesSettings } from '@/components/settings/LenderStagesSettings';
import { LenderSubstagesSettings } from '@/components/settings/LenderSubstagesSettings';
import { PassReasonsSettings } from '@/components/settings/PassReasonsSettings';
import { TrackingStatusSettings } from '@/components/settings/TrackingStatusSettings';
import { DealTypesSettings } from '@/components/settings/DealTypesSettings';
import { DealStagesSettings } from '@/components/settings/DealStagesSettings';
import { DefaultMilestonesSettings } from '@/components/settings/DefaultMilestonesSettings';
import { SuggestionSettings } from '@/components/settings/SuggestionSettings';
import { UnifiedChecklistSettings } from '@/components/settings/UnifiedChecklistSettings';
import { LenderMatchingSettings } from '@/components/settings/LenderMatchingSettings';
import { ScheduledReportsSettings } from '@/components/settings/ScheduledReportsSettings';
import { SLARulesSettings } from '@/components/settings/SLARulesSettings';
import { StaleAlertSettings } from '@/components/settings/StaleAlertSettings';
import { PipelineSettings } from '@/components/settings/PipelineSettings';
import { EmailSnippetsSettings } from '@/components/settings/EmailSnippetsSettings';
import { EmailSignatureSettings } from '@/components/settings/EmailSignatureSettings';
import { DealInfoFieldsSettings } from '@/components/settings/DealInfoFieldsSettings';
import { WriteUpFieldsSettings } from '@/components/settings/WriteUpFieldsSettings';
import { GammaTemplatesSettings } from '@/components/settings/GammaTemplatesSettings';
import { DisclaimerSettings } from '@/components/settings/DisclaimerSettings';
import { AgreementTemplatesSettings } from '@/components/agreement/AgreementTemplatesSettings';
import { KPICardSettings } from '@/components/settings/KPICardSettings';
import { AIConfigurationSettings } from '@/components/settings/AIConfigurationSettings';
import { AICopilotSettings } from '@/components/settings/AICopilotSettings';
import { MeetingTitleSettings } from '@/components/settings/MeetingTitleSettings';
import { WorkingHoursSettings } from '@/components/settings/WorkingHoursSettings';
import { AvailabilityVerificationSettings } from '@/components/settings/AvailabilityVerificationSettings';
import { OutboundEmailTemplatesSettings } from '@/components/settings/OutboundEmailTemplatesSettings';
import { EmailWorkflowsSettings } from '@/components/settings/EmailWorkflowsSettings';
import { EmailStyleGuideSettings } from '@/components/settings/EmailStyleGuideSettings';
import { EmailCadenceSettings } from '@/components/settings/EmailCadenceSettings';
import { PartnerRulesSettings } from '@/components/settings/PartnerRulesSettings';
import { ContactTypesSettings } from '@/components/settings/ContactTypesSettings';
import Account from '@/pages/Account';
import Company from '@/pages/Company';
import Preferences from '@/pages/Preferences';
import { useCanEditPartnerRules } from '@/hooks/usePartnerRules';
import { useCompany } from '@/hooks/useCompany';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { usePendingJoinRequestCount } from '@/hooks/usePendingJoinRequestCount';

type SectionDef = {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  render?: (ctx: { isAdmin: boolean }) => JSX.Element | null;
  href?: string; // external link instead of inline render
  badge?: number;
  visible?: (ctx: GateCtx) => boolean;
};

type GroupDef = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  sections: SectionDef[];
  visible?: (ctx: GateCtx) => boolean;
};

type GateCtx = {
  isAdmin: boolean;
  workflowsEnabled: boolean;
  agreementVisible: boolean;
  agreementAccess: boolean;
  canEditPartnerRules: boolean;
  gammaEnabled: boolean;
};

const buildGroups = (ctx: { pendingJoinCount: number }): GroupDef[] => [
  {
    id: 'workspace',
    label: 'Workspace',
    icon: Building2,
    sections: [
      {
        id: 'account',
        label: 'Account',
        description: 'Your personal profile, security, and notification preferences.',
        keywords: ['account', 'profile', 'personal', 'email', 'name', 'avatar', 'security', '2fa'],
        render: () => <Account />,
      },
      {
        id: 'company',
        label: 'Company',
        description: 'Company profile, team members, and roles.',
        keywords: ['company', 'team', 'organization', 'members', 'admin', 'logo', 'industry', 'employees', 'roles'],
        render: () => <Company />,
        badge: ctx.pendingJoinCount,
      },
      {
        id: 'preferences',
        label: 'Preferences',
        description: 'Theme, notifications, and regional settings.',
        keywords: ['preferences', 'theme', 'dark', 'light', 'regional', 'timezone'],
        render: () => <Preferences />,
      },
    ],
  },
  {
    id: 'deals',
    label: 'Deals',
    icon: Briefcase,
    sections: [
      {
        id: 'pipelines',
        label: 'Pipelines',
        description: 'Configure deal pipelines and their stages.',
        keywords: ['pipeline', 'pipelines', 'kanban', 'board'],
        render: ({ isAdmin }) => <PipelineSettings isAdmin={isAdmin} />,
      },
      {
        id: 'deal-stages',
        label: 'Stages',
        description: 'Stages used in the active deal pipeline.',
        keywords: ['deal', 'stages', 'stage', 'progression', 'workflow', 'kanban'],
        render: ({ isAdmin }) => <DealStagesSettings isAdmin={isAdmin} />,
      },
      {
        id: 'deal-info',
        label: 'Deal Info',
        description: 'Deal types and the information cards/fields shown on each deal.',
        keywords: ['deal', 'info', 'information', 'types', 'type', 'category', 'fields', 'card', 'layout', 'order', 'visibility'],
        render: ({ isAdmin }) => (
          <>
            <DealTypesSettings isAdmin={isAdmin} />
            <DealInfoFieldsSettings isAdmin={isAdmin} />
          </>
        ),
      },
      {
        id: 'writeup-fields',
        label: 'Write-Up',
        description: 'Write-up labels, required fields, overview, and disclaimer text.',
        keywords: ['write', 'writeup', 'fields', 'labels', 'required', 'overview', 'disclaimer', 'legal', 'footer'],
        render: ({ isAdmin }) => (
          <>
            <WriteUpFieldsSettings isAdmin={isAdmin} />
            <DisclaimerSettings isAdmin={isAdmin} />
          </>
        ),
      },
      {
        id: 'default-milestones',
        label: 'Milestones',
        description: 'Templates applied automatically to new deals.',
        keywords: ['default', 'milestones', 'milestone', 'templates'],
        render: ({ isAdmin }) => <DefaultMilestonesSettings isAdmin={isAdmin} />,
      },
      {
        id: 'data-room-checklist',
        label: 'Data Room',
        description: 'Document checklist templates by deal type.',
        keywords: ['data', 'room', 'checklist', 'documents', 'required'],
        render: ({ isAdmin }) => <UnifiedChecklistSettings isAdmin={isAdmin} />,
      },
      {
        id: 'gamma-templates',
        label: 'Gamma',
        description: 'Presentation templates for pitches and status updates.',
        keywords: ['gamma', 'templates', 'presentation', 'pitch'],
        visible: () => false,
        render: ({ isAdmin }) => <GammaTemplatesSettings isAdmin={isAdmin} />,
      },
      {
        id: 'agreement-templates',
        label: 'Agreements',
        description: 'Legal templates for advisory and engagement agreements.',
        keywords: ['agreement', 'templates', 'legal', 'advisory', 'contract'],
        visible: (g) => g.agreementVisible && g.agreementAccess,
        render: ({ isAdmin }) => <AgreementTemplatesSettings isAdmin={isAdmin} />,
      },
    ],
  },
  {
    id: 'funding-sources',
    label: 'Funding Sources',
    icon: Landmark,
    sections: [
      {
        id: 'lender-stages',
        label: 'Stages',
        description: 'Stages used across the lender pipeline.',
        keywords: ['lender', 'stages', 'stage', 'group', 'active', 'closed'],
        render: ({ isAdmin }) => <LenderStagesSettings isAdmin={isAdmin} />,
      },
      {
        id: 'lender-milestones',
        label: 'Milestones',
        description: 'Substages tracking progress within a stage.',
        keywords: ['lender', 'milestones', 'milestone', 'substage', 'tracking', 'progress'],
        render: ({ isAdmin }) => <LenderSubstagesSettings isAdmin={isAdmin} />,
      },
      {
        id: 'pass-reasons',
        label: 'Pass Reasons',
        description: 'Reasons captured when a lender passes on a deal.',
        keywords: ['pass', 'reasons', 'decline', 'reject'],
        render: ({ isAdmin }) => <PassReasonsSettings isAdmin={isAdmin} />,
      },
      {
        id: 'tracking-statuses',
        label: 'Tracking Statuses',
        description: 'Status tags for tracked lender activity.',
        keywords: ['tracking', 'status', 'lender'],
        render: ({ isAdmin }) => <TrackingStatusSettings isAdmin={isAdmin} />,
      },
      {
        id: 'lender-matching',
        label: 'Matching',
        description: 'Configure algorithm criteria for suggested lenders.',
        keywords: ['lender', 'matching', 'algorithm', 'criteria', 'suggested'],
        render: () => <LenderMatchingSettings />,
      },
    ],
  },
  {
    id: 'communications',
    label: 'Communications',
    icon: Mail,
    sections: [
      {
        id: 'email-signature',
        label: 'Signature',
        description: 'Signature appended to outbound email.',
        keywords: ['email', 'signature', 'sign-off', 'closing'],
        render: () => <EmailSignatureSettings />,
      },
      {
        id: 'email-snippets',
        label: 'Snippets',
        description: 'Reusable email templates and tokens.',
        keywords: ['email', 'snippets', 'template', 'tokens'],
        render: () => <EmailSnippetsSettings />,
      },
      {
        id: 'email-templates-outbound',
        label: 'Outbound Templates',
        description: 'Lender submission sequences and outbound bodies.',
        keywords: ['email', 'templates', 'outbound', 'lender', 'submission', 'sequence'],
        render: ({ isAdmin }) => <OutboundEmailTemplatesSettings isAdmin={isAdmin} />,
      },
      {
        id: 'email-style-guide',
        label: 'Style Guide',
        description: 'Voice, tone, and AI-draft style.',
        keywords: ['email', 'style', 'voice', 'tone', 'ai', 'draft'],
        render: ({ isAdmin }) => <EmailStyleGuideSettings isAdmin={isAdmin} />,
      },
      {
        id: 'email-cadence',
        label: 'Cadence',
        description: 'Learn and apply follow-up frequency.',
        keywords: ['email', 'cadence', 'follow-up', 'frequency', 'rhythm'],
        render: () => <EmailCadenceSettings />,
      },
      {
        id: 'email-workflows',
        label: 'Email Workflows',
        description: 'Triggered email workflows.',
        keywords: ['email', 'workflows', 'triggers'],
        render: ({ isAdmin }) => <EmailWorkflowsSettings isAdmin={isAdmin} />,
      },
    ],
  },
];

const LAST_PATH_KEY = 'naitive:settings:lastPath';

function findSection(groups: GroupDef[], groupId?: string, sectionId?: string) {
  const group = groups.find((g) => g.id === groupId) || groups[0];
  const section =
    group?.sections.find((s) => s.id === sectionId) || group?.sections[0];
  return { group, section };
}

export default function Settings() {
  const { group: groupParam, section: sectionParam } = useParams<{
    group?: string;
    section?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { isAdmin } = useCompany();
  const { features: companyFeatures } = useCompanyFeatures();
  const { hasPageAccess } = usePageAccessFlags();
  const { data: pendingJoinCount = 0 } = usePendingJoinRequestCount();
  const canEditPartnerRules = useCanEditPartnerRules();

  const gateCtx: GateCtx = {
    isAdmin,
    workflowsEnabled: !!companyFeatures.workflows_enabled,
    agreementVisible: !!companyFeatures.agreement_icon_visible,
    agreementAccess: hasPageAccess('agreement_drafter'),
    canEditPartnerRules: !!canEditPartnerRules,
    gammaEnabled: !!companyFeatures.gamma_enabled,
  };

  const allGroups = useMemo(() => buildGroups({ pendingJoinCount }), [pendingJoinCount]);
  const groups = useMemo(
    () =>
      allGroups
        .filter((g) => (g.visible ? g.visible(gateCtx) : true))
        .map((g) => ({
          ...g,
          sections: g.sections.filter((s) => (s.visible ? s.visible(gateCtx) : true)),
        }))
        .filter((g) => g.sections.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allGroups, gateCtx.workflowsEnabled, gateCtx.agreementVisible, gateCtx.agreementAccess, gateCtx.isAdmin, gateCtx.canEditPartnerRules, gateCtx.gammaEnabled],
  );

  // Legacy ?tab= URL → group redirect (maintain backwards-compatibility with old links)
  useEffect(() => {
    if (groupParam || sectionParam) return;
    const legacyTab = searchParams.get('tab');
    const legacyMap: Record<string, string> = {
      general: 'workspace',
      deals: 'deals',
      lenders: 'funding-sources',
      automation: 'workspace',
      email: 'communications',
      metrics: 'workspace',
      crm: 'workspace',
      ai: 'workspace',
      'sales-bd': 'workspace',
    };
    let target = legacyTab ? legacyMap[legacyTab] : undefined;
    if (!target) {
      try {
        const stored = localStorage.getItem(LAST_PATH_KEY);
        if (
          stored &&
          stored.startsWith('/settings/') &&
          !stored.startsWith('/settings/automation-ai')
        ) {
          navigate(stored, { replace: true });
          return;
        }
      } catch {}
    }
    const g = groups.find((x) => x.id === target) || groups[0];
    if (g) navigate(`/settings/${g.id}/${g.sections[0].id}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const { group: activeGroup, section: activeSection } = findSection(
    groups,
    groupParam,
    sectionParam,
  );

  // Redirect unknown/removed groups (e.g. legacy /settings/automation-ai/*) to default
  useEffect(() => {
    if (!groupParam) return;
    const known = groups.some((g) => g.id === groupParam);
    if (!known && groups[0]) {
      navigate(`/settings/${groups[0].id}/${groups[0].sections[0].id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupParam, groups.length]);

  // Persist last-visited
  useEffect(() => {
    if (activeGroup && activeSection) {
      try {
        localStorage.setItem(
          LAST_PATH_KEY,
          `/settings/${activeGroup.id}/${activeSection.id}`,
        );
      } catch {}
    }
  }, [activeGroup?.id, activeSection?.id]);

  // External href redirect (for "Account", "Company", etc.)
  useEffect(() => {
    if (activeSection?.href && groupParam && sectionParam) {
      navigate(activeSection.href);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection?.href]);

  // ───────── Command palette ─────────
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goToSection = useCallback(
    (groupId: string, sectionId: string) => {
      const grp = groups.find((g) => g.id === groupId);
      const sec = grp?.sections.find((s) => s.id === sectionId);
      if (!grp || !sec) return;
      if (sec.href) {
        navigate(sec.href);
      } else {
        navigate(`/settings/${grp.id}/${sec.id}`);
      }
      setPaletteOpen(false);
    },
    [groups, navigate],
  );

  // Sidebar mobile sheet
  const [mobileOpen, setMobileOpen] = useState(false);

  // Aggregate badge counts for each group (e.g. pending join requests on Company).
  const groupBadge = (groupId: string) =>
    groups
      .find((g) => g.id === groupId)
      ?.sections.reduce((sum, s) => sum + (s.badge ?? 0), 0) ?? 0;

  const SidebarContent = (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Settings categories">
      {groups.map((group) => {
        const Icon = group.icon;
        const isActive = activeGroup?.id === group.id;
        const badge = groupBadge(group.id);
        return (
          <div key={group.id} className="flex flex-col">
            <button
              onClick={() => {
                const first = group.sections[0];
                if (!first) return;
                if (isActive) {
                  // collapse by navigating away — go to first group as default? Instead toggle: navigate to first section still, but if already there, do nothing (keeps expanded).
                  return;
                }
                goToSection(group.id, first.id);
                setMobileOpen(false);
              }}
              className={`group/nav text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/15 text-foreground font-medium border border-primary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border border-transparent'
              }`}
              aria-current={isActive ? 'page' : undefined}
              aria-expanded={isActive}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover/nav:text-foreground'}`} />
              <span className="truncate flex-1">{group.label}</span>
              {badge > 0 && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  {badge}
                </Badge>
              )}
              {group.sections.length > 1 && (
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground/70 transition-transform ${isActive ? 'rotate-0' : '-rotate-90'}`}
                />
              )}
            </button>
            {isActive && group.sections.length > 1 && (
              <div className="mt-0.5 mb-1 ml-6 pl-3 border-l border-white/[0.06] flex flex-col gap-0.5">
                {group.sections.map((section) => {
                  const secActive = activeSection?.id === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => {
                        goToSection(group.id, section.id);
                        setMobileOpen(false);
                      }}
                      className={`text-left flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                        secActive
                          ? 'bg-white/[0.06] text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                      }`}
                      aria-current={secActive ? 'page' : undefined}
                    >
                      <span className="truncate flex-1">{section.label}</span>
                      {section.badge != null && section.badge > 0 && (
                        <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                          {section.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <Helmet>
        <title>Settings - naitive</title>
        <meta name="description" content="Manage application settings" />
      </Helmet>

      <div className="bg-transparent min-h-full">
        <div className="flex w-full">
          {/* Sidebar — desktop */}
          <aside className="hidden md:block w-56 shrink-0 border-r border-white/[0.06] sticky top-0 self-start h-screen overflow-y-auto bg-transparent">
            <div className="px-4 pt-5 pb-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Dashboard
              </Link>
              <h1 className="text-base font-semibold tracking-tight">Settings</h1>
              <button
                onClick={() => setPaletteOpen(true)}
                className="mt-3 w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-md border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  Search…
                </span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
                  ⌘K
                </kbd>
              </button>
            </div>
            {SidebarContent}
          </aside>

          {/* Content pane */}
          <main className="flex-1 min-w-0">
            {/* Mobile header */}
            <div className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <div className="px-4 pt-5 pb-3">
                    <h1 className="text-base font-semibold tracking-tight">Settings</h1>
                  </div>
                  {SidebarContent}
                </SheetContent>
              </Sheet>
              <div className="flex-1 text-sm font-medium truncate">
                {activeGroup?.label} · {activeSection?.label}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(true)}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12">
              {/* Section header */}
              {activeSection && (
                <header className="mb-5">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 mb-1.5">
                    {activeGroup?.label}
                  </div>
                  <h2 className="text-[22px] font-semibold tracking-tight leading-tight">
                    {activeSection.label}
                  </h2>
                  {activeSection.description && (
                    <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                      {activeSection.description}
                    </p>
                  )}
                </header>
              )}

              {/* Read-only banner */}
              {!isAdmin && (
                <div className="mb-6 flex items-start gap-3 rounded-lg glass-border-soft bg-white/[0.03] px-4 py-3 text-sm">
                  <Eye className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">Read-only mode</p>
                    <p className="text-muted-foreground">
                      You're viewing settings in read-only mode. Contact an admin to
                      make changes.
                    </p>
                  </div>
                </div>
              )}

              {/* Section body */}
              <div className="space-y-4">
                {activeSection?.href ? (
                  <Link
                    to={activeSection.href}
                    className="flex items-center justify-between p-4 rounded-lg glass-border-soft bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                  >
                    <div>
                      <p className="font-medium">Open {activeSection.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {activeSection.description}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </Link>
                ) : (
                  activeSection?.render?.({ isAdmin })
                )}
              </div>
            </div>
          </main>
        </div>

        {/* Command palette */}
        <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
          <CommandInput placeholder="Search settings… (sections, fields, options)" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.label}>
                {group.sections.map((section) => (
                  <CommandItem
                    key={`${group.id}-${section.id}`}
                    value={`${group.label} ${section.label} ${section.keywords.join(' ')}`}
                    onSelect={() => goToSection(group.id, section.id)}
                  >
                    <ChevronRight className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <span>{section.label}</span>
                    {section.description && (
                      <span className="ml-2 text-xs text-muted-foreground truncate">
                        {section.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </CommandDialog>

      </div>
    </>
  );
}
