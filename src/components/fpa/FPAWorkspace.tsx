import { useState, useCallback, useMemo, useEffect } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
const MODULE_TAB_DEFS = [
  { key: 'dashboards' },
  { key: 'data' },
  { key: 'sheets' },
  { key: 'ai' },
  { key: 'automations' },
] as const;

export function FPAWorkspace() {
  const [activeModule, setActiveModule] = useState(() => {
    if (typeof window === 'undefined') return 'dashboards';
    const h = window.location.hash.replace('#', '');
    return h && MODULE_TAB_DEFS.some(t => t.key === h) ? h : 'dashboards';
  });

  // Sync from external hash changes (e.g. header section pills).
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace('#', '');
      if (h && MODULE_TAB_DEFS.some(t => t.key === h)) setActiveModule(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Keep hash in sync when user clicks the inner Tabs.
  const handleModuleChange = useCallback((next: string) => {
    setActiveModule(next);
    if (typeof window !== 'undefined' && window.location.hash.replace('#', '') !== next) {
      window.history.replaceState(null, '', `#${next}`);
    }
  }, []);
  const [uploadWizardOpen, setUploadWizardOpen] = useState(false);
  const { canViewModuleTab } = useFPATabPermissions();

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
          <Tabs value={effectiveModule} onValueChange={handleModuleChange} className="space-y-4">
            <TabsContent value="data" className="mt-0">
              <DataModule />
            </TabsContent>

            <TabsContent value="sheets" className="mt-0">
              <SheetsModule />
            </TabsContent>

            <TabsContent value="dashboards" className="mt-0">
              <DashboardModule
                headerExtras={
                  <>
                    <BookmarkableViews
                      currentModule={effectiveModule}
                      currentState={{ module: effectiveModule }}
                      onRestoreView={handleRestoreView}
                    />
                    <FPATour onNavigateToTab={handleNavigateToTab} />
                  </>
                }
              />
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
