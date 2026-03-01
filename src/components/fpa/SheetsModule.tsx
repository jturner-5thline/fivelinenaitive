import { useState } from 'react';
import { SpreadsheetWorkspace } from '@/components/finance/spreadsheet/SpreadsheetWorkspace';
import { SheetsSidebar } from './sheets/SheetsSidebar';
import { SyncPanel } from './sheets/SyncPanel';
import { FormulaHelpPanel } from './FormulaAutocomplete';
import { DrillDownModal } from './sheets/DrillDownModal';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileSpreadsheet, Upload, RefreshCw, Clock, Sparkles,
  PanelLeftClose, PanelLeft, ArrowDownToLine, ArrowUpFromLine,
  MousePointerClick, Settings
} from 'lucide-react';

export function SheetsModule() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [bottomPanel, setBottomPanel] = useState<'sync' | null>('sync');

  return (
    <div className="space-y-3">
      {/* Top Sync Bar */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">FP&A Workbook</span>
            </div>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last sync: just now</span>
            </div>
            <Badge variant="outline" className="text-[10px]">Bi-directional sync active</Badge>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <MousePointerClick className="h-2.5 w-2.5" />
              Double-click any cell to drill down
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <ArrowUpFromLine className="h-3 w-3" /> Push
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <ArrowDownToLine className="h-3 w-3" /> Pull
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <Sparkles className="h-3 w-3" /> AI Analyze
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant={bottomPanel ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-[10px] gap-1"
              onClick={() => setBottomPanel(bottomPanel ? null : 'sync')}
            >
              <Settings className="h-3 w-3" /> Sync & Automations
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content: Sidebar + Spreadsheet */}
      <div className="flex gap-3">
        {/* Left Sidebar */}
        {sidebarOpen && (
          <div className="w-64 flex-shrink-0 space-y-3">
            <SheetsSidebar />
            <FormulaHelpPanel />
          </div>
        )}

        {/* Spreadsheet Area */}
        <div className="flex-1 min-w-0 space-y-3">
          <SpreadsheetWorkspace />

          {/* Bottom Sync Panel */}
          {bottomPanel === 'sync' && (
            <SyncPanel />
          )}
        </div>
      </div>

      {/* Drill-Down Modal */}
      <DrillDownModal
        open={drillDownOpen}
        onOpenChange={setDrillDownOpen}
      />
    </div>
  );
}
