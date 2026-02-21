import React, { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FinanceExportProps {
  className?: string;
}

const scenarioData = {
  'Base Case': {
    revenue: 1200000, cogs: 660000, grossProfit: 540000, opex: 300000,
    ebitda: 276000, netIncome: 207000, fcf: 179400,
  },
  'Bull Case': {
    revenue: 1440000, cogs: 720000, grossProfit: 720000, opex: 302400,
    ebitda: 453600, netIncome: 340200, fcf: 294840,
  },
  'Bear Case': {
    revenue: 1036000, cogs: 642320, grossProfit: 393680, opex: 310800,
    ebitda: 118880, netIncome: 89160, fcf: 77299,
  },
};

const formatCurrency = (v: number) => `$${(v / 1000).toFixed(0)}K`;

export function FinanceExport({ className }: FinanceExportProps) {
  const exportToExcel = useCallback(async () => {
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'naitive Finance';
      wb.created = new Date();

      // Summary sheet
      const summary = wb.addWorksheet('Summary', { properties: { tabColor: { argb: '4472C4' } } });
      summary.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Base Case', key: 'base', width: 18 },
        { header: 'Bull Case', key: 'bull', width: 18 },
        { header: 'Bear Case', key: 'bear', width: 18 },
      ];
      summary.getRow(1).font = { bold: true, size: 11 };
      summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4472C4' } };
      summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };

      const metrics = ['Revenue', 'COGS', 'Gross Profit', 'OpEx', 'EBITDA', 'Net Income', 'Free Cash Flow'];
      const keys: (keyof typeof scenarioData['Base Case'])[] = ['revenue', 'cogs', 'grossProfit', 'opex', 'ebitda', 'netIncome', 'fcf'];

      metrics.forEach((m, i) => {
        const row = summary.addRow({
          metric: m,
          base: scenarioData['Base Case'][keys[i]],
          bull: scenarioData['Bull Case'][keys[i]],
          bear: scenarioData['Bear Case'][keys[i]],
        });
        ['B', 'C', 'D'].forEach(col => {
          row.getCell(col).numFmt = '$#,##0';
        });
        if (['Gross Profit', 'EBITDA', 'Net Income', 'Free Cash Flow'].includes(m)) {
          row.font = { bold: true };
        }
      });

      // Individual scenario sheets
      Object.entries(scenarioData).forEach(([name, data]) => {
        const ws = wb.addWorksheet(name);
        ws.columns = [
          { header: 'Line Item', key: 'item', width: 25 },
          { header: 'Amount', key: 'amount', width: 18 },
          { header: '% of Revenue', key: 'pct', width: 15 },
        ];
        ws.getRow(1).font = { bold: true };

        const items = [
          { item: 'Revenue', amount: data.revenue, pct: 100 },
          { item: 'Cost of Goods Sold', amount: -data.cogs, pct: -(data.cogs / data.revenue) * 100 },
          { item: 'Gross Profit', amount: data.grossProfit, pct: (data.grossProfit / data.revenue) * 100 },
          { item: 'Operating Expenses', amount: -data.opex, pct: -(data.opex / data.revenue) * 100 },
          { item: 'EBITDA', amount: data.ebitda, pct: (data.ebitda / data.revenue) * 100 },
          { item: 'Net Income', amount: data.netIncome, pct: (data.netIncome / data.revenue) * 100 },
          { item: 'Free Cash Flow', amount: data.fcf, pct: (data.fcf / data.revenue) * 100 },
        ];

        items.forEach(it => {
          const row = ws.addRow(it);
          row.getCell('B').numFmt = '$#,##0';
          row.getCell('C').numFmt = '0.0"%"';
          if (['Gross Profit', 'EBITDA', 'Net Income', 'Free Cash Flow'].includes(it.item)) {
            row.font = { bold: true };
          }
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Financial_Model_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel file exported successfully');
    } catch (err) {
      toast.error('Failed to export Excel file');
    }
  }, []);

  const exportToPDF = useCallback(() => {
    try {
      const doc = new jsPDF({ orientation: 'landscape' });

      // Title page
      doc.setFontSize(24);
      doc.text('Financial Model Summary', 20, 30);
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 40);
      doc.text('Confidential — For Board Review Only', 20, 48);

      // Scenario comparison table
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text('Scenario Comparison', 20, 20);

      const metrics = ['Revenue', 'COGS', 'Gross Profit', 'OpEx', 'EBITDA', 'Net Income', 'Free Cash Flow'];
      const keys: (keyof typeof scenarioData['Base Case'])[] = ['revenue', 'cogs', 'grossProfit', 'opex', 'ebitda', 'netIncome', 'fcf'];

      autoTable(doc, {
        startY: 30,
        head: [['Metric', 'Base Case', 'Bull Case', 'Bear Case']],
        body: metrics.map((m, i) => [
          m,
          formatCurrency(scenarioData['Base Case'][keys[i]]),
          formatCurrency(scenarioData['Bull Case'][keys[i]]),
          formatCurrency(scenarioData['Bear Case'][keys[i]]),
        ]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [68, 114, 196] },
        alternateRowStyles: { fillColor: [240, 244, 250] },
      });

      // P&L Detail page for each scenario
      Object.entries(scenarioData).forEach(([name, data]) => {
        doc.addPage();
        doc.setFontSize(16);
        doc.text(`${name} — P&L Detail`, 20, 20);

        autoTable(doc, {
          startY: 30,
          head: [['Line Item', 'Amount', '% of Revenue']],
          body: [
            ['Revenue', formatCurrency(data.revenue), '100.0%'],
            ['COGS', formatCurrency(-data.cogs), `${((data.cogs / data.revenue) * 100).toFixed(1)}%`],
            ['Gross Profit', formatCurrency(data.grossProfit), `${((data.grossProfit / data.revenue) * 100).toFixed(1)}%`],
            ['OpEx', formatCurrency(-data.opex), `${((data.opex / data.revenue) * 100).toFixed(1)}%`],
            ['EBITDA', formatCurrency(data.ebitda), `${((data.ebitda / data.revenue) * 100).toFixed(1)}%`],
            ['Net Income', formatCurrency(data.netIncome), `${((data.netIncome / data.revenue) * 100).toFixed(1)}%`],
            ['FCF', formatCurrency(data.fcf), `${((data.fcf / data.revenue) * 100).toFixed(1)}%`],
          ],
          styles: { fontSize: 10 },
          headStyles: { fillColor: [68, 114, 196] },
        });
      });

      doc.save(`Financial_Model_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      toast.error('Failed to export PDF');
    }
  }, []);

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Export Financial Model
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={exportToExcel}
            className="p-4 rounded-lg border border-border/50 hover:border-success/50 hover:bg-success/5 transition-all text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <FileSpreadsheet className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-medium">Export to Excel (.xlsx)</p>
                <p className="text-[10px] text-muted-foreground">Multi-sheet workbook with scenarios, formulas, and formatting</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">Base + Bull + Bear sheets</Badge>
          </button>

          <button
            onClick={exportToPDF}
            className="p-4 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
          >
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Export to PDF</p>
                <p className="text-[10px] text-muted-foreground">Board-ready deck with tables, headers, and page breaks</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">Landscape • Print-ready</Badge>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
