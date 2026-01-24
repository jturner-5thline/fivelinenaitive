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
import { DealTypesProvider } from "@/contexts/DealTypesContext";
import { DefaultMilestonesProvider } from "@/contexts/DefaultMilestonesContext";
import { WidgetsProvider } from "@/contexts/WidgetsContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ChartsProvider } from "@/contexts/ChartsContext";
import { AnalyticsWidgetsProvider } from "@/contexts/AnalyticsWidgetsContext";
import { MetricsWidgetsProvider } from "@/contexts/MetricsWidgetsContext";
import { DashboardWidgetsProvider } from "@/contexts/DashboardWidgetsContext";
import { DealsProvider } from "@/contexts/DealsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { CookieConsent } from "@/components/CookieConsent";
import { CopyProtection } from "@/components/CopyProtection";
import { WelcomeScreenWrapper } from "@/components/WelcomeScreenWrapper";
import { AppLayout } from "@/components/AppLayout";
import Waitlist from "./pages/Waitlist";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Deals from "./pages/Deals";
import Dashboard from "./pages/Dashboard";
import DealDetail from "./pages/DealDetail";
import Settings from "./pages/Settings";
import Account from "./pages/Account";
import Lenders from "./pages/Lenders";
import LenderDatabaseConfig from "./pages/LenderDatabaseConfig";
import LenderSyncHistory from "./pages/LenderSyncHistory";
import Preferences from "./pages/Preferences";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Metrics from "./pages/Metrics";
import Insights from "./pages/Insights";
import SalesBD from "./pages/SalesBD";
import HR from "./pages/HR";
import Operations from "./pages/Operations";
import Database from "./pages/Database";
import Workflows from "./pages/Workflows";
import Company from "./pages/Company";
import AcceptInvite from "./pages/AcceptInvite";
import Notifications from "./pages/Notifications";
import Help from "./pages/Help";
import WaitlistAdmin from "./pages/WaitlistAdmin";
import MigrationTool from "./pages/MigrationTool";
import Admin from "./pages/Admin";
import Integrations from "./pages/Integrations";
import NewsFeed from "./pages/NewsFeed";
import Research from "./pages/Research";
import Agents from "./pages/Agents";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import PendingApproval from "./pages/PendingApproval";
import Homepage from "./pages/Homepage";
import Promo from "./pages/Promo";

const queryClient = new QueryClient();

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
                  <DealTypesProvider>
                  <DefaultMilestonesProvider>
                    <ChartsProvider>
                    <AnalyticsWidgetsProvider>
                    <MetricsWidgetsProvider>
                    <WidgetsProvider>
                    <DashboardWidgetsProvider>
                    <TooltipProvider>
                      <CopyProtection>
                      <WelcomeScreenWrapper />
                      <Toaster />
                      <Sonner />
                      <FeedbackWidget />
                      <BrowserRouter>
                        <CookieConsent />
                        <Routes>
                          <Route path="/" element={<Waitlist />} />
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
                          <Route path="/waitlist-admin" element={
                            <ProtectedRoute><AppLayout><WaitlistAdmin /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/accept-invite" element={<AcceptInvite />} />
                          <Route path="/migrate" element={<MigrationTool />} />
                          <Route path="/admin" element={
                            <ProtectedRoute><AppLayout><Admin /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/integrations" element={
                            <ProtectedRoute><AppLayout><Integrations /></AppLayout></ProtectedRoute>
                          } />
                          <Route path="/research" element={
                            <ProtectedRoute><Research /></ProtectedRoute>
                          } />
                          <Route path="/agents" element={
                            <ProtectedRoute><Agents /></ProtectedRoute>
                          } />
                          <Route path="/privacy" element={<PrivacyPolicy />} />
                          <Route path="/terms" element={<TermsOfService />} />
                          <Route path="/homepage" element={<Homepage />} />
                          <Route path="/promo" element={<Promo />} />
                          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </BrowserRouter>
                      </CopyProtection>
                    </TooltipProvider>
                    </DashboardWidgetsProvider>
                    </WidgetsProvider>
                    </MetricsWidgetsProvider>
                    </AnalyticsWidgetsProvider>
                    </ChartsProvider>
                  </DefaultMilestonesProvider>
                  </DealTypesProvider>
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
