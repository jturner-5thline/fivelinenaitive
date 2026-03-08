import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Shield, ShieldCheck,
  ChevronDown, Loader2, FileSpreadsheet, Keyboard, Sparkles,
  PanelLeftClose, PanelLeft, FolderOpen
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
import { useDealSpaceDocuments } from '@/hooks/useDealSpaceDocuments';
import { useExcelModelParser } from '@/hooks/useExcelModelParser';
import { supabase } from '@/integrations/supabase/client';

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
import { FileSelectionModal } from './FileSelectionModal';
import { SplitViewPanel } from './SplitViewPanel';
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

  // Documents from the Documents tab (for the file selector)
  const { documents: allDocuments, isLoading: docsLoading } = useDealSpaceDocuments(dealId);

  const { parsedModel, isLoading: isParsing, parseExcelFromUrl, clearModel } = useExcelModelParser();

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('ingestion');
  const [auditMode, setAuditMode] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [files, setFiles] = useState<IngestedFile[]>([]);
  const [statements, setStatements] = useState<DetectedStatement[]>(DEMO_STATEMENTS);
  const [metrics, setMetrics] = useState<FinancialMetric[]>(DEMO_METRICS);
  const [issues, setIssues] = useState<DataIssue[]>(DEMO_ISSUES);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [activeTrace, setActiveTrace] = useState<SourceTraceData | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [covenants, setCovenants] = useState<CovenantConfig[]>([]);
  const [showFileSelector, setShowFileSelector] = useState(false);
  const [showSplitView, setShowSplitView] = useState(false);

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

  // Handle files selected from the Documents tab via the file selector modal
  const handleFilesSelected = useCallback(async (selectedDocs: import('@/hooks/useDealSpaceDocuments').DealSpaceDocument[]) => {
    // For each selected doc, copy it to deal-space financials
    for (const doc of selectedDocs) {
      // Check if already ingested
      if (files.some(f => f.name === doc.name)) continue;

      const tempId = crypto.randomUUID();
      setFiles(prev => [...prev, {
        id: tempId, name: doc.name, size: doc.size_bytes, type: doc.content_type || '',
        status: 'uploading', progress: 30, uploadedAt: new Date(),
      }]);

      try {
        // Download the file from its source bucket
        const bucket = doc.storage_bucket || 'deal-space';
        const { data: signedData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(doc.file_path, 3600);

        if (signedError || !signedData) throw new Error('Could not access file');

        const response = await fetch(signedData.signedUrl);
        const blob = await response.blob();
        const file = new File([blob], doc.name, { type: doc.content_type || 'application/octet-stream' });

        setFiles(prev => prev.map(f => f.id === tempId ? { ...f, progress: 60, status: 'parsing' as const } : f));
        const result = await uploadFinancial(file);

        if (result) {
          setFiles(prev => prev.map(f => f.id === tempId ? {
            ...f, progress: 100, status: 'ready' as const, dbId: result.id, storagePath: result.file_path,
          } : f));
          triggerExtraction(result.id);
        }
      } catch {
        setFiles(prev => prev.map(f => f.id === tempId ? { ...f, status: 'error' as const, error: 'Import failed' } : f));
      }
    }
  }, [files, uploadFinancial]);

  const triggerExtraction = useCallback(async (fileId?: string) => {
    setIsExtracting(true);
    setExtractionError(null);
    try {
      const { data, error } = await supabase.functions.invoke('deal-diligence-ai', {
        body: { dealId, action: 'extract', fileId },
      });

      if (error) throw new Error(error.message || 'Extraction failed');
      if (data?.error) throw new Error(data.error);

      if (!error && data) {
        if (data.statements) setStatements(data.statements);
        if (data.metrics) setMetrics(data.metrics);
        if (data.issues) setIssues(data.issues);
        const newEntries = createExtractionAuditEntries(data.statements || [], data.metrics || [], dealData?.company || 'System');
        setAuditLog(prev => [...newEntries, ...prev]);
      }
    } catch (err) {
      console.error('Extraction error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to extract metrics';
      setExtractionError(msg);
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

  const hasFiles = files.length > 0;
  const hasMetrics = metrics.length > 0;
  const readyFiles = files.filter(f => f.status === 'ready');
  const selectedFile = selectedFileId ? files.find(f => f.id === selectedFileId) || null : null;

  // IDs of documents already ingested into analysis
  const alreadyIngestedIds = files.map(f => f.name);

  return (
    <div className="flex flex-col gap-0 -mx-1">
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
          <RealtimePresence dealId={dealId} currentView={layoutMode} />

          {isExtracting && (
            <Badge variant="secondary" className="text-[10px] gap-1 h-6">
              <Loader2 className="h-3 w-3 animate-spin" />
              Extracting…
            </Badge>
          )}

          {/* Split View toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showSplitView ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("h-7 text-xs gap-1", showSplitView && "bg-primary/10 text-primary")}
                  onClick={() => setShowSplitView(!showSplitView)}
                  disabled={!hasFiles}
                >
                  {showSplitView ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
                  Split View
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{showSplitView ? 'Close split view' : 'Preview file alongside notes'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

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

          {hasFiles && readyFiles.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => triggerExtraction()} disabled={isExtracting}>
              {isExtracting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Re-extract
            </Button>
          )}
        </div>
      </div>

      <ShortcutCheatSheet open={showCheatSheet} onClose={() => setShowCheatSheet(false)} />

      {/* Split View */}
      {showSplitView && hasFiles && (
        <SplitViewPanel
          dealId={dealId}
          file={selectedFile || readyFiles[0] || null}
          onClose={() => setShowSplitView(false)}
        />
      )}

      {/* Main content — only show when not in split view */}
      {!showSplitView && (
        <div className="space-y-6">
          {/* File selector area (replaces upload dropzone) */}
          {!hasFiles ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <FolderOpen className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Select files for analysis</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Choose financial models, CIMs, or spreadsheets from your Documents tab. The AI will extract statements, calculate key metrics, and flag data issues.
              </p>
              <Button onClick={() => setShowFileSelector(true)} className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Select files from Documents
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Ingested files list (read-only, no upload dropzone) */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected for analysis
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowFileSelector(true)}
                >
                  <FolderOpen className="h-3 w-3" />
                  Add more files
                </Button>
              </div>

              {/* Compact file list */}
              <div className="space-y-1">
                {files.map(file => {
                  const isReady = file.status === 'ready';
                  const isError = file.status === 'error';
                  return (
                    <div
                      key={file.id}
                      onClick={() => isReady && handleSelectFile(file.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                        isReady && "cursor-pointer hover:bg-muted/60",
                        selectedFileId === file.id && "bg-primary/10 ring-1 ring-primary/20"
                      )}
                    >
                      <FileSpreadsheet className={cn("h-4 w-4", isReady ? "text-emerald-400" : isError ? "text-destructive" : "text-muted-foreground")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{file.name}</span>
                          {isReady && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <Sparkles className="h-3 w-3" />
                              Ready
                            </span>
                          )}
                          {!isReady && !isError && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing…
                            </span>
                          )}
                          {isError && (
                            <span className="text-[10px] text-destructive">{file.error || 'Error'}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFile(file.id); }}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dashboard Section */}
          {hasFiles && (
            <div className="space-y-4">
              {extractionError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
                  <Shield className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">Extraction Failed</p>
                    <p className="text-xs text-muted-foreground mt-1">{extractionError}</p>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs flex-shrink-0" onClick={() => triggerExtraction()} disabled={isExtracting}>
                    Retry
                  </Button>
                </div>
              )}

              {!hasMetrics && readyFiles.length > 0 && !isExtracting && !extractionError && (
                <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-6 flex flex-col items-center text-center gap-3">
                  <Sparkles className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Ready to extract metrics</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {readyFiles.length} file{readyFiles.length !== 1 ? 's' : ''} ingested. Click below to extract KPIs, ratios, and financial data.
                    </p>
                  </div>
                  <Button onClick={() => triggerExtraction()} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Extract Metrics
                  </Button>
                </div>
              )}

              {isExtracting && !hasMetrics && (
                <div className="rounded-xl border border-border/30 p-6 flex flex-col items-center text-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div>
                    <p className="text-sm font-medium">Extracting metrics…</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Parsing {readyFiles.map(f => f.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {hasMetrics ? (
                <>
                  <AnalyticsDashboard statements={statements} metrics={metrics} issues={issues} auditMode={auditMode} />
                  {auditMode && activeTrace && <SourceTracePanel trace={activeTrace} onClose={() => setActiveTrace(null)} />}
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
              ) : !isExtracting && !extractionError && readyFiles.length === 0 ? (
                <DiligenceEmptyState mode="dashboard" hasFiles={hasFiles} hasMetrics={false} />
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* File Selection Modal */}
      <FileSelectionModal
        isOpen={showFileSelector}
        onClose={() => setShowFileSelector(false)}
        documents={allDocuments}
        alreadySelectedIds={files.map(f => f.id)}
        onConfirm={handleFilesSelected}
        isLoading={isUploading}
      />
    </div>
  );
}
