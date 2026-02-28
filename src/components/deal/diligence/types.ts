// F2-style Deal Diligence Platform Types

export type LayoutMode = 'ingestion' | 'split' | 'dashboard' | 'report';

export type FileStatus = 'uploading' | 'parsing' | 'mapping' | 'ready' | 'error';

export interface IngestedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: FileStatus;
  progress: number;
  uploadedAt: Date;
  sheetCount?: number;
  rowCount?: number;
  colCount?: number;
  dateRange?: string;
  detectedStatements?: DetectedStatement[];
  error?: string;
  storagePath?: string;
  dbId?: string; // deal_space_financials ID
}

export type StatementType = 'income_statement' | 'balance_sheet' | 'cash_flow' | 'debt_schedule' | 'working_capital' | 'revenue_detail' | 'unknown';

export interface DetectedStatement {
  type: StatementType;
  confidence: number;
  sheetName: string;
  rowRange: [number, number];
  lineItems: DetectedLineItem[];
}

export interface DetectedLineItem {
  label: string;
  standardKey: string; // e.g., 'revenue', 'ebitda', 'total_debt'
  row: number;
  confidence: number;
  values: TimePeriodValue[];
  isCustomMapping?: boolean;
}

export interface TimePeriodValue {
  period: string; // e.g., 'FY2024', 'Q1-2025'
  value: number | null;
  formatted: string;
  sourceCell?: string; // e.g., 'Sheet1!C15'
  isFormula?: boolean;
  formula?: string;
}

export type MetricType = 'currency' | 'percentage' | 'multiple' | 'number' | 'ratio';

export interface FinancialMetric {
  key: string;
  label: string;
  type: MetricType;
  value: number | null;
  formatted: string;
  trend?: 'up' | 'down' | 'flat';
  trendPct?: number;
  source?: SourceReference;
  confidence?: number;
}

export interface SourceReference {
  fileId: string;
  fileName: string;
  sheetName?: string;
  cellAddress?: string;
  pageNumber?: number;
  excerpt?: string;
}

export interface DataIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  type: 'discrepancy' | 'missing' | 'circular_ref' | 'hardcode_override' | 'unusual_movement';
  title: string;
  description: string;
  affectedMetric?: string;
  sources?: SourceReference[];
}

export interface AnalysisMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  sources?: SourceReference[];
  charts?: ChartConfig[];
  tables?: TableData[];
  actions?: MessageAction[];
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'waterfall' | 'pie' | 'combo';
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
}

export interface TableData {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface MessageAction {
  label: string;
  type: 'add_to_report' | 'create_chart' | 'stress_test' | 'explain';
  payload?: Record<string, unknown>;
}

export interface CovenantConfig {
  name: string;
  type: 'leverage' | 'coverage' | 'minimum_cash' | 'custom';
  threshold: number;
  operator: 'lt' | 'lte' | 'gt' | 'gte';
  currentValue?: number;
  headroom?: number;
  status?: 'compliant' | 'warning' | 'breach';
}

export interface ScenarioConfig {
  name: string;
  type: 'base' | 'downside' | 'severe_downside' | 'custom';
  assumptions: ScenarioAssumption[];
}

export interface ScenarioAssumption {
  metric: string;
  adjustment: number; // percentage change
  label: string;
}

export interface DiligencePlatformState {
  layoutMode: LayoutMode;
  files: IngestedFile[];
  selectedFileId: string | null;
  selectedSources: string[]; // file IDs to filter by
  auditMode: boolean;
  messages: AnalysisMessage[];
  dataIssues: DataIssue[];
  extractedMetrics: FinancialMetric[];
  covenants: CovenantConfig[];
  scenarios: ScenarioConfig[];
}
