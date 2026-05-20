import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import {
  Users,
  Mail,
  Calendar,
  Webhook,
  Linkedin,
  FileText,
  Database,
  CreditCard,
  MonitorSmartphone,
  ListChecks,
  PenTool,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

// Hooks
import { useHubSpot, useHubSpotContacts, useHubSpotDeals, useHubSpotCompanies } from "@/hooks/useHubSpot";
import { useQuickBooksStatus, useQuickBooksConnect, useQuickBooksDisconnect, useQuickBooksCustomers, useQuickBooksInvoices, useQuickBooksPayments } from "@/hooks/useQuickBooks";
import { useGmail } from "@/hooks/useGmail";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useCompany } from "@/hooks/useCompany";
import { useIntegrationInterest } from "@/hooks/useIntegrationInterest";
import { useMicrosoft } from "@/hooks/useMicrosoft";
import { MicrosoftUpcomingEvents } from "@/components/integrations/MicrosoftUpcomingEvents";


// Components
import { IntegrationCard, ComingSoonCard, type IntegrationStatus } from "@/components/integrations/IntegrationCard";
import { ClaapSummaryCard, ZapierSummaryCard, FlexAutomationCard } from "@/components/integrations/IntegrationSummaryCards";
import { HubSpotSyncSettingsModal } from "@/components/integrations/HubSpotSyncSettingsModal";
import { QuickBooksSyncSettingsModal } from "@/components/integrations/QuickBooksSyncSettingsModal";
import { GmailSyncSettingsModal } from "@/components/integrations/GmailSyncSettingsModal";
import { CalendarSyncSettingsModal } from "@/components/integrations/CalendarSyncSettingsModal";
import { AsanaSetupModal } from "@/components/integrations/AsanaSetupModal";
import { AsanaSyncSettingsModal } from "@/components/integrations/asana/AsanaSyncSettingsModal";
import { useCanSeeFlexSync } from "@/hooks/useCanSeeFlexSync";

const COMING_SOON_INTEGRATIONS = [
  { key: "docusign", name: "DocuSign", icon: PenTool, description: "Send and manage e-signature envelopes directly from deals" },
  { key: "webhook", name: "Webhook", icon: Webhook, description: "Send naitive event data to external services via HTTP webhooks" },
  { key: "linkedin", name: "LinkedIn", icon: Linkedin, description: "Enrich deal and contact profiles with LinkedIn data" },
  { key: "email-smtp", name: "Email SMTP", icon: Mail, description: "Send transactional emails via your own custom SMTP server" },
  { key: "document-storage", name: "Document Storage", icon: FileText, description: "Connect Dropbox or OneDrive to store and access deal documents" },
  { key: "crm-integration", name: "CRM Integration", icon: Database, description: "Sync deals with Salesforce or Pipedrive" },
];

export default function Integrations() {
  const { user } = useAuth();
  const is5thLine = user?.email?.endsWith("@5thline.co") ?? false;
  const { company, isAdmin: isCompanyAdmin } = useCompany();
  const { canSeeFlexSync } = useCanSeeFlexSync();
  const [searchParams, setSearchParams] = useSearchParams();

  // Modals
  const [hubspotModalOpen, setHubspotModalOpen] = useState(false);
  const [quickbooksModalOpen, setQuickbooksModalOpen] = useState(false);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [asanaModalOpen, setAsanaModalOpen] = useState(false);
  const [asanaSyncModalOpen, setAsanaSyncModalOpen] = useState(false);

  // === HubSpot ===
  const hubspot = useHubSpot();
  const { data: contactsData } = useHubSpotContacts();
  const { data: dealsData } = useHubSpotDeals();
  const { data: companiesData } = useHubSpotCompanies();
  const [hubspotStatus, setHubspotStatus] = useState<IntegrationStatus>("disconnected");
  const [hubspotChecked, setHubspotChecked] = useState(false);

  // === QuickBooks ===
  const { data: qbStatus, isLoading: qbLoading } = useQuickBooksStatus();
  const qbConnect = useQuickBooksConnect();
  const qbDisconnect = useQuickBooksDisconnect();
  const qbConnections = qbStatus?.connections || [];
  const firstRealm = qbConnections[0]?.realmId;
  const { data: qbCustomers = [] } = useQuickBooksCustomers(firstRealm);
  const { data: qbInvoices = [] } = useQuickBooksInvoices(firstRealm);
  const { data: qbPayments = [] } = useQuickBooksPayments(firstRealm);

  // === Gmail ===
  const gmail = useGmail();

  // === Calendar ===
  const calendar = useGoogleCalendar();

  // === Microsoft ===
  const microsoft = useMicrosoft();


  // === Claap/Zapier from integrations table ===
  const { integrations } = useIntegrations();
  const claapIntegration = integrations.find((i) => i.type === "claap");

  // === Coming Soon Interest ===
  const { interests, notifyMe } = useIntegrationInterest();

  // Handle OAuth callbacks
  useEffect(() => {
    const qbParam = searchParams.get("qb");
    const qbError = searchParams.get("error");
    const legacyStatus = searchParams.get("quickbooks");

    if (qbParam === "success" || legacyStatus === "connected") {
      toast.success("QuickBooks connected successfully!");
      searchParams.delete("qb");
      searchParams.delete("quickbooks");
      setSearchParams(searchParams, { replace: true });
    } else if (qbParam === "error" || qbError) {
      toast.error("QuickBooks connection failed", { description: qbError || "Please try again" });
      searchParams.delete("qb");
      searchParams.delete("error");
      searchParams.delete("quickbooks");
      setSearchParams(searchParams, { replace: true });
    }

    // Gmail callback
    const gmailCode = searchParams.get("code");
    const isGmailCallback = searchParams.get("gmail_callback");
    if (gmailCode && isGmailCallback && user) {
      gmail.exchangeCode(gmailCode).then((success) => {
        searchParams.delete("code");
        searchParams.delete("gmail_callback");
        searchParams.delete("scope");
        searchParams.delete("authuser");
        searchParams.delete("prompt");
        setSearchParams(searchParams, { replace: true });
        if (success) {
          toast.success("Gmail connected!");
          gmail.checkStatus();
        }
      });
    }

    // Calendar callback
    const calCode = searchParams.get("code");
    const isCalCallback = searchParams.get("calendar_callback");
    if (calCode && isCalCallback && user) {
      calendar.exchangeCode(calCode).then((success) => {
        searchParams.delete("code");
        searchParams.delete("calendar_callback");
        searchParams.delete("scope");
        searchParams.delete("authuser");
        searchParams.delete("prompt");
        setSearchParams(searchParams, { replace: true });
        if (success) {
          toast.success("Google Calendar connected!");
          calendar.checkStatus();
        }
      });
    }

    // Microsoft callback — Azure redirect URI is bare (https://naitive.co/integrations),
    // so we identify Microsoft callbacks via the `state` parameter (prefix "ms_").
    const msCode = searchParams.get("code");
    const msState = searchParams.get("state");
    const isMicrosoftCallback = msState?.startsWith("ms_") || sessionStorage.getItem("ms_oauth_state");
    const notGmail = !searchParams.get("gmail_callback");
    const notCal = !searchParams.get("calendar_callback");
    if (msCode && isMicrosoftCallback && notGmail && notCal && user) {
      microsoft.exchangeCode(msCode).then((success) => {
        searchParams.delete("code");
        searchParams.delete("state");
        searchParams.delete("session_state");
        setSearchParams(searchParams, { replace: true });
        if (success) {
          toast.success("Microsoft connected!");
          microsoft.checkStatus();
        } else {
          toast.error("Failed to connect Microsoft");
        }
      });
    }
  }, [searchParams]);

  // HubSpot auto health check
  useEffect(() => {
    if (hubspotChecked) return;
    setHubspotChecked(true);
    hubspot.testConnection()
      .then(() => setHubspotStatus("connected"))
      .catch(() => setHubspotStatus("disconnected"));
  }, []);

  // === Determine connected integrations ===
  const isHubspotConnected = hubspotStatus === "connected";
  const isQBConnected = qbStatus?.connected ?? false;
  const isGmailConnected = gmail.status?.connected ?? false;
  const isCalendarConnected = calendar.status?.connected ?? false;
  const isClaapConnected = claapIntegration?.status === "connected";
  const isMicrosoftConnected = microsoft.status?.connected ?? false;
  const asanaIntegration = integrations.find((i) => i.type === "asana");
  const isAsanaConnected = asanaIntegration?.status === "connected";
  // Zapier is always "available" via the webhook config section
  const isZapierActive = true; // Always show in connected for 5thLine users

  const getMicrosoftStatus = (): IntegrationStatus => {
    if (!isMicrosoftConnected) return "disconnected";
    if (microsoft.status?.is_expired) return "requires_reauth";
    return "connected";
  };

  const getGmailStatus = (): IntegrationStatus => {
    if (!isGmailConnected) return "disconnected";
    if (gmail.status?.is_expired) return "requires_reauth";
    return "connected";
  };

  const getCalendarStatus = (): IntegrationStatus => {
    if (!isCalendarConnected) return "disconnected";
    if (calendar.status?.is_expired) return "requires_reauth";
    return "connected";
  };

  const getQBStatus = (): IntegrationStatus => {
    if (!isQBConnected) return "disconnected";
    const anyExpired = qbConnections.some((c) => c.isExpired);
    if (anyExpired) return "requires_reauth";
    return "connected";
  };

  // Build connected list
  type ConnectedIntegration = { key: string; render: () => React.ReactNode };
  const connectedIntegrations: ConnectedIntegration[] = [];

  if (is5thLine && isHubspotConnected) {
    connectedIntegrations.push({
      key: "hubspot",
      render: () => (
        <IntegrationCard
          name="HubSpot"
          icon={Users}
          description="Syncs contacts, deals, and companies to power deal analysis and workflow automation."
          status={hubspotStatus}
          isConnected
          lastSynced={null}
          recordCounts={[
            { label: "Contacts", count: contactsData?.results?.length || 0 },
            { label: "Deals", count: dealsData?.results?.length || 0 },
            { label: "Companies", count: companiesData?.results?.length || 0 },
          ]}
          externalUrl="https://app.hubspot.com"
          externalLabel="Open HubSpot"
          onSyncSettings={() => setHubspotModalOpen(true)}
          onTestConnection={async () => {
            try {
              await hubspot.testConnection();
              setHubspotStatus("connected");
              toast.success("HubSpot connection healthy!");
            } catch {
              setHubspotStatus("error");
              toast.error("HubSpot connection failed");
            }
          }}
        >
          <Link
            to="/integrations/hubspot/health"
            className="text-xs text-primary hover:underline inline-flex items-center"
          >
            View sync health & logs →
          </Link>
        </IntegrationCard>
      ),
    });
  }

  if (is5thLine && isQBConnected) {
    const lastSync = qbConnections[0]?.lastSync;
    connectedIntegrations.push({
      key: "quickbooks",
      render: () => (
        <IntegrationCard
          name="QuickBooks"
          icon={CreditCard}
          description="Financial data powers deal and company financial context."
          status={getQBStatus()}
          isConnected
          lastSynced={lastSync}
          statusDetail={qbConnections.map((c) => c.companyName).filter(Boolean).join(", ")}
          recordCounts={[
            { label: "Customers", count: qbCustomers.length },
            { label: "Invoices", count: qbInvoices.length },
            { label: "Payments", count: qbPayments.length },
          ]}
          externalUrl="https://app.qbo.intuit.com"
          externalLabel="Open QuickBooks"
          onSyncSettings={() => setQuickbooksModalOpen(true)}
          onDisconnect={async () => {
            await qbDisconnect.mutateAsync(firstRealm);
          }}
        />
      ),
    });
  }

  if (isGmailConnected) {
    connectedIntegrations.push({
      key: "gmail",
      render: () => (
        <IntegrationCard
          name="Gmail"
          icon={Mail}
          description="Email metadata enriches deal timelines and communication history."
          status={getGmailStatus()}
          isConnected
          statusDetail={user?.email || undefined}
          lastSynced={gmail.status?.connected_at}
          externalUrl="https://mail.google.com"
          externalLabel="Open Gmail"
          onSyncSettings={() => setGmailModalOpen(true)}
          onTestConnection={async () => {
            await gmail.checkStatus();
            toast.success("Gmail connection healthy!");
          }}
          onDisconnect={async () => {
            await gmail.disconnect();
          }}
        />
      ),
    });
  }

  if (is5thLine && isCalendarConnected) {
    connectedIntegrations.push({
      key: "calendar",
      render: () => (
        <IntegrationCard
          name="Google Calendar"
          icon={Calendar}
          description="Meeting events enrich deal timelines and track touchpoints."
          status={getCalendarStatus()}
          isConnected
          statusDetail={`${calendar.status?.email || user?.email} · Read-only`}
          lastSynced={calendar.status?.connected_at}
          externalUrl="https://calendar.google.com"
          externalLabel="Open Google Calendar"
          onSyncSettings={() => setCalendarModalOpen(true)}
          onTestConnection={async () => {
            await calendar.checkStatus();
            toast.success("Calendar connection healthy!");
          }}
          onDisconnect={async () => {
            await calendar.disconnect();
          }}
        />
      ),
    });
  }

  if (isMicrosoftConnected) {
    connectedIntegrations.push({
      key: "microsoft",
      render: () => (
        <IntegrationCard
          name="Microsoft"
          icon={MonitorSmartphone}
          description="Teams notifications, Outlook email, calendar, and contacts via Microsoft Graph."
          status={getMicrosoftStatus()}
          isConnected
          statusDetail={microsoft.status?.email || undefined}
          lastSynced={microsoft.status?.connected_at}
          onTestConnection={async () => {
            await microsoft.checkStatus();
            toast.success("Microsoft connection healthy!");
          }}
          onDisconnect={async () => {
            await microsoft.disconnect();
          }}
        >
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Sync Email</span>
                {microsoft.status?.last_email_sync_at && (
                  <span className="text-muted-foreground">
                    · last {new Date(microsoft.status.last_email_sync_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => microsoft.syncNow("emails")}>Sync now</Button>
                <Switch
                  checked={microsoft.status?.sync_email_enabled ?? true}
                  onCheckedChange={(v) => microsoft.setSyncToggle({ sync_email_enabled: v })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Sync Calendar</span>
                {microsoft.status?.last_calendar_sync_at && (
                  <span className="text-muted-foreground">
                    · last {new Date(microsoft.status.last_calendar_sync_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => microsoft.syncNow("calendar")}>Sync now</Button>
                <Switch
                  checked={microsoft.status?.sync_calendar_enabled ?? true}
                  onCheckedChange={(v) => microsoft.setSyncToggle({ sync_calendar_enabled: v })}
                />
              </div>
            </div>
            <MicrosoftUpcomingEvents />
          </div>
        </IntegrationCard>
      ),
    });
  }

  if (isClaapConnected) {
    connectedIntegrations.push({
      key: "claap",
      render: () => <ClaapSummaryCard />,
    });
  }

  // Zapier and FLEx surface in the Automation section, not Connected.

  if (is5thLine && isAsanaConnected) {
    connectedIntegrations.push({
      key: "asana",
      render: () => (
        <IntegrationCard
          name="Asana"
          icon={ListChecks}
          description="Syncs tasks and projects for streamlined project management."
          status="connected"
          isConnected
          lastSynced={asanaIntegration?.last_sync_at}
          externalUrl="https://app.asana.com"
          externalLabel="Open Asana"
          onSyncSettings={isCompanyAdmin ? () => setAsanaSyncModalOpen(true) : undefined}
          onDisconnect={async () => {
            if (!asanaIntegration) return;
            const { error } = await supabase.from("integrations").delete().eq("id", asanaIntegration.id);
            if (error) { toast.error("Failed to disconnect Asana"); return; }
            toast.success("Asana disconnected");
            window.location.reload();
          }}
        />
      ),
    });
  }


  // === Available (not yet connected) ===
  type AvailableIntegration = { key: string; render: () => React.ReactNode };
  const availableIntegrations: AvailableIntegration[] = [];

  if (is5thLine && !isHubspotConnected) {
    availableIntegrations.push({
      key: "hubspot",
      render: () => (
        <IntegrationCard
          name="HubSpot"
          icon={Users}
          description="Sync contacts, deals, and companies to power deal analysis."
          status="disconnected"
          isConnected={false}
          onConnect={() => toast.info("Configure HubSpot API key in settings to connect.")}
        />
      ),
    });
  }

  if (is5thLine && !isQBConnected) {
    availableIntegrations.push({
      key: "quickbooks",
      render: () => (
        <IntegrationCard
          name="QuickBooks"
          icon={CreditCard}
          description="Display financial context on deal and company profiles."
          status="disconnected"
          isConnected={false}
          onConnect={() => qbConnect.mutate()}
        />
      ),
    });
  }

  if (!isGmailConnected) {
    availableIntegrations.push({
      key: "gmail",
      render: () => (
        <IntegrationCard
          name="Gmail"
          icon={Mail}
          description="Enrich deal timelines with email communication history via Gmail."
          status="disconnected"
          isConnected={false}
          onConnect={() => gmail.connect()}
        />
      ),
    });
  }

  if (is5thLine && !isCalendarConnected) {
    availableIntegrations.push({
      key: "calendar",
      render: () => (
        <IntegrationCard
          name="Google Calendar"
          icon={Calendar}
          description="Enrich deal timelines with meeting and event data from Google Calendar."
          status="disconnected"
          isConnected={false}
          onConnect={() => calendar.connect()}
        />
      ),
    });
  }

  if (!isMicrosoftConnected) {
    availableIntegrations.push({
      key: "microsoft",
      render: () => (
        <IntegrationCard
          name="Microsoft"
          icon={MonitorSmartphone}
          description="Connect Teams, Outlook email, calendar, and contacts via Microsoft Graph."
          status="disconnected"
          isConnected={false}
          onConnect={() => microsoft.connect()}
        />
      ),
    });
  }

  if (!isClaapConnected) {
    availableIntegrations.push({
      key: "claap",
      render: () => <ClaapSummaryCard />,
    });
  }

  if (is5thLine && !isAsanaConnected) {
    availableIntegrations.push({
      key: "asana",
      render: () => (
        <IntegrationCard
          name="Asana"
          icon={ListChecks}
          description="Sync tasks and projects with Asana for streamlined project management."
          status="disconnected"
          isConnected={false}
          onConnect={() => setAsanaModalOpen(true)}
        />
      ),
    });
  }


  const totalConnected = connectedIntegrations.length;

  return (
    <AppLayout mainClassName="bg-background">
      <Helmet>
        <title>Integrations | naitive</title>
      </Helmet>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect external systems and monitor sync health. Use Deals, Finance, and other modules to work with synced data.
          </p>
        </header>

        {/* 1 — Connected (primary) */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Connected
            </h2>
            <span className="text-[11px] text-muted-foreground/70 tabular-nums">
              {totalConnected} active
            </span>
          </div>
          {totalConnected === 0 ? (
            <p className="text-sm text-muted-foreground py-6">
              No integrations connected yet. Add one from below.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {connectedIntegrations.map((item) => (
                <div key={item.key}>{item.render()}</div>
              ))}
            </div>
          )}
        </section>

        {/* 2 — Available */}
        {availableIntegrations.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Available
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {availableIntegrations.map((item) => (
                <div key={item.key}>{item.render()}</div>
              ))}
            </div>
          </section>
        )}

        {/* 3 — Automation & Sync Configuration */}
        {(
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Automation & Sync
            </h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ZapierSummaryCard />
              {canSeeFlexSync && (
                <FlexAutomationCard companyId={company?.id ?? null} canEdit={!!isCompanyAdmin} />
              )}
            </div>
          </section>
        )}

        {/* 4 — Coming Soon */}
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Coming Soon
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {COMING_SOON_INTEGRATIONS.map((cs) => (
              <ComingSoonCard
                key={cs.key}
                name={cs.name}
                icon={cs.icon}
                description={cs.description}
                isNotified={interests.includes(cs.key)}
                onNotifyMe={() => notifyMe.mutate(cs.key)}
                isNotifying={notifyMe.isPending}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Sync Settings Modals */}
      <HubSpotSyncSettingsModal open={hubspotModalOpen} onClose={() => setHubspotModalOpen(false)} />
      <QuickBooksSyncSettingsModal open={quickbooksModalOpen} onClose={() => setQuickbooksModalOpen(false)} />
      <GmailSyncSettingsModal
        open={gmailModalOpen}
        onClose={() => setGmailModalOpen(false)}
        email={user?.email || undefined}
        onDisconnect={() => { gmail.disconnect(); setGmailModalOpen(false); }}
      />
      <CalendarSyncSettingsModal
        open={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        email={calendar.status?.email || user?.email || undefined}
        onDisconnect={() => { calendar.disconnect(); setCalendarModalOpen(false); }}
      />
      <AsanaSetupModal
        open={asanaModalOpen}
        onOpenChange={setAsanaModalOpen}
        onConnected={() => window.location.reload()}
      />
      {asanaIntegration && (
        <AsanaSyncSettingsModal
          open={asanaSyncModalOpen}
          onClose={() => setAsanaSyncModalOpen(false)}
          integrationId={asanaIntegration.id}
        />
      )}
    </AppLayout>
  );
}
