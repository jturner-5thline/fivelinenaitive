import { useState, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LenderStagesSettings } from '@/components/settings/LenderStagesSettings';
import { LenderSubstagesSettings } from '@/components/settings/LenderSubstagesSettings';
import { PassReasonsSettings } from '@/components/settings/PassReasonsSettings';
import { TrackingStatusSettings } from '@/components/settings/TrackingStatusSettings';
import { DealTypesSettings } from '@/components/settings/DealTypesSettings';
import { DealStagesSettings } from '@/components/settings/DealStagesSettings';
import { DefaultMilestonesSettings } from '@/components/settings/DefaultMilestonesSettings';
import { ReferralSourcesSettings } from '@/components/settings/ReferralSourcesSettings';
import { SuggestionSettings } from '@/components/settings/SuggestionSettings';
import { UnifiedChecklistSettings } from '@/components/settings/UnifiedChecklistSettings';
import { LenderMatchingSettings } from '@/components/settings/LenderMatchingSettings';
import { ScheduledReportsSettings } from '@/components/settings/ScheduledReportsSettings';
import { SLARulesSettings } from '@/components/settings/SLARulesSettings';
import { StaleAlertSettings } from '@/components/settings/StaleAlertSettings';
import { PipelineSettings } from '@/components/settings/PipelineSettings';
import { EmailSnippetsSettings } from '@/components/settings/EmailSnippetsSettings';
import { EmailLabelsSettings } from '@/components/settings/EmailLabelsSettings';
import { EmailSignatureSettings } from '@/components/settings/EmailSignatureSettings';
import { DealInfoFieldsSettings } from '@/components/settings/DealInfoFieldsSettings';
import { WriteUpFieldsSettings } from '@/components/settings/WriteUpFieldsSettings';
import { GammaTemplatesSettings } from '@/components/settings/GammaTemplatesSettings';
import { LenderScoreSettings } from '@/components/settings/LenderScoreSettings';
import { DisclaimerSettings } from '@/components/settings/DisclaimerSettings';
import { DistributionStatsSettings } from '@/components/settings/DistributionStatsSettings';
import { AgreementTemplatesSettings } from '@/components/agreement/AgreementTemplatesSettings';
import { KPICardSettings } from '@/components/settings/KPICardSettings';
import { AIConfigurationSettings } from '@/components/settings/AIConfigurationSettings';
import { AICopilotSettings } from '@/components/settings/AICopilotSettings';
import { MeetingTitleSettings } from '@/components/settings/MeetingTitleSettings';
import { WorkingHoursSettings } from '@/components/settings/WorkingHoursSettings';
import { OutboundEmailTemplatesSettings } from '@/components/settings/OutboundEmailTemplatesSettings';
import { EmailWorkflowsSettings } from '@/components/settings/EmailWorkflowsSettings';
import { EmailStyleGuideSettings } from '@/components/settings/EmailStyleGuideSettings';
import { EmailCadenceSettings } from '@/components/settings/EmailCadenceSettings';
import { PartnerRulesSettings } from '@/components/settings/PartnerRulesSettings';
import { ContactTypesSettings } from '@/components/settings/ContactTypesSettings';
import { useCanEditPartnerRules } from '@/hooks/usePartnerRules';
import { useCompany } from '@/hooks/useCompany';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { usePendingJoinRequestCount } from '@/hooks/usePendingJoinRequestCount';

const SETTINGS_SECTIONS = [
  { id: 'account', keywords: ['account', 'profile', 'personal', 'info', 'details', 'email', 'name', 'avatar'] },
  { id: 'company', keywords: ['company', 'team', 'organization', 'members', 'admin', 'logo', 'industry', 'employees'] },
  { id: 'database', keywords: ['database', 'lenders', 'directory', 'data', 'directories'] },
  { id: 'workflows', keywords: ['workflows', 'workflow', 'automation', 'automate', 'triggers', 'actions'] },
  { id: 'lender-stages', keywords: ['lender', 'stages', 'stage', 'pipeline', 'workflow', 'status', 'group', 'active', 'closed'] },
  { id: 'lender-milestones', keywords: ['lender', 'milestones', 'milestone', 'substage', 'tracking', 'progress'] },
  { id: 'pass-reasons', keywords: ['pass', 'reasons', 'reason', 'decline', 'reject', 'lender'] },
  { id: 'deal-types', keywords: ['deal', 'types', 'type', 'category', 'classification'] },
  { id: 'pipelines', keywords: ['pipeline', 'pipelines', 'kanban', 'board', 'workflow', 'deal', 'stages', 'manage'] },
  { id: 'deal-info-fields', keywords: ['deal', 'information', 'fields', 'card', 'layout', 'order', 'visibility', 'configure'] },
  { id: 'writeup-fields', keywords: ['write', 'writeup', 'write-up', 'fields', 'configure', 'labels', 'required', 'overview'] },
  { id: 'deal-stages', keywords: ['deal', 'stages', 'stage', 'pipeline', 'progression', 'workflow'] },
  { id: 'default-milestones', keywords: ['default', 'milestones', 'milestone', 'templates', 'automatic', 'deal'] },
  { id: 'referral-sources', keywords: ['referral', 'sources', 'source', 'referred', 'by', 'referrer'] },
  { id: 'suggestions', keywords: ['suggestions', 'smart', 'alerts', 'warnings', 'reminders', 'opportunities', 'ai'] },
  { id: 'lender-matching', keywords: ['lender', 'matching', 'algorithm', 'scoring', 'weight', 'priority', 'criteria', 'suggested'] },
  { id: 'data-room-checklist', keywords: ['data', 'room', 'checklist', 'documents', 'required', 'files', 'information', 'items'] },
  { id: 'gamma-templates', keywords: ['gamma', 'templates', 'presentation', 'document', 'pitch', 'status', 'update'] },
  { id: 'agreement-templates', keywords: ['agreement', 'templates', 'legal', 'advisory', 'drafter', 'contract', 'engagement'] },
  { id: 'preferences', keywords: ['preferences', 'theme', 'notifications', 'regional', 'settings', 'dark', 'light', 'mode'] },
  { id: 'scheduled-reports', keywords: ['scheduled', 'reports', 'report', 'automation', 'pipeline', 'summary', 'recurring'] },
  { id: 'sla-rules', keywords: ['sla', 'rules', 'stale', 'alert', 'monitoring', 'deal', 'activity', 'timeout'] },
  { id: 'zapier', keywords: ['zapier', 'webhook', 'integration', 'automation', 'connect', 'zap'] },
  { id: 'stale-alerts', keywords: ['stale', 'deal', 'alert', 'email', 'notification', 'manager', 'admin', 'attention'] },
  { id: 'email-snippets', keywords: ['email', 'snippets', 'snippet', 'template', 'templates', 'reusable', 'tokens', 'hubspot'] },
  { id: 'email-labels', keywords: ['email', 'labels', 'label', 'tags', 'rules', 'auto', 'smart', 'categorize'] },
  { id: 'email-signature', keywords: ['email', 'signature', 'sign', 'off', 'closing', 'best', 'regards', 'name'] },
  { id: 'email-templates-outbound', keywords: ['email', 'templates', 'outbound', 'lender', 'submission', 'sequence', 'body', 'compose'] },
  { id: 'email-style-guide', keywords: ['email', 'style', 'guide', 'voice', 'tone', 'signature', 'greeting', 'closing', 'ai', 'draft', 'reply', '5th line'] },
  { id: 'email-cadence', keywords: ['email', 'cadence', 'learn', 'follow', 'up', 'frequency', 'tone', 'rhythm', 'history', 'inbox', 'scan', 'ai'] },
  { id: 'distribution-stats', keywords: ['distribution', 'stats', 'tracking', 'internal', 'ip', 'bot', 'clean', 'filter', 'opens', 'clicks'] },
  { id: 'kpi-card-settings', keywords: ['kpi', 'summary', 'card', 'metrics', 'dashboard', 'format', 'trend', 'comparison'] },
  { id: 'field-layout', keywords: ['field', 'layout', 'editor', 'hubspot', 'contacts', 'companies', 'crm', 'fields', 'sections'] },
  { id: 'ai-configuration', keywords: ['ai', 'claude', 'anthropic', 'artificial', 'intelligence', 'model', 'temperature', 'tokens', 'chatbot'] },
  { id: 'meeting-titles', keywords: ['meeting', 'titles', 'title', 'calendar', 'invite', 'event', 'subject', 'template', 'ai', 'assistant', 'stage'] },
  { id: 'partner-rules', keywords: ['sales', 'bd', 'partner', 'partners', 'tier', 'tiers', 'rules', 'definitions', 'channel', 'channels', 'criteria'] },
  { id: 'contact-types', keywords: ['contact', 'types', 'type', 'banker', 'lender', 'client', 'prospect', 'crm', 'dropdown', 'options'] },
];

// Tab definitions with which section IDs belong to each
const TABS = [
  { id: 'general', label: 'General', sectionIds: ['account', 'company', 'preferences', 'database'] },
  { id: 'deals', label: 'Deals', sectionIds: ['deal-types', 'pipelines', 'deal-info-fields', 'writeup-fields', 'deal-stages', 'default-milestones', 'referral-sources', 'data-room-checklist', 'gamma-templates', 'agreement-templates'] },
  { id: 'lenders', label: 'Lenders', sectionIds: ['lender-stages', 'lender-milestones', 'pass-reasons', 'lender-matching'] },
  { id: 'automation', label: 'Automation', sectionIds: ['workflows', 'suggestions', 'scheduled-reports', 'sla-rules', 'stale-alerts', 'zapier'] },
  { id: 'email', label: 'Email', sectionIds: ['email-snippets', 'email-labels', 'email-signature', 'email-templates-outbound', 'email-style-guide', 'email-cadence', 'distribution-stats'] },
  { id: 'metrics', label: 'Metrics', sectionIds: ['kpi-card-settings'] },
  { id: 'crm', label: 'CRM', sectionIds: ['field-layout', 'contact-types'] },
  { id: 'ai', label: 'AI', sectionIds: ['ai-configuration', 'meeting-titles'] },
  { id: 'sales-bd', label: 'Sales & BD', sectionIds: ['partner-rules'] },
];

function LinkCard({ to, title, description, badge }: { to: string; title: string; description: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors border"
    >
      <div>
        <p className="font-medium flex items-center gap-2">
          {title}
          {badge != null && badge > 0 && (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold flex items-center justify-center">
              {badge}
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </Link>
  );
}

export default function Settings() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'general';
  const [activeTab, setActiveTab] = useState(initialTab);
  // Keep activeTab in sync with URL changes (e.g. CTA links from other pages).
  // Only re-syncs when the URL itself changes — never when user clicks a tab —
  // so the in-page click handler stays the source of truth for tab switches.
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Click handler: update local state AND URL so the active panel always
  // matches the highlighted tab, even if a downstream effect re-reads the URL.
  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };
  const { isAdmin } = useCompany();
  const { features: companyFeatures } = useCompanyFeatures();
  const { hasPageAccess } = usePageAccessFlags();
  const { data: pendingJoinCount = 0 } = usePendingJoinRequestCount();
  const canEditPartnerRules = useCanEditPartnerRules();

  const visibleSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return SETTINGS_SECTIONS.map(s => s.id);
    }
    
    const query = searchQuery.toLowerCase();
    return SETTINGS_SECTIONS
      .filter(section => 
        section.keywords.some(keyword => keyword.includes(query)) ||
        section.id.includes(query)
      )
      .map(s => s.id);
  }, [searchQuery]);

  const isVisible = (id: string) => visibleSections.includes(id);

  // Filter tabs based on feature flags — hide Automation if workflows disabled
  const availableTabs = useMemo(() => {
    return TABS.filter(tab => {
      if (tab.id === 'automation' && !companyFeatures.workflows_enabled) return false;
      // Sales & BD tab: only visible to admins or allowlisted partner-rules editors
      if (tab.id === 'sales-bd' && !isAdmin && !canEditPartnerRules) return false;
      return true;
    });
  }, [companyFeatures.workflows_enabled, isAdmin, canEditPartnerRules]);

  // When searching, find the first tab that has matching results and switch to it
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return availableTabs;
    return availableTabs.filter(tab => tab.sectionIds.some(id => visibleSections.includes(id)));
  }, [searchQuery, visibleSections, availableTabs]);

  // Auto-switch to first matching tab when searching
  const effectiveTab = useMemo(() => {
    if (!searchQuery.trim()) return activeTab;
    if (filteredTabs.length > 0 && !filteredTabs.find(t => t.id === activeTab)) {
      return filteredTabs[0].id;
    }
    return activeTab;
  }, [searchQuery, filteredTabs, activeTab]);

  return (
    <>
      <Helmet>
        <title>Settings - naitive</title>
        <meta name="description" content="Manage application settings" />
      </Helmet>

      <div className="bg-background min-h-full pb-24">

        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">Settings</h1>
                <p className="text-muted-foreground">Manage your application settings</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {filteredTabs.length === 0 && searchQuery && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No settings found matching "{searchQuery}"</p>
                <Button variant="link" onClick={() => setSearchQuery('')} className="mt-2">
                  Clear search
                </Button>
              </div>
            )}

            {filteredTabs.length > 0 && (
              <Tabs value={effectiveTab} onValueChange={handleTabChange}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  {filteredTabs.map(tab => (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* General Tab */}
                <TabsContent value="general" className="space-y-4 mt-4">
                  {isVisible('account') && (
                    <LinkCard to="/account" title="Account" description="Your personal profile, security, and notification preferences" />
                  )}
                  {isVisible('company') && (
                    <LinkCard to="/company" title="Company" description="Company profile, team members, and roles" badge={pendingJoinCount} />
                  )}
                  {isVisible('preferences') && (
                    <LinkCard to="/preferences" title="Preferences" description="Theme, notifications, and regional settings" />
                  )}
                  {isVisible('database') && (
                    <LinkCard to="/database" title="Database" description="View and manage your directories and data" />
                  )}
                </TabsContent>

                {/* Deals Tab */}
                <TabsContent value="deals" className="space-y-4 mt-4">
                  {isVisible('deal-types') && <DealTypesSettings isAdmin={isAdmin} />}
                  {isVisible('pipelines') && <PipelineSettings isAdmin={isAdmin} />}
                  {isVisible('deal-info-fields') && <DealInfoFieldsSettings isAdmin={isAdmin} />}
                  {isVisible('writeup-fields') && <WriteUpFieldsSettings isAdmin={isAdmin} />}
                  {isVisible('deal-stages') && <DealStagesSettings isAdmin={isAdmin} />}
                  {isVisible('default-milestones') && <DefaultMilestonesSettings isAdmin={isAdmin} />}
                  {isVisible('referral-sources') && <ReferralSourcesSettings isAdmin={isAdmin} />}
                  {isVisible('data-room-checklist') && <UnifiedChecklistSettings isAdmin={isAdmin} />}
                  {isVisible('gamma-templates') && <GammaTemplatesSettings isAdmin={isAdmin} />}
                  {isVisible('agreement-templates') && companyFeatures.agreement_icon_visible && hasPageAccess('agreement_drafter') && (
                    <AgreementTemplatesSettings isAdmin={isAdmin} />
                  )}
                  {isVisible('deal-types') && <LenderScoreSettings isAdmin={isAdmin} />}
                  {isVisible('deal-types') && <DisclaimerSettings isAdmin={isAdmin} />}
                </TabsContent>

                {/* Lenders Tab */}
                <TabsContent value="lenders" className="space-y-4 mt-4">
                  {isVisible('lender-stages') && <LenderStagesSettings isAdmin={isAdmin} />}
                  {isVisible('lender-milestones') && <LenderSubstagesSettings isAdmin={isAdmin} />}
                  {isVisible('pass-reasons') && <PassReasonsSettings isAdmin={isAdmin} />}
                  {isVisible('lender-stages') && <TrackingStatusSettings isAdmin={isAdmin} />}
                  {isVisible('lender-matching') && <LenderMatchingSettings />}
                </TabsContent>

                {/* Automation Tab — only shown when workflows_enabled */}
                {companyFeatures.workflows_enabled && (
                  <TabsContent value="automation" className="space-y-4 mt-4">
                    {isVisible('workflows') && (
                      <LinkCard to="/workflows" title="Workflows" description="Create and manage automated workflows" />
                    )}
                    {isVisible('suggestions') && <SuggestionSettings />}
                    {isVisible('scheduled-reports') && <ScheduledReportsSettings />}
                    {isVisible('sla-rules') && <SLARulesSettings />}
                    {isVisible('stale-alerts') && <StaleAlertSettings isAdmin={isAdmin} />}
                    {isVisible('zapier') && (
                      <LinkCard to="/integrations?tab=zapier" title="Zapier" description="Manage Zapier webhooks and event triggers" />
                    )}
                  </TabsContent>
                )}

                {/* Email Tab */}
                <TabsContent value="email" className="space-y-4 mt-4">
                  {isVisible('email-signature') && <EmailSignatureSettings />}
                  {isVisible('email-snippets') && <EmailSnippetsSettings />}
                  {isVisible('email-labels') && <EmailLabelsSettings />}
                  {isVisible('email-templates-outbound') && <OutboundEmailTemplatesSettings isAdmin={isAdmin} />}
                  {isVisible('email-style-guide') && <EmailStyleGuideSettings isAdmin={isAdmin} />}
                  {isVisible('email-cadence') && <EmailCadenceSettings />}
                  <EmailWorkflowsSettings isAdmin={isAdmin} />
                  {isVisible('distribution-stats') && <DistributionStatsSettings />}
                </TabsContent>

                {/* Metrics Tab */}
                <TabsContent value="metrics" className="space-y-4 mt-4">
                  {isVisible('kpi-card-settings') && <KPICardSettings isAdmin={isAdmin} />}
                </TabsContent>

                {/* CRM Tab */}
                <TabsContent value="crm" className="space-y-4 mt-4">
                  {isVisible('field-layout') && (
                    <LinkCard to="/field-layout-editor" title="Field Layout Editor" description="Configure how contact and company fields are displayed on detail pages" />
                  )}
                  {isVisible('contact-types') && <ContactTypesSettings isAdmin={isAdmin} />}
                </TabsContent>

                {/* AI Tab */}
                <TabsContent value="ai" className="space-y-4 mt-4">
                  {isVisible('ai-configuration') && (
                    <AIConfigurationSettings isAdmin={isAdmin} />
                  )}
                  <AICopilotSettings />
                  {isVisible('meeting-titles') && (
                    <MeetingTitleSettings isAdmin={isAdmin} />
                  )}
                  <WorkingHoursSettings />
                </TabsContent>

                {/* Sales & BD Tab */}
                <TabsContent value="sales-bd" className="space-y-4 mt-4">
                  {isVisible('partner-rules') && <PartnerRulesSettings />}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
