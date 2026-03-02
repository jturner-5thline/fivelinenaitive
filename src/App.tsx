import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

// Lazy-load all pages to reduce initial bundle / dev server pressure
const Waitlist = lazy(() => import("./pages/Waitlist"));
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Deals = lazy(() => import("./pages/Deals"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DealDetail = lazy(() => import("./pages/DealDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Account = lazy(() => import("./pages/Account"));
const Lenders = lazy(() => import("./pages/Lenders"));
const LenderDatabaseConfig = lazy(() => import("./pages/LenderDatabaseConfig"));
const LenderSyncHistory = lazy(() => import("./pages/LenderSyncHistory"));
const Preferences = lazy(() => import("./pages/Preferences"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Reports = lazy(() => import("./pages/Reports"));
const Metrics = lazy(() => import("./pages/Metrics"));
const Insights = lazy(() => import("./pages/Insights"));
const SalesBD = lazy(() => import("./pages/SalesBD"));
const HR = lazy(() => import("./pages/HR"));
const Operations = lazy(() => import("./pages/Operations"));
const Database = lazy(() => import("./pages/Database"));
const Workflows = lazy(() => import("./pages/Workflows"));
const Tasks = lazy(() => import("./pages/Tasks"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const Company = lazy(() => import("./pages/Company"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Help = lazy(() => import("./pages/Help"));
const MigrationTool = lazy(() => import("./pages/MigrationTool"));
const Admin = lazy(() => import("./pages/Admin"));
const Integrations = lazy(() => import("./pages/Integrations"));
const NewsFeed = lazy(() => import("./pages/NewsFeed"));
const Research = lazy(() => import("./pages/Research"));
const Agents = lazy(() => import("./pages/Agents"));
const Finance = lazy(() => import("./pages/Finance"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const Homepage = lazy(() => import("./pages/Homepage"));
const Promo = lazy(() => import("./pages/Promo"));

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
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="app-theme">
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
                          <Route path="/insights" element={
                            <ProtectedRoute><AppLayout><Insights /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/sales-bd" element={
                            <ProtectedRoute><AppLayout><SalesBD /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/hr" element={
                            <ProtectedRoute><AppLayout><HR /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/operations" element={
                            <ProtectedRoute><AppLayout><Operations /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/deal/:id" element={
                            <ProtectedRoute><AppLayout><DealDetail /></AppLayout></ProtectedRoute>
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
                          <Route path="/migrate" element={<MigrationTool />} />
                          <Route path="/admin" element={
                            <ProtectedRoute><AppLayout><Admin /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/integrations" element={
                            <ProtectedRoute><Integrations /></ProtectedRoute>
                          } />
                          <Route path="/research" element={
                            <ProtectedRoute><Research /></ProtectedRoute>
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
