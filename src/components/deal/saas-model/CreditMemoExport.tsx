import { useState, useCallback } from 'react';
import { SaaSModelData, SensitivityScenario, LenderConfig } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Loader2, FileSpreadsheet, Check } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  model: SaaSModelData;
  scenarios: SensitivityScenario[];
  lenders: LenderConfig[];
}

interface ExportConfig {
  title: string;
  preparedBy: string;
  format: 'pdf' | 'excel';
  sections: {
    executiveSummary: boolean;
    incomeStatement: boolean;
    balanceSheet: boolean;
    kpiDashboard: boolean;
    sensitivityAnalysis: boolean;
    debtServicing: boolean;
    creditScoring: boolean;
  };
}

export function CreditMemoExport({ model, scenarios, lenders }: Props) {
  const [config, setConfig] = useState<ExportConfig>({
    title: `Credit Memo — ${model.settings.companyName}`,
    preparedBy: '',
    format: 'pdf',
    sections: {
      executiveSummary: true,
      incomeStatement: true,
      balanceSheet: true,
      kpiDashboard: true,
      sensitivityAnalysis: true,
      debtServicing: true,
      creditScoring: true,
    },
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const toggleSection = (key: keyof ExportConfig['sections']) => {
    setConfig(c => ({ ...c, sections: { ...c.sections, [key]: !c.sections[key] } }));
  };

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      if (config.format === 'pdf') {
        await exportPDF(model, scenarios, lenders, config);
      } else {
        await exportExcel(model, scenarios, lenders, config);
      }
      setExported(true);
      setTimeout(() => setExported(false), 3000);
      toast.success('Credit memo exported successfully');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [model, scenarios, lenders, config]);

  const sectionItems = [
    { key: 'executiveSummary' as const, label: 'Executive Summary', desc: 'Company overview, key metrics, recommendation' },
    { key: 'kpiDashboard' as const, label: 'KPI Dashboard', desc: 'ARR, growth, margins, borrowing capacity' },
    { key: 'incomeStatement' as const, label: 'Income Statement', desc: 'Annual P&L summary' },
    { key: 'balanceSheet' as const, label: 'Balance Sheet', desc: 'Assets, liabilities, equity summary' },
    { key: 'sensitivityAnalysis' as const, label: 'Sensitivity Analysis', desc: 'Downside scenarios and stress tests' },
    { key: 'debtServicing' as const, label: 'Debt Servicing', desc: 'Lender terms and cost of capital' },
    { key: 'creditScoring' as const, label: 'Credit Scoring', desc: 'Weighted risk score and factor analysis' },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border/30">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Export Credit Memo</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Generate a professional credit memorandum with selected sections from your financial model.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Report Title</Label>
              <Input value={config.title} onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
                className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Prepared By</Label>
              <Input value={config.preparedBy} onChange={e => setConfig(c => ({ ...c, preparedBy: e.target.value }))}
                placeholder="Analyst name" className="h-8 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground">Format</Label>
            <Select value={config.format} onValueChange={v => setConfig(c => ({ ...c, format: v as any }))}>
              <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF Document</SelectItem>
                <SelectItem value="excel">Excel Workbook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[10px] text-muted-foreground mb-2 block">Sections to Include</Label>
            <div className="space-y-2">
              {sectionItems.map(s => (
                <label key={s.key} className="flex items-start gap-2.5 cursor-pointer group">
                  <Checkbox
                    checked={config.sections[s.key]}
                    onCheckedChange={() => toggleSection(s.key)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-medium group-hover:text-foreground transition-colors">{s.label}</span>
                    <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleExport} disabled={isExporting} className="gap-1.5">
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
              exported ? <Check className="h-3.5 w-3.5" /> :
              config.format === 'pdf' ? <Download className="h-3.5 w-3.5" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            {isExporting ? 'Generating…' : exported ? 'Exported!' : `Export as ${config.format.toUpperCase()}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── PDF Generation ──────────────────────────────────────
async function exportPDF(model: SaaSModelData, scenarios: SensitivityScenario[], lenders: LenderConfig[], config: ExportConfig) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(config.title, pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${model.settings.companyName} | ${model.settings.businessModel} | ${new Date().toLocaleDateString()}`, pageW / 2, y, { align: 'center' });
  if (config.preparedBy) {
    y += 5;
    doc.text(`Prepared by: ${config.preparedBy}`, pageW / 2, y, { align: 'center' });
  }
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(20, y, pageW - 20, y);
  y += 8;

  // Executive Summary
  if (config.sections.executiveSummary) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Executive Summary', 20, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const summary = [
      `${model.settings.companyName} is a ${model.settings.businessModel} business serving ${model.settings.customerBase} customers.`,
      `Current ARR: ${fmtCurrency(model.arrToday)} | Gross Margin: ${fmtPct(model.latestGrossMargin)} | YoY Growth: ${fmtPct(model.yoyRevGrowth)}`,
      `Borrowing Capacity: ${fmtCurrency(model.borrowingCapacity)} | Facility Recommendation: ${fmtCurrency(model.facilityRecommendation)}`,
      `Current Ratio: ${model.currentRatio.toFixed(2)}x | NRR: ${fmtPct(model.netRevenueRetention)}`,
    ];
    summary.forEach(line => {
      doc.text(line, 20, y, { maxWidth: pageW - 40 });
      y += 5;
    });
    y += 5;
  }

  // KPI Dashboard
  if (config.sections.kpiDashboard) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Performance Indicators', 20, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['ARR', fmtCurrency(model.arrToday)],
        ['MRR (3mo avg)', fmtCurrency(model.mrrT3M)],
        ['Gross Margin', fmtPct(model.latestGrossMargin)],
        ['YoY Revenue Growth', fmtPct(model.yoyRevGrowth)],
        ['Net Revenue Retention', fmtPct(model.netRevenueRetention)],
        ['Borrowing Capacity', fmtCurrency(model.borrowingCapacity)],
        ['Facility Recommendation', fmtCurrency(model.facilityRecommendation)],
        ['Current Ratio', model.currentRatio.toFixed(2) + 'x'],
        ['AR/AP Ratio', model.arApRatio.toFixed(2) + 'x'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 40, 80], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 20, right: 20 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Sensitivity Analysis
  if (config.sections.sensitivityAnalysis && scenarios.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Sensitivity Analysis', 20, y);
    y += 3;
    const last = model.months.length - 1;
    const baseRev = model.totalRevenue[last] * 12;
    autoTable(doc, {
      startY: y,
      head: [['Scenario', 'Revenue %', 'OpEx Cut', 'COGS Cut', 'Adj. Revenue']],
      body: scenarios.map((s, i) => [
        `Scenario ${i + 1}`,
        `${s.revenuePct}%`,
        `${s.opexReduction}%`,
        `${s.cogsReduction}%`,
        fmtCurrency(baseRev * s.revenuePct / 100),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 40, 80], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 20, right: 20 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Debt Servicing
  if (config.sections.debtServicing && lenders.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Debt Servicing — Lender Comparison', 20, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['', ...lenders.map((_, i) => `Lender ${String.fromCharCode(65 + i)}`)]],
      body: [
        ['Commitment', ...lenders.map(l => fmtCurrency(l.commitment))],
        ['Funded at Close', ...lenders.map(l => fmtCurrency(l.fundedAtClose))],
        ['Annual Rate', ...lenders.map(l => `${l.annualRate}%`)],
        ['Term', ...lenders.map(l => `${l.termYears} yrs`)],
        ['IO Period', ...lenders.map(l => `${l.ioPeriodYears} yrs`)],
        ['Frequency', ...lenders.map(l => l.paymentFrequency)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 40, 80], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 20, right: 20 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`${config.title} | Confidential | Page ${i} of ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  doc.save(`${model.settings.companyName.replace(/\s+/g, '_')}_Credit_Memo.pdf`);
}

// ── Excel Generation ────────────────────────────────────
async function exportExcel(model: SaaSModelData, scenarios: SensitivityScenario[], lenders: LenderConfig[], config: ExportConfig) {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');
  const wb = new ExcelJS.Workbook();

  // KPI Sheet
  if (config.sections.kpiDashboard) {
    const ws = wb.addWorksheet('KPIs');
    ws.addRow(['Key Performance Indicators']);
    ws.addRow([]);
    ws.addRow(['Metric', 'Value']);
    [
      ['ARR', model.arrToday],
      ['MRR (3mo avg)', model.mrrT3M],
      ['Gross Margin %', model.latestGrossMargin],
      ['YoY Revenue Growth %', model.yoyRevGrowth],
      ['Net Revenue Retention %', model.netRevenueRetention],
      ['Borrowing Capacity', model.borrowingCapacity],
      ['Facility Recommendation', model.facilityRecommendation],
      ['Current Ratio', model.currentRatio],
    ].forEach(r => ws.addRow(r));
    ws.getColumn(1).width = 25;
    ws.getColumn(2).width = 20;
  }

  // Income Statement Sheet
  if (config.sections.incomeStatement) {
    const ws = wb.addWorksheet('Income Statement');
    ws.addRow(['', ...model.months.map(m => m.label)]);
    ws.addRow(['Total Revenue', ...model.totalRevenue]);
    ws.addRow(['Total COGS', ...model.totalCOGS]);
    ws.addRow(['Gross Profit', ...model.grossProfit]);
    ws.addRow(['Total OpEx', ...model.totalOpEx]);
    ws.addRow(['Operating Income', ...model.operatingIncome]);
    ws.addRow(['EBITDA', ...model.ebitda]);
    ws.addRow(['Net Income', ...model.netIncome]);
  }

  // Balance Sheet
  if (config.sections.balanceSheet) {
    const ws = wb.addWorksheet('Balance Sheet');
    ws.addRow(['', ...model.months.map(m => m.label)]);
    ws.addRow(['Cash', ...model.balanceSheet.cash]);
    ws.addRow(['Total Current Assets', ...model.balanceSheet.totalCurrentAssets]);
    ws.addRow(['Total Assets', ...model.balanceSheet.totalAssets]);
    ws.addRow(['Total Current Liabilities', ...model.balanceSheet.totalCurrentLiabilities]);
    ws.addRow(['Total Liabilities', ...model.balanceSheet.totalLiabilities]);
    ws.addRow(['Total Equity', ...model.balanceSheet.totalEquity]);
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${model.settings.companyName.replace(/\s+/g, '_')}_Credit_Memo.xlsx`);
}
