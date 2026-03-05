import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Shield, ShieldCheck,
  ChevronDown, Loader2, FileSpreadsheet, Keyboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDealSpaceFinancials } from '@/hooks/useDealSpaceFinancials';
import { useExcelModelParser } from '@/hooks/useExcelModelParser';
import { supabase } from '@/integrations/supabase/client';
import { IngestionPanel } from './IngestionPanel';

import { AnalysisChat } from './AnalysisChat';
import { AnalyticsDashboard } from './dashboard/AnalyticsDashboard';
import { SourceTracePanel, SourceTraceData } from './audit/SourceTracePanel';
import { AuditLogPanel, AuditLogEntry } from './audit/AuditLogPanel';
import { createExtractionAuditEntries } from './audit/auditUtils';
import { CovenantMonitor } from './covenants/CovenantMonitor';
import { ScenarioAnalysis } from './covenants/ScenarioAnalysis';
import { DataValidationPanel } from './validation/DataValidationPanel';
import { TimeSeriesVariancePanel } from './timeseries/TimeSeriesVariancePanel';
import { DataRoomIntegration } from './dataroom/DataRoomIntegration';
import { ComparableBenchmarking } from './benchmarking/ComparableBenchmarking';
import { DiligenceEmptyState } from './DiligenceEmptyState';
import { useKeyboardShortcuts, ShortcutCheatSheet } from './KeyboardShortcuts';
import { RealtimePresence } from './RealtimePresence';
import {
  LayoutMode, IngestedFile, DiligencePlatformState, AnalysisMessage,
  DetectedStatement, FinancialMetric, DataIssue, CovenantConfig
} from './types';

interface DealDiligencePlatformProps {
  dealId: string;
  dealData?: {
    company: string;
    value?: number;
    stage?: string;
  };
}


const DEMO_STATEMENTS: DetectedStatement[] = [];
const DEMO_METRICS: FinancialMetric[] = [];
const DEMO_ISSUES: DataIssue[] = [];

export function DealDiligencePlatform({ dealId, dealData }: DealDiligencePlatformProps) {
  const {
    financials,
    isLoading: filesLoading,
    isUploading,
    uploadFinancial,
    deleteFinancial,
    getDownloadUrl,
  } = useDealSpaceFinancials(dealId);

  const { parsedModel, isLoading: isParsing, parseExcelFromUrl, clearModel } = useExcelModelParser();

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('ingestion'); // kept for keyboard shortcut compat
  const [auditMode, setAuditMode] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [messages, setMessages] = useState<AnalysisMessage[]>([]);
  const [files, setFiles] = useState<IngestedFile[]>([]);
  const [statements, setStatements] = useState<DetectedStatement[]>(DEMO_STATEMENTS);
  const [metrics, setMetrics] = useState<FinancialMetric[]>(DEMO_METRICS);
  const [issues, setIssues] = useState<DataIssue[]>(DEMO_ISSUES);
  const [isExtracting, setIsExtracting] = useState(false);
  const [activeTrace, setActiveTrace] = useState<SourceTraceData | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [covenants, setCovenants] = useState<CovenantConfig[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts
  const { showCheatSheet, setShowCheatSheet } = useKeyboardShortcuts({
    onSwitchMode: (mode) => setLayoutMode(mode as LayoutMode),
    onExtract: () => triggerExtraction(),
    onToggleAudit: () => setAuditMode(prev => !prev),
  });

  // Sync uploaded financials into the local files list
  useEffect(() => {
    const synced: IngestedFile[] = financials.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size_bytes,
      type: f.content_type || '',
      status: 'ready' as const,
      progress: 100,
      uploadedAt: new Date(f.created_at),
      dbId: f.id,
      storagePath: f.file_path,
    }));
    setFiles(synced);
  }, [financials]);

  const handleUpload = useCallback(async (fileList: FileList) => {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const tempId = crypto.randomUUID();
      setFiles(prev => [...prev, {
        id: tempId, name: file.name, size: file.size, type: file.type,
        status: 'uploading', progress: 30, uploadedAt: new Date(),
      }]);

      try {
        setFiles(prev => prev.map(f => f.id === tempId ? { ...f, progress: 60, status: 'uploading' } : f));
        const result = await uploadFinancial(file);

        if (result) {
          setFiles(prev => prev.map(f => f.id === tempId ? {
            ...f, progress: 80, status: 'parsing', dbId: result.id, storagePath: result.file_path,
          } : f));
          await new Promise(r => setTimeout(r, 800));
          setFiles(prev => prev.map(f => f.id === tempId ? { ...f, progress: 100, status: 'ready' } : f));
          triggerExtraction(result.id);
        }
      } catch {
        setFiles(prev => prev.map(f => f.id === tempId ? { ...f, status: 'error', error: 'Upload failed' } : f));
      }
    }
  }, [uploadFinancial]);

  const triggerExtraction = useCallback(async (fileId?: string) => {
    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-diligence-ai', {
        body: { dealId, action: 'extract', fileId },
      });

      if (!error && data) {
        if (data.statements) setStatements(data.statements);
        if (data.metrics) setMetrics(data.metrics);
        if (data.issues) setIssues(data.issues);
        const newEntries = createExtractionAuditEntries(data.statements || [], data.metrics || [], dealData?.company || 'System');
        setAuditLog(prev => [...newEntries, ...prev]);
        
      }
    } catch (err) {
      console.error('Extraction error:', err);
    } finally {
      setIsExtracting(false);
    }
  }, [dealId]);

  const handleRemoveFile = useCallback(async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file?.dbId) {
      const financial = financials.find(f => f.id === file.dbId);
      if (financial) await deleteFinancial(financial);
    }
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, [files, financials, deleteFinancial]);

  const handleSelectFile = useCallback(async (fileId: string) => {
    setSelectedFileId(fileId);
    const file = files.find(f => f.id === fileId);
    if (file?.storagePath) {
      const { data } = await supabase.storage.from('deal-space').createSignedUrl(file.storagePath, 3600);
      if (data) {
        await parseExcelFromUrl(data.signedUrl, file.name);
        setLayoutMode('dashboard');
      }
    }
  }, [files, parseExcelFromUrl]);

  const toggleSource = (fileId: string) => {
    setSelectedSources(prev => prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]);
  };

  const handleEmptyUpload = () => fileInputRef.current?.click();

  const contextSummary = [
    dealData?.company ? `Company: ${dealData.company}` : '',
    dealData?.value ? `Deal Value: $${(dealData.value / 1000000).toFixed(1)}MM` : '',
    dealData?.stage ? `Stage: ${dealData.stage}` : '',
    files.length > 0 ? `Files: ${files.map(f => f.name).join(', ')}` : '',
    metrics.length > 0 ? `Key Metrics: ${metrics.map(m => `${m.label}: ${m.formatted}`).join('; ')}` : '',
    statements.length > 0 ? `Detected: ${statements.map(s => s.type).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const hasFiles = files.length > 0;
  const hasMetrics = metrics.length > 0;

  return (
    <div className="flex flex-col gap-0 -mx-1">
      {/* Hidden file input for empty state */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".xlsx,.xls,.csv,.pdf"
        onChange={(e) => e.target.files && handleUpload(e.target.files)}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 py-2">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {selectedSources.length === 0 ? 'All sources' : `${selectedSources.length} selected`}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs">Filter by source</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {files.filter(f => f.status === 'ready').map(f => (
                <DropdownMenuCheckboxItem
                  key={f.id}
                  checked={selectedSources.length === 0 || selectedSources.includes(f.id)}
                  onCheckedChange={() => toggleSource(f.id)}
                  className="text-xs"
                >
                  {f.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Realtime presence */}
          <RealtimePresence dealId={dealId} currentView={layoutMode} />

          {isExtracting && (
            <Badge variant="secondary" className="text-[10px] gap-1 h-6">
              <Loader2 className="h-3 w-3 animate-spin" />
              Extracting…
            </Badge>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={auditMode ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("h-7 text-xs gap-1", auditMode && "bg-amber-500/10 text-amber-400")}
                  onClick={() => setAuditMode(!auditMode)}
                >
                  {auditMode ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                  Audit
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{auditMode ? 'Audit mode on — click numbers to see sources' : 'Enable audit mode for source traceability'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Keyboard shortcuts button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowCheatSheet(true)}>
                  <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Keyboard shortcuts (⌘?)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {hasFiles && files.filter(f => f.status === 'ready').length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => triggerExtraction()} disabled={isExtracting}>
              {isExtracting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Re-extract
            </Button>
          )}
        </div>
      </div>

      {/* Shortcut cheat sheet overlay */}
      <ShortcutCheatSheet open={showCheatSheet} onClose={() => setShowCheatSheet(false)} />

      {/* Unified Content Area */}
      <div className="space-y-6">
        {/* Ingest Section */}
        {!hasFiles ? (
          <DiligenceEmptyState mode="ingestion" hasFiles={false} hasMetrics={false} onUpload={handleEmptyUpload} />
        ) : (
          <IngestionPanel
            files={files} isUploading={isUploading} onUpload={handleUpload}
            onRemoveFile={handleRemoveFile} onSelectFile={handleSelectFile} selectedFileId={selectedFileId}
          />
        )}

        {/* Dashboard Section */}
        {hasFiles && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            <div className="space-y-4">
              {hasMetrics ? (
                <>
                  <AnalyticsDashboard statements={statements} metrics={metrics} issues={issues} auditMode={auditMode} />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <CovenantMonitor covenants={covenants} onCovenantsChange={setCovenants} />
                    <ScenarioAnalysis metrics={metrics} covenants={covenants} />
                  </div>
                  <TimeSeriesVariancePanel statements={statements} className="mt-0" />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <ComparableBenchmarking dealId={dealId} dealName={dealData?.company} dealValue={dealData?.value} metrics={metrics} />
                    <DataRoomIntegration dealId={dealId} issues={issues} statements={statements} />
                  </div>
                  {auditMode && auditLog.length > 0 && <AuditLogPanel entries={auditLog} className="mt-4" />}
                </>
              ) : (
                <DiligenceEmptyState mode="dashboard" hasFiles={hasFiles} hasMetrics={false} />
              )}
            </div>
            <div className="space-y-4">
              {activeTrace && auditMode && <SourceTracePanel trace={activeTrace} onClose={() => setActiveTrace(null)} />}
              <AnalysisChat
                dealId={dealId} messages={messages} onMessagesChange={setMessages}
                contextSummary={contextSummary} className="h-[700px] rounded-xl border border-border/30 sticky top-4"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
