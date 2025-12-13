import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { LendersProvider } from "@/contexts/LendersContext";
import { WidgetsProvider } from "@/contexts/WidgetsContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DealDetail from "./pages/DealDetail";
import Settings from "./pages/Settings";
import Preferences from "./pages/Preferences";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <PreferencesProvider>
          <LendersProvider>
            <WidgetsProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/login" element={<Auth />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/deal/:id" element={<DealDetail />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/preferences" element={<Preferences />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </TooltipProvider>
            </WidgetsProvider>
          </LendersProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
