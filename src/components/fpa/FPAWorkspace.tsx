import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FPAStatusBar } from './FPAStatusBar';
import { DataModule } from './DataModule';
import { SheetsModule } from './SheetsModule';
import { DashboardModule } from './DashboardModule';
import { AIModule } from './AIModule';
import { AutomationsModule } from './AutomationsModule';
import { FPATour } from './FPATour';
import { FPACommandPalette } from './FPACommandPalette';
import { SmartUploadWizard } from './SmartUploadWizard';
import {
  Database, FileSpreadsheet, BarChart3, Sparkles, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function FPAWorkspace() {
  const [activeModule, setActiveModule] = useState('dashboards');
  const [uploadWizardOpen, setUploadWizardOpen] = useState(false);

  const handleNavigateToTab = useCallback((tab: string) => {
    setActiveModule(tab);
  }, []);

  const handleCommandAction = useCallback((actionId: string) => {
    if (actionId === 'upload-workbook') {
      setUploadWizardOpen(true);
    }
    console.log('Command action:', actionId);
  }, []);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Command Palette (⌘K) */}
        <FPACommandPalette onNavigateToTab={handleNavigateToTab} onAction={handleCommandAction} />
        <SmartUploadWizard open={uploadWizardOpen} onOpenChange={setUploadWizardOpen} />

        {/* Status Bar */}
        <FPAStatusBar />

        {/* Module Navigation */}
        <Tabs value={activeModule} onValueChange={setActiveModule} className="space-y-4">
          <div className="flex items-center justify-between overflow-x-auto">
            <TabsList className="inline-flex w-auto">
              <TabsTrigger value="data" className="gap-1.5 px-4">
                <Database className="h-3.5 w-3.5" />
                <span className="text-xs">Data</span>
              </TabsTrigger>
              <TabsTrigger value="sheets" className="gap-1.5 px-4">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="text-xs">Sheets</span>
              </TabsTrigger>
              <TabsTrigger value="dashboards" className="gap-1.5 px-4">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="text-xs">Dashboards</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5 px-4">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="text-xs">AI</span>
              </TabsTrigger>
              <TabsTrigger value="automations" className="gap-1.5 px-4">
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs">Automations</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] hidden md:flex">⌘K to search</Badge>
              <FPATour onNavigateToTab={handleNavigateToTab} />
            </div>
          </div>

          <TabsContent value="data" className="mt-0">
            <DataModule />
          </TabsContent>

          <TabsContent value="sheets" className="mt-0">
            <SheetsModule />
          </TabsContent>

          <TabsContent value="dashboards" className="mt-0">
            <DashboardModule />
          </TabsContent>

          <TabsContent value="ai" className="mt-0">
            <AIModule />
          </TabsContent>

          <TabsContent value="automations" className="mt-0">
            <AutomationsModule />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
