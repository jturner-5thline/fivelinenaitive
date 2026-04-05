import { Suspense, lazy } from "react";
import ScrollToTop from "@/components/ScrollToTop";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
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
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { FloatingCopilotDrawer } from "@/components/FloatingCopilotDrawer";
import { CookieConsent } from "@/components/CookieConsent";
import { CopyProtection } from "@/components/CopyProtection";
import { WelcomeScreenWrapper } from "@/components/WelcomeScreenWrapper";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";

// Lazy-load all pages with retry to handle stale chunk URLs after deploys
const Waitlist = lazy(lazyRetry(() => import("./pages/Waitlist")));
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
const Preferences = lazy(lazyRetry(() => import("./pages/Preferences")));
const Analytics = lazy(lazyRetry(() => import("./pages/Analytics")));
const Reports = lazy(lazyRetry(() => import("./pages/Reports")));
const Metrics = lazy(lazyRetry(() => import("./pages/Metrics")));
const WidgetEditorPage = lazy(lazyRetry(() => import("./pages/WidgetEditorPage")));
const Insights = lazy(lazyRetry(() => import("./pages/Insights")));
const SalesBD = lazy(lazyRetry(() => import("./pages/SalesBD")));
const HR = lazy(lazyRetry(() => import("./pages/HR")));
const Operations = lazy(lazyRetry(() => import("./pages/Operations")));
const Database = lazy(lazyRetry(() => import("./pages/Database")));
const Workflows = lazy(lazyRetry(() => import("./pages/Workflows")));
const Tasks = lazy(lazyRetry(() => import("./pages/Tasks")));
const TaskDetail = lazy(lazyRetry(() => import("./pages/TaskDetail")));
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
const PendingApproval = lazy(lazyRetry(() => import("./pages/PendingApproval")));
const PendingCompanyApproval = lazy(lazyRetry(() => import("./pages/PendingCompanyApproval")));
const Homepage = lazy(lazyRetry(() => import("./pages/Homepage")));
const Promo = lazy(lazyRetry(() => import("./pages/Promo")));
const FieldLayoutEditorPage = lazy(lazyRetry(() => import("./pages/FieldLayoutEditorPage")));
/** Forces DealDetail to fully remount when navigating between deals */
function DealDetailKeyedWrapper() {
  const { id } = useParams<{ id: string }>();
  return <DealDetail key={id} />;
}


const WfHub = lazy(lazyRetry(() => import("./pages/WfHub")));
const WfDealDetail = lazy(lazyRetry(() => import("./pages/WfDealDetail")));
const VirtualDataRoom = lazy(lazyRetry(() => import("./pages/VirtualDataRoom")));
const NaitivePipeline = lazy(lazyRetry(() => import("./pages/NaitivePipeline")));
const EmailIntelligencePage = lazy(lazyRetry(() => import("./pages/EmailIntelligencePage")));

const queryClient = new QueryClient();

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
                      <WelcomeScreenWrapper />
                      <Toaster />
                      <Sonner />
                      
                      <BrowserRouter>
                        <ScrollToTop />
                        <CookieConsent />
                        <FloatingCopilotDrawer />
                        <Suspense fallback={<PageLoader />}>
                        <Routes>
                        <Route path="/" element={<Homepage />} />
                          <Route path="/waitlist" element={<Waitlist />} />
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
                          <Route path="/deals" element={
                            <ProtectedRoute><AppLayout><Deals /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/analytics" element={
                            <ProtectedRoute><AppLayout><Analytics /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/reports" element={
                            <ProtectedRoute><AppLayout><Reports /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/metrics" element={
                            <ProtectedRoute><AppLayout><Metrics /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/widget-editor" element={
                            <ProtectedRoute><AppLayout><WidgetEditorPage /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/insights" element={
                            <ProtectedRoute><AppLayout><Insights /></AppLayout></ProtectedRoute>
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
                          <Route path="/operations" element={
                            <ProtectedRoute><AppLayout><Operations /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/deal/:id" element={
                            <ProtectedRoute><AppLayout><DealDetailKeyedWrapper /></AppLayout></ProtectedRoute>
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
                          <Route path="/agents" element={
                            <ProtectedRoute><Agents /></ProtectedRoute>
                          } />
                          <Route path="/finance" element={
                            <ProtectedRoute><Finance /></ProtectedRoute>
                          } />
                          <Route path="/privacy" element={<PrivacyPolicy />} />
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
