import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Deal, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { format } from 'date-fns';

interface ReportOptions {
  title: string;
  subtitle?: string;
  dateRange: { start: Date; end: Date };
}

// Helper to format currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Helper to format percentage
const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

// CSV Generation
export const generateCSV = (data: Record<string, any>[], filename: string): void => {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma or newline
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// PDF Header
const addPDFHeader = (doc: jsPDF, options: ReportOptions): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text(options.title, 14, 22);
  
  // Subtitle / Date Range
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const dateRangeText = `${format(options.dateRange.start, 'MMM d, yyyy')} - ${format(options.dateRange.end, 'MMM d, yyyy')}`;
  doc.text(dateRangeText, 14, 30);
  
  // Generated timestamp
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth - 14, 30, { align: 'right' });
  
  // Divider line
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 35, pageWidth - 14, 35);
  
  return 42; // Return Y position after header
};

// Pipeline Summary Report
export const generatePipelineSummaryReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  const filteredDeals = deals.filter(deal => {
    const dealDate = new Date(deal.createdAt);
    return dealDate >= options.dateRange.start && dealDate <= options.dateRange.end;
  });

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    const csvData = filteredDeals.map(deal => ({
      'Deal Name': deal.company,
      'Stage': STAGE_CONFIG[deal.stage]?.label || deal.stage,
      'Status': STATUS_CONFIG[deal.status]?.label || deal.status,
      'Engagement Type': ENGAGEMENT_TYPE_CONFIG[deal.engagementType]?.label || deal.engagementType,
      'Manager': deal.manager || 'N/A',
      'Deal Value': deal.value,
      'Total Fee': deal.totalFee,
      'Lenders': deal.lenders?.length || 0,
      'Created Date': format(new Date(deal.createdAt), 'yyyy-MM-dd'),
      'Last Updated': format(new Date(deal.updatedAt), 'yyyy-MM-dd'),
    }));
    generateCSV(csvData, `pipeline-summary-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  // PDF Generation
  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  // Summary Statistics
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text('Summary Statistics', 14, yPos);
  yPos += 8;

  const totalValue = filteredDeals.reduce((sum, d) => sum + d.value, 0);
  const totalFees = filteredDeals.reduce((sum, d) => sum + (d.totalFee || 0), 0);
  const stageCounts = filteredDeals.reduce((acc, d) => {
    acc[d.stage] = (acc[d.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(`Total Deals: ${filteredDeals.length}`, 14, yPos);
  doc.text(`Total Pipeline Value: ${formatCurrency(totalValue)}`, 100, yPos);
  yPos += 6;
  doc.text(`Total Projected Fees: ${formatCurrency(totalFees)}`, 14, yPos);
  yPos += 12;

  // Stage breakdown
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('Deals by Stage', 14, yPos);
  yPos += 6;

  const stageData = Object.entries(stageCounts).map(([stage, count]) => [
    STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG]?.label || stage,
    count.toString(),
    formatPercent((count / filteredDeals.length) * 100)
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Stage', 'Count', '% of Total']],
    body: stageData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Deals table
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text('Deal Details', 14, yPos);
  yPos += 6;

  const dealData = filteredDeals.map(deal => [
    deal.company,
    STAGE_CONFIG[deal.stage]?.label || deal.stage,
    STATUS_CONFIG[deal.status]?.label || deal.status,
    deal.manager || 'N/A',
    formatCurrency(deal.value),
    formatCurrency(deal.totalFee || 0),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Deal', 'Stage', 'Status', 'Manager', 'Value', 'Fee']],
    body: dealData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 45 },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  doc.save(`pipeline-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Deal Activity Report
export const generateDealActivityReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  const filteredDeals = deals.filter(deal => {
    const updatedDate = new Date(deal.updatedAt);
    return updatedDate >= options.dateRange.start && updatedDate <= options.dateRange.end;
  });

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    const csvData = filteredDeals.map(deal => ({
      'Deal Name': deal.company,
      'Stage': STAGE_CONFIG[deal.stage]?.label || deal.stage,
      'Status': STATUS_CONFIG[deal.status]?.label || deal.status,
      'Manager': deal.manager || 'N/A',
      'Active Lenders': deal.lenders?.filter(l => l.trackingStatus === 'active').length || 0,
      'Total Lenders': deal.lenders?.length || 0,
      'Last Updated': format(new Date(deal.updatedAt), 'yyyy-MM-dd HH:mm'),
      'Notes': deal.notes || '',
    }));
    generateCSV(csvData, `deal-activity-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  doc.setFontSize(14);
  doc.text('Recent Deal Activity', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${filteredDeals.length} deals with activity in the selected period`, 14, yPos);
  yPos += 10;

  const activityData = filteredDeals
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(deal => [
      deal.company,
      STAGE_CONFIG[deal.stage]?.label || deal.stage,
      deal.manager || 'N/A',
      `${deal.lenders?.filter(l => l.trackingStatus === 'active').length || 0} / ${deal.lenders?.length || 0}`,
      format(new Date(deal.updatedAt), 'MMM d, h:mm a'),
    ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Deal', 'Current Stage', 'Manager', 'Active/Total Lenders', 'Last Activity']],
    body: activityData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`deal-activity-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Lender Performance Report
export const generateLenderPerformanceReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  // Aggregate lender data across all deals
  const lenderStats: Record<string, {
    totalDeals: number;
    activeDeals: number;
    passedDeals: number;
    closedDeals: number;
    avgStage: string[];
  }> = {};

  deals.forEach(deal => {
    deal.lenders?.forEach(lender => {
      if (!lenderStats[lender.name]) {
        lenderStats[lender.name] = {
          totalDeals: 0,
          activeDeals: 0,
          passedDeals: 0,
          closedDeals: 0,
          avgStage: [],
        };
      }
      lenderStats[lender.name].totalDeals++;
      if (lender.trackingStatus === 'active') lenderStats[lender.name].activeDeals++;
      if (lender.trackingStatus === 'passed') lenderStats[lender.name].passedDeals++;
      if (lender.stage === 'Closed') lenderStats[lender.name].closedDeals++;
      lenderStats[lender.name].avgStage.push(lender.stage);
    });
  });

  const lenderData = Object.entries(lenderStats)
    .sort((a, b) => b[1].totalDeals - a[1].totalDeals)
    .map(([name, stats]) => ({
      'Lender Name': name,
      'Total Deals': stats.totalDeals,
      'Active': stats.activeDeals,
      'Passed': stats.passedDeals,
      'Closed': stats.closedDeals,
      'Engagement Rate': formatPercent((stats.activeDeals / stats.totalDeals) * 100),
      'Pass Rate': formatPercent((stats.passedDeals / stats.totalDeals) * 100),
    }));

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    generateCSV(lenderData, `lender-performance-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  doc.setFontSize(14);
  doc.text('Lender Performance Overview', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Analysis of ${Object.keys(lenderStats).length} lenders across ${deals.length} deals`, 14, yPos);
  yPos += 10;

  const tableData = lenderData.map(l => [
    l['Lender Name'],
    l['Total Deals'].toString(),
    l['Active'].toString(),
    l['Passed'].toString(),
    l['Closed'].toString(),
    l['Engagement Rate'],
    l['Pass Rate'],
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Lender', 'Total Deals', 'Active', 'Passed', 'Closed', 'Engagement %', 'Pass %']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`lender-performance-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Fee Summary Report
export const generateFeeSummaryReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  const filteredDeals = deals.filter(deal => {
    const dealDate = new Date(deal.createdAt);
    return dealDate >= options.dateRange.start && dealDate <= options.dateRange.end;
  });

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    const csvData = filteredDeals.map(deal => ({
      'Deal Name': deal.company,
      'Deal Value': deal.value,
      'Total Fee': deal.totalFee || 0,
      'Retainer Fee': deal.retainerFee || 0,
      'Milestone Fee': deal.milestoneFee || 0,
      'Success Fee %': deal.successFeePercent || 0,
      'Stage': STAGE_CONFIG[deal.stage]?.label || deal.stage,
      'Manager': deal.manager || 'N/A',
    }));
    generateCSV(csvData, `fee-summary-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  // Summary totals
  const totalFees = filteredDeals.reduce((sum, d) => sum + (d.totalFee || 0), 0);
  const totalRetainer = filteredDeals.reduce((sum, d) => sum + (d.retainerFee || 0), 0);
  const totalMilestone = filteredDeals.reduce((sum, d) => sum + (d.milestoneFee || 0), 0);
  const totalValue = filteredDeals.reduce((sum, d) => sum + d.value, 0);

  doc.setFontSize(14);
  doc.text('Fee Summary', 14, yPos);
  yPos += 10;

  // Summary boxes
  doc.setFillColor(245, 245, 250);
  doc.roundedRect(14, yPos, 85, 25, 3, 3, 'F');
  doc.roundedRect(105, yPos, 85, 25, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Total Pipeline Value', 20, yPos + 8);
  doc.text('Total Projected Fees', 111, yPos + 8);

  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text(formatCurrency(totalValue), 20, yPos + 18);
  doc.text(formatCurrency(totalFees), 111, yPos + 18);

  yPos += 35;

  // Fee breakdown
  doc.setFontSize(12);
  doc.text('Fee Breakdown by Type', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Fee Type', 'Total Amount', '% of Total Fees']],
    body: [
      ['Retainer Fees', formatCurrency(totalRetainer), formatPercent((totalRetainer / totalFees) * 100 || 0)],
      ['Milestone Fees', formatCurrency(totalMilestone), formatPercent((totalMilestone / totalFees) * 100 || 0)],
      ['Success Fees (Projected)', formatCurrency(totalFees - totalRetainer - totalMilestone), formatPercent(((totalFees - totalRetainer - totalMilestone) / totalFees) * 100 || 0)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Deal details
  doc.setFontSize(12);
  doc.text('Fee Details by Deal', 14, yPos);
  yPos += 6;

  const feeData = filteredDeals.map(deal => [
    deal.company,
    formatCurrency(deal.value),
    formatCurrency(deal.totalFee || 0),
    formatCurrency(deal.retainerFee || 0),
    formatCurrency(deal.milestoneFee || 0),
    `${deal.successFeePercent || 0}%`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Deal', 'Value', 'Total Fee', 'Retainer', 'Milestone', 'Success %']],
    body: feeData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });

  doc.save(`fee-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Team Performance Report
export const generateTeamPerformanceReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  // Aggregate by manager
  const managerStats: Record<string, {
    deals: number;
    totalValue: number;
    totalFees: number;
    closedDeals: number;
    activeDeals: number;
  }> = {};

  deals.forEach(deal => {
    const manager = deal.manager || 'Unassigned';
    if (!managerStats[manager]) {
      managerStats[manager] = {
        deals: 0,
        totalValue: 0,
        totalFees: 0,
        closedDeals: 0,
        activeDeals: 0,
      };
    }
    managerStats[manager].deals++;
    managerStats[manager].totalValue += deal.value;
    managerStats[manager].totalFees += deal.totalFee || 0;
    if (deal.stage === 'closed') managerStats[manager].closedDeals++;
    if (deal.status !== 'archived') managerStats[manager].activeDeals++;
  });

  const teamData = Object.entries(managerStats)
    .sort((a, b) => b[1].totalValue - a[1].totalValue)
    .map(([name, stats]) => ({
      'Manager': name,
      'Total Deals': stats.deals,
      'Active Deals': stats.activeDeals,
      'Closed Deals': stats.closedDeals,
      'Pipeline Value': stats.totalValue,
      'Projected Fees': stats.totalFees,
      'Avg Deal Size': Math.round(stats.totalValue / stats.deals),
      'Close Rate': formatPercent((stats.closedDeals / stats.deals) * 100),
    }));

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    generateCSV(teamData, `team-performance-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  doc.setFontSize(14);
  doc.text('Team Performance Overview', 14, yPos);
  yPos += 10;

  const tableData = teamData.map(t => [
    t['Manager'],
    t['Total Deals'].toString(),
    t['Active Deals'].toString(),
    t['Closed Deals'].toString(),
    formatCurrency(t['Pipeline Value'] as number),
    formatCurrency(t['Projected Fees'] as number),
    t['Close Rate'],
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Manager', 'Total', 'Active', 'Closed', 'Pipeline Value', 'Fees', 'Close Rate']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`team-performance-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Pass Analysis Report
export const generatePassAnalysisReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  // Collect all pass reasons
  const passReasons: Record<string, number> = {};
  const passedLenders: { lender: string; deal: string; reason: string }[] = [];

  deals.forEach(deal => {
    deal.lenders?.forEach(lender => {
      if (lender.trackingStatus === 'passed' && lender.passReason) {
        passReasons[lender.passReason] = (passReasons[lender.passReason] || 0) + 1;
        passedLenders.push({
          lender: lender.name,
          deal: deal.company,
          reason: lender.passReason,
        });
      }
    });
  });

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    const csvData = passedLenders.map(p => ({
      'Lender': p.lender,
      'Deal': p.deal,
      'Pass Reason': p.reason,
    }));
    generateCSV(csvData, `pass-analysis-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  doc.setFontSize(14);
  doc.text('Pass Reason Analysis', 14, yPos);
  yPos += 10;

  const totalPasses = Object.values(passReasons).reduce((a, b) => a + b, 0);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${totalPasses} total passes analyzed across ${deals.length} deals`, 14, yPos);
  yPos += 10;

  // Reason breakdown
  const reasonData = Object.entries(passReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => [
      reason,
      count.toString(),
      formatPercent((count / totalPasses) * 100),
    ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Pass Reason', 'Count', '% of Total']],
    body: reasonData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Detailed list
  doc.setFontSize(12);
  doc.text('Detailed Pass List', 14, yPos);
  yPos += 6;

  const detailData = passedLenders.slice(0, 50).map(p => [p.lender, p.deal, p.reason]);

  autoTable(doc, {
    startY: yPos,
    head: [['Lender', 'Deal', 'Reason']],
    body: detailData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`pass-analysis-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Conversion Metrics Report
export const generateConversionMetricsReport = (
  deals: Deal[],
  options: ReportOptions,
  exportFormat: 'pdf' | 'csv' | 'xlsx'
): void => {
  const stageProgression = {
    'prospecting': deals.filter(d => d.stage === 'prospecting').length,
    'initial-review': deals.filter(d => d.stage === 'initial-review').length,
    'due-diligence': deals.filter(d => d.stage === 'due-diligence').length,
    'term-sheet': deals.filter(d => d.stage === 'term-sheet').length,
    'closing': deals.filter(d => d.stage === 'closing').length,
    'closed': deals.filter(d => d.stage === 'closed').length,
  };

  const conversionData = [
    { 'Stage': 'Prospecting', 'Count': stageProgression['prospecting'], 'Conversion to Next': formatPercent((stageProgression['initial-review'] / stageProgression['prospecting']) * 100 || 0) },
    { 'Stage': 'Initial Review', 'Count': stageProgression['initial-review'], 'Conversion to Next': formatPercent((stageProgression['due-diligence'] / stageProgression['initial-review']) * 100 || 0) },
    { 'Stage': 'Due Diligence', 'Count': stageProgression['due-diligence'], 'Conversion to Next': formatPercent((stageProgression['term-sheet'] / stageProgression['due-diligence']) * 100 || 0) },
    { 'Stage': 'Term Sheet', 'Count': stageProgression['term-sheet'], 'Conversion to Next': formatPercent((stageProgression['closing'] / stageProgression['term-sheet']) * 100 || 0) },
    { 'Stage': 'Closing', 'Count': stageProgression['closing'], 'Conversion to Next': formatPercent((stageProgression['closed'] / stageProgression['closing']) * 100 || 0) },
    { 'Stage': 'Closed', 'Count': stageProgression['closed'], 'Conversion to Next': '-' },
  ];

  if (exportFormat === 'csv' || exportFormat === 'xlsx') {
    generateCSV(conversionData, `conversion-metrics-${format(new Date(), 'yyyy-MM-dd')}`);
    return;
  }

  const doc = new jsPDF();
  let yPos = addPDFHeader(doc, options);

  doc.setFontSize(14);
  doc.text('Pipeline Conversion Metrics', 14, yPos);
  yPos += 10;

  const overallConversion = formatPercent((stageProgression['closed'] / deals.length) * 100 || 0);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Overall Pipeline Conversion Rate: ${overallConversion}`, 14, yPos);
  yPos += 10;

  const tableData = conversionData.map(c => [c['Stage'], c['Count'].toString(), c['Conversion to Next']]);

  autoTable(doc, {
    startY: yPos,
    head: [['Stage', 'Deal Count', 'Conversion to Next Stage']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`conversion-metrics-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

// Export all reports map
export const reportGenerators: Record<string, (deals: Deal[], options: ReportOptions, format: 'pdf' | 'csv' | 'xlsx') => void> = {
  'pipeline-summary': generatePipelineSummaryReport,
  'deal-activity': generateDealActivityReport,
  'stage-progression': generateConversionMetricsReport,
  'lender-performance': generateLenderPerformanceReport,
  'lender-engagement': generateLenderPerformanceReport,
  'pass-analysis': generatePassAnalysisReport,
  'team-performance': generateTeamPerformanceReport,
  'conversion-metrics': generateConversionMetricsReport,
  'fee-summary': generateFeeSummaryReport,
  'revenue-forecast': generateFeeSummaryReport,
};
