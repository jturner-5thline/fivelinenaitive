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
import { DealsProvider } from "@/contexts/DealsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Waitlist from "./pages/Waitlist";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Deals from "./pages/Deals";
import DealDetail from "./pages/DealDetail";
import Settings from "./pages/Settings";
import Account from "./pages/Account";
import Lenders from "./pages/Lenders";
import LenderDatabaseConfig from "./pages/LenderDatabaseConfig";
import Preferences from "./pages/Preferences";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Database from "./pages/Database";
import Workflows from "./pages/Workflows";
import Company from "./pages/Company";
import AcceptInvite from "./pages/AcceptInvite";
import Notifications from "./pages/Notifications";
import Help from "./pages/Help";
import WaitlistAdmin from "./pages/WaitlistAdmin";
import MigrationTool from "./pages/MigrationTool";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
                    <WidgetsProvider>
                    <TooltipProvider>
                      <Toaster />
                      <Sonner />
                      <BrowserRouter>
                        <Routes>
                          <Route path="/" element={<Waitlist />} />
                          <Route path="/home" element={<Index />} />
                          <Route path="/login" element={<Auth />} />
                          <Route path="/auth" element={<Auth />} />
                          <Route path="/onboarding" element={
                            <ProtectedRoute skipOnboarding><Onboarding /></ProtectedRoute>
                          } />
                          <Route path="/deals" element={
                            <ProtectedRoute><Deals /></ProtectedRoute>
                          } />
                          <Route path="/dashboard" element={<Navigate to="/deals" replace />} />
                          <Route path="/analytics" element={
                            <ProtectedRoute><Analytics /></ProtectedRoute>
                          } />
                          <Route path="/reports" element={
                            <ProtectedRoute><Reports /></ProtectedRoute>
                          } />
                          <Route path="/deal/:id" element={
                            <ProtectedRoute><DealDetail /></ProtectedRoute>
                          } />
                          <Route path="/settings" element={
                            <ProtectedRoute><Settings /></ProtectedRoute>
                          } />
                          <Route path="/account" element={
                            <ProtectedRoute><Account /></ProtectedRoute>
                          } />
                          <Route path="/lenders" element={
                            <ProtectedRoute><Lenders /></ProtectedRoute>
                          } />
                          <Route path="/lenders/config" element={
                            <ProtectedRoute><LenderDatabaseConfig /></ProtectedRoute>
                          } />
                          <Route path="/preferences" element={
                            <ProtectedRoute><Preferences /></ProtectedRoute>
                          } />
                          <Route path="/database" element={
                            <ProtectedRoute><Database /></ProtectedRoute>
                          } />
                          <Route path="/workflows" element={
                            <ProtectedRoute><Workflows /></ProtectedRoute>
                          } />
                          <Route path="/company" element={
                            <ProtectedRoute><Company /></ProtectedRoute>
                          } />
                          <Route path="/notifications" element={
                            <ProtectedRoute><Notifications /></ProtectedRoute>
                          } />
                          <Route path="/help" element={
                            <ProtectedRoute><Help /></ProtectedRoute>
                          } />
                          <Route path="/waitlist-admin" element={
                            <ProtectedRoute><WaitlistAdmin /></ProtectedRoute>
                          } />
                          <Route path="/accept-invite" element={<AcceptInvite />} />
                          <Route path="/migrate" element={<MigrationTool />} />
                          <Route path="/admin" element={
                            <ProtectedRoute><Admin /></ProtectedRoute>
                          } />
                          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </BrowserRouter>
                    </TooltipProvider>
                    </WidgetsProvider>
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
