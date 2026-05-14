import { Suspense, lazy } from "react";
import ScrollToTop from "@/components/ScrollToTop";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
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
import { UndoSendProvider } from "@/contexts/UndoSendContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InsightsAccessGuard } from "@/components/InsightsAccessGuard";
import { WorkflowEmailModalListener } from "@/components/email/WorkflowEmailModalListener";
import { NewTaskViaNaitiveModal } from "@/components/dashboard/chat/NewTaskViaNaitiveModal";
import { CookieConsent } from "@/components/CookieConsent";
import { CopyProtection } from "@/components/CopyProtection";
import { WelcomeScreenWrapper } from "@/components/WelcomeScreenWrapper";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";

// Lazy-load all pages with retry to handle stale chunk URLs after deploys
const Index = lazy(lazyRetry(() => import("./pages/Index")));
const Auth = lazy(lazyRetry(() => import("./pages/Auth")));
const Onboarding = lazy(lazyRetry(() => import("./pages/Onboarding")));
const Deals = lazy(lazyRetry(() => import("./pages/Deals")));
const Dashboard = lazy(lazyRetry(() => import("./pages/Dashboard")));
const DealDetail = lazy(lazyRetry(() => import("./pages/DealDetail")));
const Settings = lazy(lazyRetry(() => import("./pages/Settings")));
const Account = lazy(lazyRetry(() => import("./pages/Account")));
const Lenders = lazy(lazyRetry(() => import("./pages/Lenders")));
const LenderDatabaseConfig = lazy(lazyRetry(() => import("./pages/LenderDatabaseConfig")));
const LenderSyncHistory = lazy(lazyRetry(() => import("./pages/LenderSyncHistory")));
const LenderDealHistory = lazy(lazyRetry(() => import("./pages/LenderDealHistory")));
const Preferences = lazy(lazyRetry(() => import("./pages/Preferences")));
const Analytics = lazy(lazyRetry(() => import("./pages/Analytics")));
const Reports = lazy(lazyRetry(() => import("./pages/Reports")));
const WidgetEditorPage = lazy(lazyRetry(() => import("./pages/WidgetEditorPage")));
const Insights = lazy(lazyRetry(() => import("./pages/Insights")));
const SalesBD = lazy(lazyRetry(() => import("./pages/SalesBD")));
const HR = lazy(lazyRetry(() => import("./pages/HR")));
const Operations = lazy(lazyRetry(() => import("./pages/Operations")));
const Database = lazy(lazyRetry(() => import("./pages/Database")));
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
const Integrations = lazy(lazyRetry(() => import("./pages/Integrations")));
const NewsFeed = lazy(lazyRetry(() => import("./pages/NewsFeed")));

const Agents = lazy(lazyRetry(() => import("./pages/Agents")));
const Finance = lazy(lazyRetry(() => import("./pages/Finance")));
const Contacts = lazy(lazyRetry(() => import("./pages/Contacts")));
const ContactDetail = lazy(lazyRetry(() => import("./pages/ContactDetail")));
const NotFound = lazy(lazyRetry(() => import("./pages/NotFound")));
const CrmCompanies = lazy(lazyRetry(() => import("./pages/CrmCompanies")));
const CrmCompanyDetail = lazy(lazyRetry(() => import("./pages/CrmCompanyDetail")));
const PrivacyPolicy = lazy(lazyRetry(() => import("./pages/PrivacyPolicy")));
const TermsOfService = lazy(lazyRetry(() => import("./pages/TermsOfService")));
const Unsubscribe = lazy(lazyRetry(() => import("./pages/Unsubscribe")));
const PendingApproval = lazy(lazyRetry(() => import("./pages/PendingApproval")));
const PendingCompanyApproval = lazy(lazyRetry(() => import("./pages/PendingCompanyApproval")));
const Homepage = lazy(lazyRetry(() => import("./pages/Homepage")));
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
const EmailIntelligencePage = lazy(lazyRetry(() => import("./pages/EmailIntelligencePage")));
const FinServ = lazy(lazyRetry(() => import("./pages/FinServ")));


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
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" storageKey="app-theme">
        <AuthProvider>
          <PreferencesProvider>
            <DealsProvider>
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
                      <WelcomeScreenWrapper />
                      <Toaster />
                      <Sonner />
                      <WorkflowEmailModalListener />
                      
                      <BrowserRouter>
                        <ScrollToTop />
                        <CookieConsent />
                        <NewTaskViaNaitiveModal />
                        <Suspense fallback={<PageLoader />}>
                        <Routes>
                        <Route path="/" element={<Homepage />} />
                          <Route path="/home" element={<Index />} />
                          <Route path="/login" element={<Auth />} />
                          <Route path="/auth" element={<Auth />} />
                          <Route path="/pending-approval" element={
                            <ProtectedRoute skipOnboarding skipApprovalCheck><PendingApproval /></ProtectedRoute>
                          } />
                          <Route path="/pending-company-approval" element={
                            <ProtectedRoute skipOnboarding skipApprovalCheck><PendingCompanyApproval /></ProtectedRoute>
                          } />
                          <Route path="/onboarding" element={
                            <ProtectedRoute skipOnboarding><Onboarding /></ProtectedRoute>
                          } />
                          <Route path="/dashboard" element={
                            <ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/news-feed" element={
                            <ProtectedRoute><AppLayout><NewsFeed /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/tasks" element={
                            <ProtectedRoute><AppLayout><Tasks /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/tasks/:taskId" element={
                            <ProtectedRoute><AppLayout><TaskDetail /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/tasks/preview/suggested" element={
                            <ProtectedRoute><AppLayout><SuggestedTaskPreview /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/deals" element={
                            <ProtectedRoute><AppLayout><ErrorBoundary><Deals /></ErrorBoundary></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/analytics" element={
                            <ProtectedRoute><AppLayout><ErrorBoundary><Analytics /></ErrorBoundary></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/reports" element={
                            <ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/metrics" element={
                            <Navigate to="/insights" replace />
                          } />
                          <Route path="/widget-editor" element={
                            <ProtectedRoute><AppLayout><WidgetEditorPage /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/insights" element={
                            <ProtectedRoute><InsightsAccessGuard><AppLayout><ErrorBoundary><Insights /></ErrorBoundary></AppLayout></InsightsAccessGuard></ProtectedRoute>
                          } />
                          <Route path="/sales-bd" element={
                            <ProtectedRoute><AppLayout><SalesBD /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/contacts" element={
                            <ProtectedRoute><AppLayout><Contacts /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/contacts/:id" element={
                            <ProtectedRoute><AppLayout><ContactDetail /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/crm-companies" element={
                            <ProtectedRoute><AppLayout><CrmCompanies /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/crm-companies/:id" element={
                            <ProtectedRoute><AppLayout><CrmCompanyDetail /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/field-layout-editor" element={
                            <ProtectedRoute><AppLayout><FieldLayoutEditorPage /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/hr" element={
                            <ProtectedRoute><AppLayout><HR /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/naitive-pipeline" element={
                             <ProtectedRoute><AppLayout><NaitivePipeline /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/finserv" element={
                             <ProtectedRoute><AppLayout><FinServ /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/email-intelligence" element={
                            <ProtectedRoute><AppLayout><EmailIntelligencePage /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/operations" element={
                            <ProtectedRoute><AppLayout><Operations /></AppLayout></ProtectedRoute>
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
                          <Route path="/settings" element={
                            <ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/account" element={
                            <ProtectedRoute><AppLayout><Account /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/lenders" element={
                            <ProtectedRoute><AppLayout><Lenders /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/lenders/config" element={
                            <ProtectedRoute><AppLayout><LenderDatabaseConfig /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/lenders/sync-history" element={
                            <ProtectedRoute><AppLayout><LenderSyncHistory /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/lenders/:lenderName/history" element={
                            <ProtectedRoute><AppLayout><LenderDealHistory /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/preferences" element={
                            <ProtectedRoute><AppLayout><Preferences /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/database" element={
                            <ProtectedRoute><AppLayout><Database /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/workflows" element={
                            <ProtectedRoute><AppLayout><Workflows /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/company" element={
                            <ProtectedRoute><AppLayout><Company /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/notifications" element={
                            <ProtectedRoute><AppLayout><Notifications /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/help" element={
                            <ProtectedRoute><AppLayout><Help /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/accept-invite" element={<AcceptInvite />} />
                          <Route path="/migrate" element={
                            <ProtectedRoute><MigrationTool /></ProtectedRoute>
                          } />
                          <Route path="/admin" element={
                            <ProtectedRoute><AppLayout><Admin /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/integrations" element={
                            <ProtectedRoute><Integrations /></ProtectedRoute>
                          } />
                          <Route path="/integrations/hubspot/health" element={
                            <ProtectedRoute><AppLayout><HubspotSyncHealth /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/agents" element={
                            <ProtectedRoute><Agents /></ProtectedRoute>
                          } />
                          <Route path="/finance" element={
                            <ProtectedRoute><Finance /></ProtectedRoute>
                          } />
                          <Route path="/privacy" element={<PrivacyPolicy />} />
                          <Route path="/unsubscribe" element={<Unsubscribe />} />
                          <Route path="/terms" element={<TermsOfService />} />
                          <Route path="/homepage" element={<Homepage />} />
                          <Route path="/promo" element={<Promo />} />
                          <Route path="/wf" element={
                            <ProtectedRoute><AppLayout><WfHub /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/wf-deals/:id" element={
                            <ProtectedRoute><AppLayout><WfDealDetail /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/vdr/:dealId" element={
                            <ProtectedRoute><VirtualDataRoom /></ProtectedRoute>
                          } />
                          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                        </Suspense>
                      </BrowserRouter>
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
            </DealsProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
