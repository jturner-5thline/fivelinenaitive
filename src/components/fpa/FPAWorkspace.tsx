import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FPAStatusBar } from './FPAStatusBar';
import { DataModule } from './DataModule';
import { SheetsModule } from './SheetsModule';
import { DashboardModule } from './DashboardModule';
import { AIModule } from './AIModule';
import { AutomationsModule } from './AutomationsModule';
import {
  Database, FileSpreadsheet, BarChart3, Sparkles, Zap
} from 'lucide-react';

export function FPAWorkspace() {
  const [activeModule, setActiveModule] = useState('dashboards');

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Status Bar */}
        <FPAStatusBar />

        {/* Module Navigation */}
        <Tabs value={activeModule} onValueChange={setActiveModule} className="space-y-4">
          <div className="overflow-x-auto">
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
