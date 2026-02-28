import { useState, useCallback, useEffect } from 'react';
import {
  Upload, LayoutDashboard, Columns2, FileText, Shield, ShieldCheck,
  ChevronDown, Check, Loader2, FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { ExtractionView } from './ExtractionView';
import { AnalysisChat } from './AnalysisChat';
import { AnalyticsDashboard } from './dashboard/AnalyticsDashboard';
import { SourceTracePanel, SourceTraceData } from './audit/SourceTracePanel';
import { AuditLogPanel, AuditLogEntry } from './audit/AuditLogPanel';
import { createExtractionAuditEntries } from './audit/auditUtils';
import { CovenantMonitor } from './covenants/CovenantMonitor';
import { ScenarioAnalysis } from './covenants/ScenarioAnalysis';
import { DataValidationPanel } from './validation/DataValidationPanel';
import { TimeSeriesVariancePanel } from './timeseries/TimeSeriesVariancePanel';
import { ReportEditor } from './report/ReportEditor';
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

const LAYOUT_MODES: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'ingestion', label: 'Ingest', icon: <Upload className="h-3.5 w-3.5" /> },
  { mode: 'split', label: 'Split View', icon: <Columns2 className="h-3.5 w-3.5" /> },
  { mode: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { mode: 'report', label: 'Report', icon: <FileText className="h-3.5 w-3.5" /> },
];

// Demo/mock data for extraction results (in production, these come from AI)
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

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('ingestion');
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

    // Auto-switch to split view when files are available
    if (synced.length > 0 && layoutMode === 'ingestion') {
      // Keep ingestion mode if user just arrived
    }
  }, [financials]);

  const handleUpload = useCallback(async (fileList: FileList) => {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Add provisional entry
      const tempId = crypto.randomUUID();
      setFiles(prev => [...prev, {
        id: tempId,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading',
        progress: 30,
        uploadedAt: new Date(),
      }]);

      try {
        // Upload
        setFiles(prev => prev.map(f => f.id === tempId ? { ...f, progress: 60, status: 'uploading' } : f));
        const result = await uploadFinancial(file);

        if (result) {
          // Parsing phase
          setFiles(prev => prev.map(f => f.id === tempId ? {
            ...f,
            progress: 80,
            status: 'parsing',
            dbId: result.id,
            storagePath: result.file_path,
          } : f));

          // Quick delay to simulate parsing
          await new Promise(r => setTimeout(r, 800));

          setFiles(prev => prev.map(f => f.id === tempId ? {
            ...f,
            progress: 100,
            status: 'ready',
          } : f));

          // Auto-trigger extraction after upload
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

        // Generate audit log entries
        const newEntries = createExtractionAuditEntries(
          data.statements || [],
          data.metrics || [],
          dealData?.company || 'System'
        );
        setAuditLog(prev => [...newEntries, ...prev]);

        // Auto-switch to split view after successful extraction
        if (data.statements?.length > 0 || data.metrics?.length > 0) {
          setLayoutMode('split');
        }
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
      const { data } = await supabase.storage
        .from('deal-space')
        .createSignedUrl(file.storagePath, 3600);
      if (data) {
        await parseExcelFromUrl(data.signedUrl, file.name);
        setLayoutMode('split');
      }
    }
  }, [files, parseExcelFromUrl]);

  const toggleSource = (fileId: string) => {
    setSelectedSources(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  const contextSummary = [
    dealData?.company ? `Company: ${dealData.company}` : '',
    dealData?.value ? `Deal Value: $${(dealData.value / 1000000).toFixed(1)}MM` : '',
    dealData?.stage ? `Stage: ${dealData.stage}` : '',
    files.length > 0 ? `Files: ${files.map(f => f.name).join(', ')}` : '',
    metrics.length > 0 ? `Key Metrics: ${metrics.map(m => `${m.label}: ${m.formatted}`).join('; ')}` : '',
    statements.length > 0 ? `Detected: ${statements.map(s => s.type).join(', ')}` : '',
  ].filter(Boolean).join('\\n');

  return (
    <div className="flex flex-col gap-0 -mx-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 py-2">
        <div className="flex items-center gap-1">
          {LAYOUT_MODES.map(lm => (
            <Button
              key={lm.mode}
              variant={layoutMode === lm.mode ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-7 text-xs gap-1.5",
                layoutMode === lm.mode && "bg-primary/10 text-primary"
              )}
              onClick={() => setLayoutMode(lm.mode)}
            >
              {lm.icon}
              {lm.label}
            </Button>
          ))}

          <Separator orientation="vertical" className="h-5 mx-1" />

          {/* Sources dropdown */}
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

        <div className="flex items-center gap-1">
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

          {files.filter(f => f.status === 'ready').length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => triggerExtraction()}
              disabled={isExtracting}
            >
              {isExtracting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Re-extract
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[600px]">
        {layoutMode === 'ingestion' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <IngestionPanel
                files={files}
                isUploading={isUploading}
                onUpload={handleUpload}
                onRemoveFile={handleRemoveFile}
                onSelectFile={handleSelectFile}
                selectedFileId={selectedFileId}
              />
            </div>
            <div>
              <AnalysisChat
                dealId={dealId}
                messages={messages}
                onMessagesChange={setMessages}
                contextSummary={contextSummary}
                className="h-[600px] rounded-xl border border-border/30"
              />
            </div>
          </div>
        )}

        {layoutMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            <div>
              <IngestionPanel
                files={files}
                isUploading={isUploading}
                onUpload={handleUpload}
                onRemoveFile={handleRemoveFile}
                onSelectFile={handleSelectFile}
                selectedFileId={selectedFileId}
                className="mb-4"
              />
              <ExtractionView
                statements={statements}
                metrics={metrics}
                issues={issues}
                auditMode={auditMode}
                files={files.map(f => ({ id: f.id, name: f.name }))}
                onTraceClick={(trace) => setActiveTrace(trace)}
              />
              <DataValidationPanel
                statements={statements}
                metrics={metrics}
                issues={issues}
                className="mt-4"
              />
              <TimeSeriesVariancePanel
                statements={statements}
                className="mt-4"
              />
              {auditMode && auditLog.length > 0 && (
                <AuditLogPanel entries={auditLog} className="mt-4" />
              )}
            </div>
            <div className="space-y-4">
              {activeTrace && auditMode && (
                <SourceTracePanel trace={activeTrace} onClose={() => setActiveTrace(null)} />
              )}
              <AnalysisChat
                dealId={dealId}
                messages={messages}
                onMessagesChange={setMessages}
                contextSummary={contextSummary}
                className="h-[700px] rounded-xl border border-border/30 sticky top-4"
              />
            </div>
          </div>
        )}

        {layoutMode === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
            <div className="space-y-4">
              <AnalyticsDashboard
                statements={statements}
                metrics={metrics}
                issues={issues}
                auditMode={auditMode}
              />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <CovenantMonitor
                  covenants={covenants}
                  onCovenantsChange={setCovenants}
                />
                <ScenarioAnalysis
                  metrics={metrics}
                  covenants={covenants}
                />
              </div>
              <TimeSeriesVariancePanel
                statements={statements}
                className="mt-0"
              />
              {auditMode && auditLog.length > 0 && (
                <AuditLogPanel entries={auditLog} className="mt-4" />
              )}
            </div>
            <div className="space-y-4">
              {activeTrace && auditMode && (
                <SourceTracePanel trace={activeTrace} onClose={() => setActiveTrace(null)} />
              )}
              <AnalysisChat
                dealId={dealId}
                messages={messages}
                onMessagesChange={setMessages}
                contextSummary={contextSummary}
                className="h-[700px] rounded-xl border border-border/30 sticky top-4"
              />
            </div>
          </div>
        )}

        {layoutMode === 'report' && (
          <ReportEditor
            dealName={dealData?.company}
            dealStage={dealData?.stage}
            dealValue={dealData?.value}
            metrics={metrics}
            statements={statements}
          />
        )}
      </div>
    </div>
  );
}
