import { useState, useCallback, useMemo } from 'react';
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
import { useFPATabPermissions } from '@/hooks/useFPATabPermissions';
import {
  Database, FileSpreadsheet, BarChart3, Sparkles, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const MODULE_TAB_DEFS = [
  { key: 'dashboards', label: 'Dashboards', icon: BarChart3 },
  { key: 'data', label: 'Data', icon: Database },
  { key: 'sheets', label: 'Sheets', icon: FileSpreadsheet },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'automations', label: 'Automations', icon: Zap },
] as const;

export function FPAWorkspace() {
  const [activeModule, setActiveModule] = useState('dashboards');
  const [uploadWizardOpen, setUploadWizardOpen] = useState(false);
  const { canViewModuleTab } = useFPATabPermissions();

  const visibleModuleTabs = useMemo(
    () => MODULE_TAB_DEFS.filter(t => canViewModuleTab(t.key)),
    [canViewModuleTab]
  );

  const handleNavigateToTab = useCallback((tab: string) => {
    if (canViewModuleTab(tab)) {
      setActiveModule(tab);
    }
  }, [canViewModuleTab]);

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

  // If the active module is no longer visible, redirect to dashboards
  const effectiveModule = canViewModuleTab(activeModule) ? activeModule : 'dashboards';

  return (
    <TooltipProvider>
      <UndoRedoProvider>
        <div className="space-y-4">
          {/* Setup Wizard (first-time) */}
          <FPASetupWizard onComplete={handleSetupComplete} />

          <SmartUploadWizard open={uploadWizardOpen} onOpenChange={setUploadWizardOpen} />


          {/* Module Navigation */}
          <Tabs value={effectiveModule} onValueChange={setActiveModule} className="space-y-4">
            <div className="flex items-center justify-between overflow-x-auto gap-2">
              <TabsList className="inline-flex w-auto">
                {visibleModuleTabs.map(tab => (
                  <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 px-4">
                    <tab.icon className="h-3.5 w-3.5" />
                    <span className="text-xs">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex items-center gap-2">
                <BookmarkableViews
                  currentModule={effectiveModule}
                  currentState={{ module: effectiveModule }}
                  onRestoreView={handleRestoreView}
                />
                <ExportPresetsButton />
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
