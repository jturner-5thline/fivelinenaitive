import { DetectedStatement, FinancialMetric, SourceReference, TimePeriodValue } from '../types';
import { SourceTraceData, LineageStep } from './SourceTracePanel';
import { AuditLogEntry } from './AuditLogPanel';

/**
 * Build a SourceTraceData for a clicked value in the extraction table.
 */
export function buildTraceForValue(
  statement: DetectedStatement,
  lineItemIndex: number,
  valueIndex: number,
  files: { id: string; name: string }[]
): SourceTraceData | null {
  const li = statement.lineItems[lineItemIndex];
  if (!li) return null;
  const val = li.values[valueIndex];
  if (!val) return null;

  const fileName = val.sourceCell
    ? files.find(f => val.sourceCell?.startsWith(f.name))?.name || statement.sheetName
    : statement.sheetName;

  const sourceRef: SourceReference = {
    fileId: '',
    fileName: fileName || 'Unknown',
    sheetName: statement.sheetName,
    cellAddress: val.sourceCell,
  };

  const lineage: LineageStep[] = [
    {
      label: `${li.label} (${val.period})`,
      type: 'output',
      detail: `Displayed value: ${val.formatted}`,
    },
    {
      label: `Mapped as "${li.standardKey}"`,
      type: 'intermediate',
      detail: `Auto-mapped with ${Math.round(li.confidence * 100)}% confidence`,
    },
  ];

  if (val.isFormula && val.formula) {
    lineage.push({
      label: 'Formula Evaluation',
      type: 'intermediate',
      detail: val.formula,
    });
  }

  lineage.push({
    label: val.sourceCell || 'Raw Input',
    type: 'source',
    detail: `From ${statement.sheetName} rows ${statement.rowRange[0]}–${statement.rowRange[1]}`,
    sourceRef,
  });

  return {
    metricLabel: li.label,
    metricValue: val.formatted,
    formula: val.isFormula ? val.formula : undefined,
    transformations: li.isCustomMapping ? ['Custom user mapping applied'] : undefined,
    lineage,
    sourceRef,
    rawValue: val.value,
    periodValue: val,
  };
}

/**
 * Build a SourceTraceData for a computed metric (from the calculations engine).
 */
export function buildTraceForMetric(
  metric: FinancialMetric,
  statements: DetectedStatement[],
  files: { id: string; name: string }[]
): SourceTraceData {
  const sourceRef: SourceReference = metric.source || {
    fileId: '',
    fileName: files[0]?.name || 'Multiple Sources',
  };

  const lineage: LineageStep[] = [
    {
      label: metric.label,
      type: 'output',
      detail: `Computed metric: ${metric.formatted}`,
    },
  ];

  // Try to find input line items in statements
  const metricKeyMap: Record<string, string[]> = {
    total_leverage: ['total_debt', 'ebitda'],
    net_leverage: ['total_debt', 'cash', 'ebitda'],
    interest_coverage: ['ebitda', 'interest_expense'],
    fccr: ['ebitda', 'capex', 'interest_expense'],
    gross_margin: ['gross_profit', 'revenue'],
    ebitda_margin: ['ebitda', 'revenue'],
    net_margin: ['net_income', 'revenue'],
    revenue_growth: ['revenue'],
    ebitda_growth: ['ebitda'],
  };

  const inputs = metricKeyMap[metric.key] || [];
  for (const inputKey of inputs) {
    for (const s of statements) {
      const li = s.lineItems.find(l => l.standardKey === inputKey);
      if (li && li.values.length > 0) {
        const lastVal = li.values[li.values.length - 1];
        lineage.push({
          label: li.label,
          type: 'intermediate',
          detail: `${lastVal.formatted} from ${s.sheetName}${lastVal.sourceCell ? ` (${lastVal.sourceCell})` : ''}`,
          sourceRef: {
            fileId: '',
            fileName: files[0]?.name || s.sheetName,
            sheetName: s.sheetName,
            cellAddress: lastVal.sourceCell,
          },
        });
        break;
      }
    }
  }

  lineage.push({
    label: 'Source Data',
    type: 'source',
    detail: `Derived from ${statements.length} statement(s) across ${files.length} file(s)`,
    sourceRef,
  });

  return {
    metricLabel: metric.label,
    metricValue: metric.formatted,
    lineage,
    sourceRef,
  };
}

/**
 * Generate audit log entries for extraction events.
 */
export function createExtractionAuditEntries(
  statements: DetectedStatement[],
  metrics: FinancialMetric[],
  userName: string
): AuditLogEntry[] {
  const now = new Date();
  const entries: AuditLogEntry[] = [];

  entries.push({
    id: crypto.randomUUID(),
    timestamp: now,
    userId: '',
    userName,
    action: 'extraction_run',
    target: `${statements.length} statements, ${metrics.length} metrics extracted`,
    details: statements.map(s => s.type).join(', '),
  });

  for (const s of statements) {
    for (const li of s.lineItems) {
      if (li.values.length > 0) {
        const latest = li.values[li.values.length - 1];
        entries.push({
          id: crypto.randomUUID(),
          timestamp: new Date(now.getTime() + entries.length),
          userId: '',
          userName,
          action: 'value_changed',
          target: `${li.label} (${latest.period})`,
          newValue: latest.formatted,
          sourceFile: s.sheetName,
        });
      }
    }
  }

  return entries.slice(0, 50); // Cap to avoid huge lists
}
