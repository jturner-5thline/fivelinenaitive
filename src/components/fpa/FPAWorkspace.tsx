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
import { FPASetupWizard } from './FPASetupWizard';
import { FPAKeyboardShortcuts, ShortcutHintBar } from './FPAKeyboardShortcuts';
import { UndoRedoProvider, UndoRedoToolbar } from './FPAUndoRedo';
import { DataHealthIndicator } from './FPADataHealth';
import { BookmarkableViews, type SavedView } from './FPABookmarkableViews';
import { ExportPresetsButton } from './FPAExportPresets';
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

  const handleSetupComplete = useCallback((config: Record<string, string>) => {
    if (config.source === 'upload') setUploadWizardOpen(true);
    console.log('Setup config:', config);
  }, []);

  const handleRestoreView = useCallback((view: SavedView) => {
    setActiveModule(view.module || 'dashboards');
  }, []);

  return (
    <TooltipProvider>
      <UndoRedoProvider>
        <div className="space-y-4">
          {/* Setup Wizard (first-time) */}
          <FPASetupWizard onComplete={handleSetupComplete} />

          {/* Command Palette (⌘K) + Keyboard Shortcuts (⌘/) */}
          <FPACommandPalette onNavigateToTab={handleNavigateToTab} onAction={handleCommandAction} />
          <FPAKeyboardShortcuts onNavigateToTab={handleNavigateToTab} onAction={handleCommandAction} />
          <SmartUploadWizard open={uploadWizardOpen} onOpenChange={setUploadWizardOpen} />


          {/* Module Navigation */}
          <Tabs value={activeModule} onValueChange={setActiveModule} className="space-y-4">
            <div className="flex items-center justify-between overflow-x-auto gap-2">
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
                <UndoRedoToolbar />
                <BookmarkableViews
                  currentModule={activeModule}
                  currentState={{ module: activeModule }}
                  onRestoreView={handleRestoreView}
                />
                <ExportPresetsButton />
                <ShortcutHintBar />
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
      </UndoRedoProvider>
    </TooltipProvider>
  );
}
