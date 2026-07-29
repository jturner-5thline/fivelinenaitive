import { Suspense, lazy, useEffect } from "react";
import ScrollToTop from "@/components/ScrollToTop";
import CanonicalTag from "@/components/CanonicalTag";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { usePilotKpiTracking } from "@/hooks/analytics/usePilotKpiTracking";

function PilotKpiTrackingMount() {
  usePilotKpiTracking();
  return null;
}
import { useInboxPrefetch } from "@/hooks/useInboxPrefetch";
import { AppVersionRefreshMount } from "@/hooks/useAppVersionRefresh";

/**
 * Keeps the inbox cache warm across the entire authenticated app so the
 * InboxDialog opens instantly with the 25 most-recent messages already
 * loaded. Polls every 5 minutes in the background regardless of whether
 * the inbox is open.
 */
function InboxPrefetchMount() {
  useInboxPrefetch();
  return null;
}
import { LendersProvider } from "@/contexts/LendersContext";
import { LenderStagesProvider } from "@/contexts/LenderStagesContext";
import { DealStagesProvider } from "@/contexts/DealStagesContext";
import { PipelineProvider } from "@/contexts/PipelineContext";
import { DealTypesProvider } from "@/contexts/DealTypesContext";
import { DefaultMilestonesProvider } from "@/contexts/DefaultMilestonesContext";
import { WidgetsProvider } from "@/contexts/WidgetsContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ChartsProvider } from "@/contexts/ChartsContext";
import { AnalyticsWidgetsProvider } from "@/contexts/AnalyticsWidgetsContext";
import { MetricsWidgetsProvider } from "@/contexts/MetricsWidgetsContext";
import { DashboardFoldersProvider } from "@/contexts/DashboardFoldersContext";
import { DashboardWidgetsProvider } from "@/contexts/DashboardWidgetsContext";
import { DashboardLayoutProvider } from "@/contexts/DashboardLayoutContext";
import { DealsProvider } from "@/contexts/DealsContext";
import { StatusChangeGateProvider } from "@/components/deal/StatusChangeGate";
import { UndoSendProvider } from "@/contexts/UndoSendContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InsightsAccessGuard } from "@/components/InsightsAccessGuard";
import { WorkflowEmailModalListener } from "@/components/email/WorkflowEmailModalListener";
import { NewTaskViaNaitiveModal } from "@/components/dashboard/chat/NewTaskViaNaitiveModal";
import { CookieConsent } from "@/components/CookieConsent";
import { AddToDealCalendarProvider } from "@/components/calendar/AddToDealCalendarProvider";
import { CopyProtection } from "@/components/CopyProtection";
import { WelcomeScreenWrapper } from "@/components/WelcomeScreenWrapper";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";
import { prefetchCommonRoutes } from "@/lib/routePrefetch";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { runDemoAiChatReset } from "@/lib/ai/resetDemoChats";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
const ImpersonationCallback = lazy(lazyRetry(() => import("./pages/ImpersonationCallback")));
const OAuthConsent = lazy(lazyRetry(() => import("./pages/OAuthConsent")));

/**
 * Demo-only: wipes prior naitive AI chat history once per page load
 * for demo@5thline.co. No-op for any other user.
 */
function DemoAiChatResetMount() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user?.email) return;
    void runDemoAiChatReset(user.email, qc);
  }, [user?.email, qc]);
  return null;
}

/**
 * Root + auth-page redirector. Authenticated users always land on /deals.
 * Unauthenticated visitors at `/` are sent to /login. Waits for auth init
 * to avoid a login-screen flash on refresh.
 */
function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return <Navigate to={user ? "/deals" : "/login"} replace />;
}

function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const isDemoAccess = new URLSearchParams(location.search).get("demo") === "1";
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isDemoAccess) {
    return <>{children}</>;
  }
  if (user) {
    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect");
    return <Navigate to={redirect || "/deals"} replace />;
  }
  return <>{children}</>;
}

function DemoCallbackRedirect() {
  const location = useLocation();
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const hashParams = new URLSearchParams(hash);
  const email = hashParams.get("email") || "";
  const target = `/login?demo=1&password=${encodeURIComponent("User1234")}&redirect=${encodeURIComponent("/deals")}${email ? `&email=${encodeURIComponent(email)}` : ""}`;
  return <Navigate to={target} replace />;
}

// Lazy-load all pages with retry to handle stale chunk URLs after deploys
const Index = lazy(lazyRetry(() => import("./pages/Index")));
const Auth = lazy(lazyRetry(() => import("./pages/Auth")));
const Onboarding = lazy(lazyRetry(() => import("./pages/Onboarding")));
const Deals = lazy(lazyRetry(() => import("./pages/Deals")));
const Workspace = lazy(lazyRetry(() => import("./pages/Workspace")));
// /dashboard route removed — global popup overlays now live in the floating
// header so dashboard widgets are reachable from every page.
// Shared DealDetail loader — the kanban deal overlay and hover/idle
// preloaders all dedupe through `loadDealDetail()` so we emit and parse
// exactly one chunk for the (~6k LOC) DealDetail page.
const DealDetail = lazy(lazyRetry(() => import("./lib/lazyDealDetail").then((m) => m.loadDealDetail())));
const Settings = lazy(lazyRetry(() => import("./pages/Settings")));
const Account = lazy(lazyRetry(() => import("./pages/Account")));
const Lenders = lazy(lazyRetry(() => import("./pages/Lenders")));
const LenderDatabaseConfig = lazy(lazyRetry(() => import("./pages/LenderDatabaseConfig")));
const LenderSyncHistory = lazy(lazyRetry(() => import("./pages/LenderSyncHistory")));
const LenderDealHistory = lazy(lazyRetry(() => import("./pages/LenderDealHistory")));
const LenderMatchingQA = lazy(lazyRetry(() => import("./pages/LenderMatchingQA")));
const Preferences = lazy(lazyRetry(() => import("./pages/Preferences")));
const Analytics = lazy(lazyRetry(() => import("./pages/Analytics")));
const Reports = lazy(lazyRetry(() => import("./pages/Reports")));
const WidgetEditorPage = lazy(lazyRetry(() => import("./pages/WidgetEditorPage")));
const Insights = lazy(lazyRetry(() => import("./pages/Insights")));
const SalesBD = lazy(lazyRetry(() => import("./pages/SalesBD")));
const HR = lazy(lazyRetry(() => import("./pages/HR")));
const Operations = lazy(lazyRetry(() => import("./pages/Operations")));
const DebugRecognition = lazy(lazyRetry(() => import("./pages/DebugRecognition")));
const Workflows = lazy(lazyRetry(() => import("./pages/Workflows")));
const Tasks = lazy(lazyRetry(() => import("./pages/Tasks")));
const TaskDetail = lazy(lazyRetry(() => import("./pages/TaskDetail")));
const SuggestedTaskPreview = lazy(lazyRetry(() => import("./pages/SuggestedTaskPreview")));
const Company = lazy(lazyRetry(() => import("./pages/Company")));
const AcceptInvite = lazy(lazyRetry(() => import("./pages/AcceptInvite")));
const Notifications = lazy(lazyRetry(() => import("./pages/Notifications")));
const Help = lazy(lazyRetry(() => import("./pages/Help")));
const MigrationTool = lazy(lazyRetry(() => import("./pages/MigrationTool")));
const Admin = lazy(lazyRetry(() => import("./pages/Admin")));
const PerformanceAudit = lazy(lazyRetry(() => import("./pages/PerformanceAudit")));
const Signal = lazy(lazyRetry(() => import("./pages/Signal")));
const Studio = lazy(lazyRetry(() => import("./pages/Studio")));
const Integrations = lazy(lazyRetry(() => import("./pages/Integrations")));
const NewsFeed = lazy(lazyRetry(() => import("./pages/NewsFeed")));
const MeetingNotesSearch = lazy(lazyRetry(() => import("./pages/MeetingNotesSearch")));

const Agents = lazy(lazyRetry(() => import("./pages/Agents")));
const Finance = lazy(lazyRetry(() => import("./pages/Finance")));
const Contacts = lazy(lazyRetry(() => import("./pages/Contacts")));
const ContactDetail = lazy(lazyRetry(() => import("./pages/ContactDetail")));
const ContactCompanySync = lazy(lazyRetry(() => import("./pages/admin/ContactCompanySync")));
const ClaudeUsageAdmin = lazy(lazyRetry(() => import("./pages/admin/ClaudeUsageAdmin")));
const NotFound = lazy(lazyRetry(() => import("./pages/NotFound")));
const CrmCompanies = lazy(lazyRetry(() => import("./pages/CrmCompanies")));
const CrmCompanyDetail = lazy(lazyRetry(() => import("./pages/CrmCompanyDetail")));
const PrivacyPolicy = lazy(lazyRetry(() => import("./pages/PrivacyPolicy")));
const TermsOfService = lazy(lazyRetry(() => import("./pages/TermsOfService")));
const Unsubscribe = lazy(lazyRetry(() => import("./pages/Unsubscribe")));
const ScheduleConfirm = lazy(lazyRetry(() => import("./pages/ScheduleConfirm")));
// Approval gates removed — keep imports out of the bundle.
const Homepage = lazy(lazyRetry(() => import("./pages/Homepage")));
const BlogPost = lazy(lazyRetry(() => import("./pages/BlogPost")));
const Promo = lazy(lazyRetry(() => import("./pages/Promo")));
const FieldLayoutEditorPage = lazy(lazyRetry(() => import("./pages/FieldLayoutEditorPage")));
const HubspotSyncHealth = lazy(lazyRetry(() => import("./pages/HubspotSyncHealth")));
/**
 * Deals are modal-first: every deal opens as an overlay on top of `/deals`.
 * Standalone `/deal/:id` and `/deals/:id` routes are no longer rendered as
 * full pages — they redirect to `/deals?deal=<id>` (merging any existing
 * query string + hash) so the shared overlay opens. This guarantees that
 * legacy links from notifications, emails, tasks, search results and
 * bookmarks all funnel through the same modal experience without breaking
 * backward compatibility.
 */
function NavigateToDealOverlay() {
  const params = useParams<{ id?: string; dealId?: string }>();
  const location = useLocation();
  const dealId = params.id || params.dealId;

  if (!dealId) {
    return <Navigate to="/deals" replace />;
  }

  // Preserve query string params (tab, highlight, action, etc.) by merging
  // them onto `/deals?deal=<id>`. The embedded DealDetail inside the
  // overlay reads these the same way it would on the standalone route.
  const incoming = new URLSearchParams(location.search);
  incoming.delete('deal'); // avoid duplicate keys if a caller already set it
  const merged = new URLSearchParams();
  merged.set('deal', dealId);
  for (const [k, v] of incoming.entries()) merged.append(k, v);

  const target = `/deals?${merged.toString()}${location.hash}`;
  return <Navigate to={target} replace state={location.state} />;
}


const WfHub = lazy(lazyRetry(() => import("./pages/WfHub")));
const WfDealDetail = lazy(lazyRetry(() => import("./pages/WfDealDetail")));
const VirtualDataRoom = lazy(lazyRetry(() => import("./pages/VirtualDataRoom")));
const NaitivePipeline = lazy(lazyRetry(() => import("./pages/NaitivePipeline")));
const NaitivePipelineReports = lazy(lazyRetry(() => import("./pages/NaitivePipelineReports")));
const NaitivePipelineReportView = lazy(lazyRetry(() => import("./pages/NaitivePipelineReportView")));
const EmailIntelligencePage = lazy(lazyRetry(() => import("./pages/EmailIntelligencePage")));
const FinServ = lazy(lazyRetry(() => import("./pages/FinServ")));
const ClaapMappingReview = lazy(lazyRetry(() => import("./pages/ClaapMappingReview")));


/**
 * React Query defaults tuned for perceived speed across Naitive.
 *
 * Rationale:
 *  - `staleTime: 60_000` — within a minute, navigating back to a screen
 *    paints instantly from cache instead of triggering a network round-trip.
 *    Mutations still call `queryClient.invalidateQueries(...)` explicitly
 *    (see hooks under src/hooks/), so user-initiated changes update right
 *    away. This only suppresses *passive* refetches.
 *  - `gcTime: 5 * 60_000` — keep cached pages warm for 5 minutes after
 *    components unmount so back-navigation is free.
 *  - `refetchOnWindowFocus: false` — previously every tab-focus event
 *    refetched dozens of queries simultaneously, causing the "comes back
 *    laggy" feel. Background revalidation still happens on remount when
 *    data is stale.
 *  - `retry: 1` — single retry instead of the default 3 so transient errors
 *    surface faster in the UI rather than silently spinning.
 *
 * Per-query overrides remain in effect; this only changes defaults for
 * queries that don't specify their own.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Pause every polling query while the tab is in the background. The
      // single biggest source of "naitive slows my whole browser after
      // hours in the background" was per-query `refetchInterval` timers
      // continuing to fire on hidden tabs. This default cannot be set
      // per-query without thinking; making it the global default and
      // letting individual queries opt-in (very few should) is the safe
      // and high-impact move.
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
});

// Persist a small whitelist of long-lived list queries to localStorage so a
// hard refresh hydrates from cache instead of triggering a full refetch.
const PERSISTED_QUERY_KEYS = new Set(['crm-companies-infinite']);
const localStoragePersister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'naitive-rq-cache-v1',
  throttleTime: 1000,
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/**
 * In-shell skeleton shown while the next page's lazy chunk is downloading.
 * Keeps the sidebar + header mounted (they live in <AppLayout/>) and only
 * paints a light placeholder inside the main content area — navigation
 * therefore feels instant even on slow networks.
 */
function RouteSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
    </div>
  );
}

/**
 * Layout route element. Mounts <AppLayout/> once, then renders the matched
 * nested route via React Router's <Outlet/>. Combined with an inner
 * <Suspense/> boundary, this prevents the sidebar, top nav, providers, and
 * background from unmounting/remounting on every navigation — the dominant
 * cause of slow page transitions.
 */
function ProtectedShell() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <RoutePrefetcher />
        <Suspense fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </AppLayout>
    </ProtectedRoute>
  );
}

/**
 * Mounted once inside the authenticated shell. After the current page has
 * settled, warms the chunks for the most-trafficked routes (deals,
 * pipeline, tasks, finance, etc.) during browser idle time. Subsequent
 * navigations resolve from memory instead of paying a chunk download,
 * which is the dominant cause of perceived navigation lag once react-query
 * caches are warm.
 */
function RoutePrefetcher() {
  useEffect(() => {
    prefetchCommonRoutes();
  }, []);
  return null;
}

const App = () => (
  <HelmetProvider>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: localStoragePersister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: 'v1',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => {
            const root = Array.isArray(q.queryKey) ? q.queryKey[0] : q.queryKey;
            return typeof root === 'string' && PERSISTED_QUERY_KEYS.has(root);
          },
        },
      }}
    >
      <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" storageKey="app-theme">
        <AuthProvider>
          <PreferencesProvider>
            <DealsProvider>
              <StatusChangeGateProvider>
              <LendersProvider>
                <LenderStagesProvider>
                  <DealStagesProvider>
                  <PipelineProvider>
                  <DealTypesProvider>
                  <DefaultMilestonesProvider>
                    <ChartsProvider>
                    <AnalyticsWidgetsProvider>
                    <MetricsWidgetsProvider>
                    <DashboardFoldersProvider>
                    <WidgetsProvider>
                    <DashboardWidgetsProvider>
                    <DashboardLayoutProvider>
                    <TooltipProvider>
                      <CopyProtection>
                      <UndoSendProvider>
                      <AddToDealCalendarProvider>
                      <WelcomeScreenWrapper />
                      <DemoAiChatResetMount />
                      <Toaster />
                      <Sonner />
                      <WorkflowEmailModalListener />

                      <BrowserRouter>
                        <ScrollToTop />
                        <CanonicalTag />
                        <CookieConsent />
                        <ImpersonationBanner />
                        <NewTaskViaNaitiveModal />
                        <PilotKpiTrackingMount />
                        <InboxPrefetchMount />
                        <AppVersionRefreshMount />
                        <Suspense fallback={<PageLoader />}>
                        <Routes>
                        <Route path="/" element={<Homepage />} />
                          <Route path="/home" element={<Index />} />
                          <Route path="/login" element={<RedirectIfAuthenticated><Auth /></RedirectIfAuthenticated>} />
                          <Route path="/auth" element={<RedirectIfAuthenticated><Auth /></RedirectIfAuthenticated>} />
                          <Route path="/auth/demo/callback" element={<DemoCallbackRedirect />} />
                          <Route path="/auth/impersonation/callback" element={<ImpersonationCallback />} />
                          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                          <Route path="/pending-approval" element={<Navigate to="/pipeline" replace />} />
                          <Route path="/pending-company-approval" element={<Navigate to="/pipeline" replace />} />
                          <Route path="/onboarding" element={
                            <ProtectedRoute skipOnboarding><Onboarding /></ProtectedRoute>
                          } />
                          <Route path="/dashboard" element={<Navigate to="/pipeline" replace />} />
                          {/* Persistent app shell — sidebar, top nav, and
                              providers stay mounted across nested route
                              changes for fast in-app navigation. */}
                          <Route element={<ProtectedShell />}>
                            <Route path="/pipeline" element={<NaitivePipeline />} />
                            <Route path="/news-feed" element={<NewsFeed />} />
                            <Route path="/tasks" element={<Tasks />} />
                            <Route path="/workspace" element={<Workspace />} />
                            <Route path="/meeting-notes" element={<MeetingNotesSearch />} />
                            <Route path="/tasks/:taskId" element={<TaskDetail />} />
                            <Route path="/tasks/preview/suggested" element={<SuggestedTaskPreview />} />
                            <Route path="/deals" element={<ErrorBoundary><Deals /></ErrorBoundary>} />
                            {/* Analytics now lives as the second tab inside the Dashboard pop-up.
                                Keep /analytics as a compatibility redirect that lands users on
                                /deals with `?dashboard=analytics`, which auto-opens the modal on
                                the Analytics tab (see DealsHeader). */}
                            <Route path="/analytics" element={<Navigate to="/deals?dashboard=analytics" replace />} />
                            <Route path="/reports" element={<Reports />} />
                            <Route path="/widget-editor" element={<WidgetEditorPage />} />
                            <Route path="/sales-bd" element={<SalesBD />} />
                            <Route path="/contacts" element={<Contacts />} />
                            <Route path="/contacts/:id" element={<ContactDetail />} />
                            <Route path="/admin/contact-company-sync" element={<ContactCompanySync />} />
                            <Route path="/admin/claude-usage" element={<ClaudeUsageAdmin />} />
                            <Route path="/crm-companies" element={<CrmCompanies />} />
                            <Route path="/crm-companies/:id" element={<CrmCompanyDetail />} />
                            <Route path="/field-layout-editor" element={<FieldLayoutEditorPage />} />
                            <Route path="/hr" element={<HR />} />
                            <Route path="/naitive-pipeline" element={<NaitivePipeline />} />
                            <Route path="/naitive-pipeline/reports" element={<NaitivePipelineReports />} />
                            <Route path="/naitive-pipeline/reports/:id" element={<NaitivePipelineReportView />} />
                            <Route path="/finserv" element={<FinServ />} />
                            <Route path="/email-intelligence" element={<EmailIntelligencePage />} />
                            <Route path="/claap/review" element={<ClaapMappingReview />} />
                            <Route path="/operations" element={<Operations />} />
                            <Route path="/debug/recognition" element={<DebugRecognition />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/settings/:group" element={<Settings />} />
                            <Route path="/settings/:group/:section" element={<Settings />} />
                            <Route path="/account" element={<Account />} />
                            <Route path="/lenders" element={<Lenders />} />
                            <Route path="/lenders/config" element={<LenderDatabaseConfig />} />
                            <Route path="/lenders/sync-history" element={<LenderSyncHistory />} />
                            <Route path="/lenders/:lenderName/history" element={<LenderDealHistory />} />
                            <Route path="/lenders/qa" element={<LenderMatchingQA />} />
                            <Route path="/preferences" element={<Preferences />} />
                            <Route path="/workflows" element={<Workflows />} />
                            <Route path="/company" element={<Company />} />
                            <Route path="/notifications" element={<Notifications />} />
                            <Route path="/help" element={<Help />} />
                            <Route path="/admin" element={<Admin />} />
                            <Route path="/admin/performance-audit" element={<PerformanceAudit />} />
                            <Route path="/signal" element={<Signal />} />
                            <Route path="/studio" element={<Studio />} />
                            <Route path="/integrations/hubspot/health" element={<HubspotSyncHealth />} />
                            <Route path="/wf" element={<WfHub />} />
                            <Route path="/wf-deals/:id" element={<WfDealDetail />} />
                            <Route path="/agents" element={<Agents />} />
                            {/* Insights still needs its access guard; keep it
                                inline on the element so the shell remains
                                shared with sibling routes. */}
                            <Route path="/insights" element={
                              <InsightsAccessGuard><ErrorBoundary><Insights /></ErrorBoundary></InsightsAccessGuard>
                            } />
                          </Route>
                          <Route path="/metrics" element={
                            <Navigate to="/insights" replace />
                          } />
                          {/* Standalone deal routes are deprecated — every
                              entry point now opens the shared overlay on
                              `/deals`. These redirects keep all existing
                              links (notifications, emails, tasks, deep
                              links, bookmarks) working without rendering a
                              second deal surface. */}
                          <Route path="/deal/:id" element={
                            <ProtectedRoute><NavigateToDealOverlay /></ProtectedRoute>
                          } />
                          <Route path="/deal/:dealId" element={
                            <ProtectedRoute><NavigateToDealOverlay /></ProtectedRoute>
                          } />
                          <Route path="/deals/:id" element={
                            <ProtectedRoute><NavigateToDealOverlay /></ProtectedRoute>
                          } />
                          <Route path="/accept-invite" element={<AcceptInvite />} />
                          <Route path="/migrate" element={
                            <ProtectedRoute><MigrationTool /></ProtectedRoute>
                          } />
                          <Route path="/integrations" element={
                            <ProtectedRoute><Integrations /></ProtectedRoute>
                          } />
                          <Route path="/finance" element={
                            <ProtectedRoute><Finance /></ProtectedRoute>
                          } />
                          {/* /agents now lives inside ProtectedShell so it shares
                              the persistent app canvas (matches Deals). */}
                          <Route path="/privacy" element={<PrivacyPolicy />} />
                          <Route path="/unsubscribe" element={<Unsubscribe />} />
                          <Route path="/schedule/confirm" element={<ScheduleConfirm />} />
                          <Route path="/terms" element={<TermsOfService />} />
                          <Route path="/homepage" element={<Homepage />} />
                          <Route path="/blog/:slug" element={<BlogPost />} />
                          <Route path="/promo" element={<Promo />} />
                          <Route path="/vdr/:dealId" element={
                            <ProtectedRoute><VirtualDataRoom /></ProtectedRoute>
                          } />
                          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                        </Suspense>
                      </BrowserRouter>
                      </AddToDealCalendarProvider>
                      </UndoSendProvider>
                      </CopyProtection>
                    </TooltipProvider>
                    </DashboardLayoutProvider>
                    </DashboardWidgetsProvider>
                    </WidgetsProvider>
                    </DashboardFoldersProvider>
                    </MetricsWidgetsProvider>
                    </AnalyticsWidgetsProvider>
                    </ChartsProvider>
                  </DefaultMilestonesProvider>
                  </DealTypesProvider>
                  </PipelineProvider>
                  </DealStagesProvider>
                </LenderStagesProvider>
              </LendersProvider>
              </StatusChangeGateProvider>
            </DealsProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  </HelmetProvider>
);

export default App;
