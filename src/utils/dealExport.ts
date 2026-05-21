import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, AlignmentType, PageOrientation } from 'docx';
import { saveAs } from 'file-saver';
import { Deal, DealStatus, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG, LENDER_TRACKING_STATUS_CONFIG } from '@/types/deal';
import { bucketLenders, isExcludedFromClientReport, extractPassDetails } from '@/lib/lenderStatusBuckets';

// Safe label helpers – fall back to the raw ID (formatted) when custom stages are used
const formatId = (id: string) => id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const getStatusLabel = (status: string) =>
  LENDER_STATUS_CONFIG[status as keyof typeof LENDER_STATUS_CONFIG]?.label || formatId(status);

const getStageLabel = (stage: string) =>
  LENDER_STAGE_CONFIG[stage as keyof typeof LENDER_STAGE_CONFIG]?.label || formatId(stage);

const getTrackingLabel = (trackingStatus: string, trackingStatusConfig?: Record<string, { label: string; color: string }>) => {
  if (trackingStatusConfig?.[trackingStatus]) return trackingStatusConfig[trackingStatus].label;
  return LENDER_TRACKING_STATUS_CONFIG[trackingStatus as keyof typeof LENDER_TRACKING_STATUS_CONFIG]?.label || formatId(trackingStatus);
};

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}MM`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value}`;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// CSV Export
export function exportDealToCSV(deal: Deal): void {
  const rows: string[][] = [
    ['Deal Information'],
    ['Field', 'Value'],
    ['Company', deal.company],
    ['Deal Name', deal.name],
    ['Stage', STAGE_CONFIG[deal.stage].label],
    ['Status', STATUS_CONFIG[deal.status].label],
    ['Engagement Type', ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label],
    ['Deal Value', formatCurrency(deal.value)],
    ['Total Fee', formatCurrency(deal.totalFee)],
    ['Manager', deal.manager],
    ['Primary Lender', deal.lender],
    ['Contact', deal.contact],
    ['Created', formatDate(deal.createdAt)],
    ['Last Updated', formatDate(deal.updatedAt)],
    ['Notes', deal.notes || 'N/A'],
    [],
  ];

  if (deal.lenders && deal.lenders.length > 0) {
    rows.push(['Lenders']);
    rows.push(['Name', 'Status', 'Stage', 'Tracking Status']);
    deal.lenders.forEach(lender => {
      rows.push([
        lender.name,
        getStatusLabel(lender.status),
        getStageLabel(lender.stage),
        getTrackingLabel(lender.trackingStatus),
      ]);
    });
    rows.push([]);
  }

  if (deal.milestones && deal.milestones.length > 0) {
    rows.push(['Milestones']);
    rows.push(['Title', 'Due Date', 'Status']);
    deal.milestones.forEach(milestone => {
      rows.push([
        milestone.title,
        milestone.dueDate ? formatDate(milestone.dueDate) : 'No date',
        milestone.completed ? 'Completed' : 'Pending',
      ]);
    });
  }

  const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${deal.company}-deal-report.csv`);
}

// PDF Export
export function exportDealToPDF(deal: Deal): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header with brand color
  doc.setFillColor(147, 51, 234); // Purple
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(deal.company, 20, 25);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Deal Report - Generated ${formatDate(new Date().toISOString())}`, 20, 35);
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  let yPos = 55;
  
  // Deal Summary Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Deal Summary', 20, yPos);
  yPos += 10;
  
  const summaryData = [
    ['Deal Name', deal.name],
    ['Stage', STAGE_CONFIG[deal.stage].label],
    ['Status', STATUS_CONFIG[deal.status].label],
    ['Engagement Type', ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label],
    ['Deal Value', formatCurrency(deal.value)],
    ['Total Fee', formatCurrency(deal.totalFee)],
    ['Manager', deal.manager],
    ['Primary Lender', deal.lender],
    ['Contact', deal.contact],
    ['Created', formatDate(deal.createdAt)],
    ['Last Updated', formatDate(deal.updatedAt)],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 100 },
    },
    margin: { left: 20, right: 20 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Notes Section
  if (deal.notes) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', 20, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(deal.notes, pageWidth - 40);
    doc.text(splitNotes, 20, yPos);
    yPos += splitNotes.length * 5 + 15;
  }

  // Lenders Section
  if (deal.lenders && deal.lenders.length > 0) {
    if (yPos > 230) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Lenders', 20, yPos);
    yPos += 10;

    const lenderData = deal.lenders.map(lender => [
      lender.name,
      getStatusLabel(lender.status),
      getStageLabel(lender.stage),
      getTrackingLabel(lender.trackingStatus),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Lender Name', 'Status', 'Stage', 'Tracking']],
      body: lenderData,
      theme: 'striped',
      headStyles: { fillColor: [147, 51, 234], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: 20, right: 20 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Milestones Section
  if (deal.milestones && deal.milestones.length > 0) {
    if (yPos > 230) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Milestones', 20, yPos);
    yPos += 10;

    const milestoneData = deal.milestones.map(milestone => [
      milestone.title,
      milestone.dueDate ? formatDate(milestone.dueDate) : 'No date set',
      milestone.completed ? '✓ Completed' : 'Pending',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Milestone', 'Due Date', 'Status']],
      body: milestoneData,
      theme: 'striped',
      headStyles: { fillColor: [147, 51, 234], textColor: 255 },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: 20, right: 20 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  doc.save(`${deal.company}-deal-report.pdf`);
}

// Word Document Export
export async function exportDealToWord(deal: Deal): Promise<void> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: deal.company,
                bold: true,
                size: 48,
                color: '9333EA',
              }),
            ],
            heading: HeadingLevel.TITLE,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Deal Report - Generated ${formatDate(new Date().toISOString())}`,
                size: 22,
                color: '666666',
              }),
            ],
            spacing: { after: 400 },
          }),

          // Deal Summary Header
          new Paragraph({
            children: [
              new TextRun({
                text: 'Deal Summary',
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
          }),

          // Summary Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createTableRow('Deal Name', deal.name),
              createTableRow('Stage', STAGE_CONFIG[deal.stage].label),
              createTableRow('Status', STATUS_CONFIG[deal.status].label),
              createTableRow('Engagement Type', ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label),
              createTableRow('Deal Value', formatCurrency(deal.value)),
              createTableRow('Total Fee', formatCurrency(deal.totalFee)),
              createTableRow('Manager', deal.manager),
              createTableRow('Primary Lender', deal.lender),
              createTableRow('Contact', deal.contact),
              createTableRow('Created', formatDate(deal.createdAt)),
              createTableRow('Last Updated', formatDate(deal.updatedAt)),
            ],
          }),

          // Notes Section
          ...(deal.notes
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Notes',
                      bold: true,
                      size: 28,
                    }),
                  ],
                  heading: HeadingLevel.HEADING_1,
                  spacing: { before: 400, after: 200 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: deal.notes,
                      size: 22,
                    }),
                  ],
                  spacing: { after: 300 },
                }),
              ]
            : []),

          // Lenders Section
          ...(deal.lenders && deal.lenders.length > 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Lenders',
                      bold: true,
                      size: 28,
                    }),
                  ],
                  heading: HeadingLevel.HEADING_1,
                  spacing: { before: 400, after: 200 },
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: [
                        createHeaderCell('Lender Name'),
                        createHeaderCell('Status'),
                        createHeaderCell('Stage'),
                        createHeaderCell('Tracking'),
                      ],
                    }),
                    ...deal.lenders.map(
                      lender =>
                        new TableRow({
                          children: [
                            createDataCell(lender.name),
                            createDataCell(getStatusLabel(lender.status)),
                            createDataCell(getStageLabel(lender.stage)),
                            createDataCell(getTrackingLabel(lender.trackingStatus)),
                          ],
                        })
                    ),
                  ],
                }),
              ]
            : []),

          // Milestones Section
          ...(deal.milestones && deal.milestones.length > 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Milestones',
                      bold: true,
                      size: 28,
                    }),
                  ],
                  heading: HeadingLevel.HEADING_1,
                  spacing: { before: 400, after: 200 },
                }),
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    new TableRow({
                      children: [
                        createHeaderCell('Milestone'),
                        createHeaderCell('Due Date'),
                        createHeaderCell('Status'),
                      ],
                    }),
                    ...deal.milestones.map(
                      milestone =>
                        new TableRow({
                          children: [
                            createDataCell(milestone.title),
                            createDataCell(milestone.dueDate ? formatDate(milestone.dueDate) : 'No date set'),
                            createDataCell(milestone.completed ? '✓ Completed' : 'Pending'),
                          ],
                        })
                    ),
                  ],
                }),
              ]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${deal.company}-deal-report.docx`);
}

function createTableRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: label,
                bold: true,
                size: 22,
              }),
            ],
          }),
        ],
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5' },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
      }),
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: value,
                size: 22,
              }),
            ],
          }),
        ],
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5' },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
      }),
    ],
  });
}

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20,
            color: 'FFFFFF',
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { fill: '9333EA' },
  });
}

function createDataCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 20,
          }),
        ],
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5' },
    },
  });
}

// ==================== PIPELINE EXPORTS (All Deals) ====================

// Pipeline CSV Export
export function exportPipelineToCSV(deals: Deal[]): void {
  const statusGroups: Record<DealStatus, Deal[]> = {
    'on-track': [],
    'at-risk': [],
    'off-track': [],
    'on-hold': [],
    'archived': [],
  };

  deals.forEach(deal => {
    statusGroups[deal.status].push(deal);
  });

  const rows: string[][] = [
    ['Pipeline Report - ' + formatDate(new Date().toISOString())],
    [],
    ['Summary'],
    ['Total Deals', deals.length.toString()],
    ['Total Pipeline Value', formatCurrency(deals.reduce((sum, d) => sum + d.value, 0))],
    ['On Track', statusGroups['on-track'].length.toString()],
    ['At Risk', statusGroups['at-risk'].length.toString()],
    ['Off Track', statusGroups['off-track'].length.toString()],
    ['On Hold', statusGroups['on-hold'].length.toString()],
    [],
    ['All Deals'],
    ['Company', 'Deal Name', 'Status', 'Stage', 'Value', 'Fee', 'Manager', 'Lender', 'Contact', 'Updated'],
  ];

  deals.forEach(deal => {
    rows.push([
      deal.company,
      deal.name,
      STATUS_CONFIG[deal.status].label,
      STAGE_CONFIG[deal.stage].label,
      formatCurrency(deal.value),
      formatCurrency(deal.totalFee),
      deal.manager,
      deal.lender,
      deal.contact,
      formatDate(deal.updatedAt),
    ]);
  });

  const csvContent = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `pipeline-report-${new Date().toISOString().split('T')[0]}.csv`);
}

// Pipeline PDF Export
export function exportPipelineToPDF(deals: Deal[]): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(147, 51, 234);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Pipeline Report', 20, 22);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${formatDate(new Date().toISOString())}`, 20, 30);
  
  doc.setTextColor(0, 0, 0);
  
  let yPos = 45;

  // Summary stats
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const activeDeals = deals.filter(d => d.status !== 'archived');
  const activeValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 20, yPos);
  yPos += 8;
  
  const summaryData = [
    ['Total Deals', deals.length.toString(), 'Total Pipeline Value', formatCurrency(totalValue)],
    ['Active Deals', activeDeals.length.toString(), 'Active Value', formatCurrency(activeValue)],
    ['On Track', deals.filter(d => d.status === 'on-track').length.toString(), 'At Risk', deals.filter(d => d.status === 'at-risk').length.toString()],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
    margin: { left: 20, right: 20 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Deals table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('All Deals', 20, yPos);
  yPos += 8;

  const dealsData = deals.map(deal => [
    deal.company,
    deal.name,
    STATUS_CONFIG[deal.status].label,
    STAGE_CONFIG[deal.stage].label,
    formatCurrency(deal.value),
    formatCurrency(deal.totalFee),
    deal.manager,
    deal.lender,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Company', 'Deal', 'Status', 'Stage', 'Value', 'Fee', 'Manager', 'Lender']],
    body: dealsData,
    theme: 'striped',
    headStyles: { fillColor: [147, 51, 234], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 20, right: 20 },
  });

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  doc.save(`pipeline-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

// Pipeline Word Document Export
export async function exportPipelineToWord(deals: Deal[]): Promise<void> {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const activeDeals = deals.filter(d => d.status !== 'archived');
  const activeValue = activeDeals.reduce((sum, d) => sum + d.value, 0);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
          },
        },
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: 'Pipeline Report',
                bold: true,
                size: 48,
                color: '9333EA',
              }),
            ],
            heading: HeadingLevel.TITLE,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated ${formatDate(new Date().toISOString())}`,
                size: 22,
                color: '666666',
              }),
            ],
            spacing: { after: 400 },
          }),

          // Summary Header
          new Paragraph({
            children: [
              new TextRun({
                text: 'Summary',
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 },
          }),

          // Summary Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              createTableRow('Total Deals', deals.length.toString()),
              createTableRow('Total Pipeline Value', formatCurrency(totalValue)),
              createTableRow('Active Deals', activeDeals.length.toString()),
              createTableRow('Active Value', formatCurrency(activeValue)),
              createTableRow('On Track', deals.filter(d => d.status === 'on-track').length.toString()),
              createTableRow('At Risk', deals.filter(d => d.status === 'at-risk').length.toString()),
              createTableRow('Off Track', deals.filter(d => d.status === 'off-track').length.toString()),
              createTableRow('On Hold', deals.filter(d => d.status === 'on-hold').length.toString()),
            ],
          }),

          // Deals Section
          new Paragraph({
            children: [
              new TextRun({
                text: 'All Deals',
                bold: true,
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createHeaderCell('Company'),
                  createHeaderCell('Deal'),
                  createHeaderCell('Status'),
                  createHeaderCell('Stage'),
                  createHeaderCell('Value'),
                  createHeaderCell('Manager'),
                ],
              }),
              ...deals.map(
                deal =>
                  new TableRow({
                    children: [
                      createDataCell(deal.company),
                      createDataCell(deal.name),
                      createDataCell(STATUS_CONFIG[deal.status].label),
                      createDataCell(STAGE_CONFIG[deal.stage].label),
                      createDataCell(formatCurrency(deal.value)),
                      createDataCell(deal.manager),
                    ],
                  })
              ),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `pipeline-report-${new Date().toISOString().split('T')[0]}.docx`);
}

// ==================== STATUS REPORT EXPORTS ====================

export interface LenderStageConfig {
  id: string;
  label: string;
}

export interface OutstandingItem {
  id: string;
  text: string;
  completed: boolean;
  received: boolean;
  approved: boolean;
  deliveredToLenders: string[];
  createdAt: string;
  completedAt?: string;
  requestedBy: string[];
}

export interface StatusReportEditableContent {
  keyUpdates: string[];
  /** AI-generated 3–5 bullet executive summary populated when modal opens. */
  statusSummary: string[];
  /** AI-generated narrative HTML version of the status summary (rich-text editable). */
  statusSummaryHtml?: string;
  lenderRows: { name: string; processStage: string; focusAreas: string; challenges: string; nextAction: string }[];
  completedMilestones: string[];
  nextSteps: string[];
  actionItems: string;
  sectionsVisible: {
    keyUpdates: boolean;
    statusSummary: boolean;
    lenderTable: boolean;
    pipelineSnapshot: boolean;
    milestones: boolean;
    nextSteps: boolean;
    actionItems: boolean;
  };
}

// Status Report PDF Export — matches branded design template
export function exportStatusReportToPDF(
  deal: Deal,
  configuredStages?: LenderStageConfig[],
  configuredSubstages?: LenderStageConfig[],
  outstandingItems?: OutstandingItem[],
  editableContent?: StatusReportEditableContent,
  options?: { returnBlob?: boolean },
): { blob: Blob; pageCount: number } | void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  const fullDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateMMDD = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-');

  // Brand colors
  const brandBlue: [number, number, number] = [30, 58, 138]; // Dark navy
  const accentBlue: [number, number, number] = [37, 99, 235]; // Bright blue for date & headings
  const textDark: [number, number, number] = [31, 41, 55];
  const textMedium: [number, number, number] = [75, 85, 99];
  const bgLight: [number, number, number] = [243, 244, 246]; // Light gray
  const borderLight: [number, number, number] = [209, 213, 219];

  // ─── PAGE 1 ───────────────────────────────────────────────────────────────

  // Top blue bar
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 6, 'F');

  // "5TH LINE" logo text
  let yPos = 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...brandBlue);
  doc.text('5', margin, yPos);
  doc.setFontSize(7);
  doc.text('TH', margin + 5.5, yPos - 3);
  doc.setFontSize(14);
  doc.text('| LINE', margin + 11, yPos);

  // Title: "{Company} — Status Update: {Date}"
  yPos = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...textDark);
  const titlePrefix = `${deal.company} — Status Update: `;
  doc.text(titlePrefix, margin, yPos);
  const prefixWidth = doc.getTextWidth(titlePrefix);
  doc.setTextColor(...accentBlue);
  doc.text(fullDate, margin + prefixWidth, yPos);

  // ─── Key Updates ────────────────────────────────────────────────────────
  yPos = 58;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brandBlue);
  doc.text('Key Updates:', margin, yPos);
  // Underline
  const kuWidth = doc.getTextWidth('Key Updates:');
  doc.setDrawColor(...brandBlue);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos + 1.5, margin + kuWidth, yPos + 1.5);

  yPos += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...textDark);

  // Use editable content if provided, otherwise parse from deal
  let bulletItems: string[];
  if (editableContent) {
    bulletItems = editableContent.keyUpdates.filter(Boolean);
  } else {
    const rawNotes = deal.notes || '';
    const strippedNotes = rawNotes.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    bulletItems = strippedNotes.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }

  const showKeyUpdates = editableContent ? editableContent.sectionsVisible.keyUpdates : true;
  if (showKeyUpdates) {
    if (bulletItems.length > 0) {
      for (const item of bulletItems) {
        if (yPos > pageHeight - 40) { doc.addPage(); yPos = 20; }
        const lines = doc.splitTextToSize(item, contentWidth - 10);
        doc.setFillColor(...textDark);
        doc.circle(margin + 2, yPos - 1.2, 1, 'F');
        doc.text(lines, margin + 8, yPos);
        yPos += lines.length * 5 + 4;
      }
    } else {
      doc.setTextColor(...textMedium);
      doc.text('No updates available.', margin + 8, yPos);
      yPos += 10;
    }
  }

  // ─── Key Lenders – Process Status & Next Actions ────────────────────────
  // Removed per product decision: section omitted from preview and export.
  const showLenderTable = false;
  if (showLenderTable) {
    yPos += 8;
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...brandBlue);
    const klTitle = 'Key Lenders \u2013 Process Status & Next Actions:';
    doc.text(klTitle, margin, yPos);
    const klWidth = doc.getTextWidth(klTitle);
    doc.setDrawColor(...brandBlue);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos + 1.5, margin + klWidth, yPos + 1.5);
    yPos += 10;

    let lenderTableData: string[][];
    if (editableContent) {
      lenderTableData = editableContent.lenderRows.map(r => [r.name, r.processStage, r.focusAreas, r.challenges, r.nextAction]);
    } else {
      const activeLenders = (deal.lenders || []).filter(l => l.trackingStatus !== 'passed');
      lenderTableData = activeLenders.map(lender => {
        const stageName = configuredStages?.find(s => s.id === lender.stage)?.label ||
          LENDER_STAGE_CONFIG[lender.stage]?.label || lender.stage;
        return [lender.name, stageName, '', '', lender.notes || ''];
      });
    }

    if (lenderTableData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Lender', 'Process Stage', 'Key Focus Areas', 'Current Challenges', 'Next Action']],
        body: lenderTableData,
        theme: 'plain',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: textDark,
          fontStyle: 'bold',
          fontSize: 9,
          cellPadding: 5,
          lineWidth: { bottom: 0.3 },
          lineColor: borderLight,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: textDark,
          cellPadding: 5,
          lineWidth: { bottom: 0.15 },
          lineColor: [229, 231, 235],
        },
        styles: { overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 32 },
          2: { cellWidth: 35 },
          3: { cellWidth: 38 },
          4: { cellWidth: 33 },
        },
        margin: { left: margin, right: margin },
        tableLineColor: borderLight,
        tableLineWidth: 0.3,
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // ─── PAGE 2 ───────────────────────────────────────────────────────────────
  doc.addPage();
  yPos = 20;

  // ─── Lender Pipeline Snapshot ───────────────────────────────────────────
  const showPipeline = editableContent ? editableContent.sectionsVisible.pipelineSnapshot : true;
  if (showPipeline) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...brandBlue);
    doc.text('Lender Pipeline Snapshot', margin, yPos);
    yPos += 10;

    // Use shared bucketing so PDF mirrors the modal preview exactly
    // (On Deck = Sent DRL + On Deck; In Review = In Review/substages; Passed = Passed; Excluded/On Hold hidden).
    const b = bucketLenders(deal.lenders, configuredStages);
    const pipelineGroups: { label: string; lenders: string[]; borderColor: [number, number, number]; iconColor: [number, number, number] }[] = [
      { label: 'On Deck', lenders: b.onDeck.map(l => l.name), borderColor: [59, 130, 246], iconColor: [59, 130, 246] },
      { label: 'In Review', lenders: b.inReview.map(l => l.name), borderColor: [34, 197, 94], iconColor: [34, 197, 94] },
      { label: 'Terms Issued', lenders: b.termsIssued.map(l => l.name), borderColor: [202, 138, 4], iconColor: [202, 138, 4] },
      { label: 'Passed', lenders: b.passed.map(l => l.name), borderColor: [239, 68, 68], iconColor: [239, 68, 68] },
    ];

    const cardW = (contentWidth - 9) / 4;
    const cardX = margin;

    for (let i = 0; i < pipelineGroups.length; i++) {
      const g = pipelineGroups[i];
      const x = cardX + i * (cardW + 3);
      const cardH = Math.max(40, 32 + g.lenders.length * 5);

      doc.setFillColor(...bgLight);
      doc.setDrawColor(...g.borderColor);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, yPos, cardW, cardH, 2, 2, 'FD');

      doc.setFillColor(...g.iconColor);
      doc.circle(x + 8, yPos + 8, 4, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...textDark);
      doc.text(`${g.label} (${g.lenders.length})`, x + 5, yPos + 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...textMedium);
      g.lenders.forEach((name, idx) => {
        doc.text(`${idx + 1}. ${name}`, x + 7, yPos + 26 + idx * 5);
      });
    }

    const maxCardH = Math.max(40, ...pipelineGroups.map(g => 32 + g.lenders.length * 5));
    yPos += maxCardH + 15;
  }

  // ─── Recent Milestones ──────────────────────────────────────────────────
  const showMilestones = editableContent ? editableContent.sectionsVisible.milestones : true;
  if (showMilestones) {
    const milestoneItems = editableContent
      ? editableContent.completedMilestones.filter(Boolean)
      : (deal.milestones || []).filter(m => m.completed).slice(0, 3).map(m => m.title);
    
    if (milestoneItems.length > 0 || !editableContent) {
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...brandBlue);
      doc.text('Recent Milestones', margin, yPos);
      yPos += 10;

      const finalMilestoneItems = milestoneItems.length > 0 ? milestoneItems : ['No completed milestones yet'];

      const mCardW = (contentWidth - 6) / 3;
      for (let i = 0; i < Math.min(finalMilestoneItems.length, 3); i++) {
        const x = margin + i * (mCardW + 3);
        const lines = doc.splitTextToSize(finalMilestoneItems[i], mCardW - 10);
        const cH = Math.max(35, 22 + lines.length * 4);

        doc.setFillColor(...bgLight);
        doc.setDrawColor(34, 197, 94);
        doc.setLineWidth(0.6);
        doc.roundedRect(x, yPos, mCardW, cH, 2, 2, 'FD');

        doc.setFillColor(187, 247, 208);
        doc.circle(x + mCardW / 2, yPos + 10, 5, 'F');
        doc.setFillColor(34, 197, 94);
        doc.circle(x + mCardW / 2, yPos + 10, 3, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...textDark);
        doc.text(lines, x + mCardW / 2, yPos + 20, { align: 'center', maxWidth: mCardW - 8 });
      }

      const mCardH = Math.max(35, 22 + 8);
      yPos += mCardH + 15;
    }
  }

  // ─── Next Steps ─────────────────────────────────────────────────────────
  const showNextSteps = editableContent ? editableContent.sectionsVisible.nextSteps : true;
  if (showNextSteps) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...brandBlue);
    doc.text('Next Steps', margin, yPos);
    yPos += 10;

    const nextItems = editableContent
      ? editableContent.nextSteps.filter(Boolean)
      : (deal.milestones || []).filter(m => !m.completed).slice(0, 2).map(m => m.title);
    const finalNextItems = nextItems.length > 0 ? nextItems : ['No upcoming steps defined'];

    const nsCardW = (contentWidth - 3) / 2;
    for (let i = 0; i < Math.min(finalNextItems.length, 2); i++) {
      const x = margin + i * (nsCardW + 3);
      const lines = doc.splitTextToSize(finalNextItems[i], nsCardW - 10);
      const cH = Math.max(35, 22 + lines.length * 4);

      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(251, 146, 60);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, yPos, nsCardW, cH, 2, 2, 'FD');

      doc.setFillColor(251, 146, 60);
      doc.circle(x + nsCardW / 2, yPos + 10, 5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('\u2192', x + nsCardW / 2 - 2, yPos + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...textDark);
      doc.text(lines, x + nsCardW / 2, yPos + 20, { align: 'center', maxWidth: nsCardW - 8 });
    }

    const nsCardH = Math.max(35, 22 + 8);
    yPos += nsCardH + 15;
  }

  // ─── What We Need From You ──────────────────────────────────────────────
  const showActionItems = editableContent ? editableContent.sectionsVisible.actionItems : true;
  if (showActionItems) {
    if (yPos > pageHeight - 50) { doc.addPage(); yPos = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...brandBlue);
    doc.text('What We Need From You', margin, yPos);
    yPos += 10;

    const actionText = editableContent
      ? editableContent.actionItems
      : (() => {
          const pendingItems = (outstandingItems || []).filter(i => !i.completed && !i.received);
          return pendingItems.length > 0 ? pendingItems.map(i => i.text).join('\n') : 'No action items at this time.';
        })();

    const actionLines = doc.splitTextToSize(actionText, contentWidth - 20);
    const actionCardH = Math.max(35, 20 + actionLines.length * 5);

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(147, 197, 253);
    doc.setLineWidth(0.6);
    doc.roundedRect(margin, yPos, contentWidth, actionCardH, 2, 2, 'FD');

    doc.setFillColor(147, 197, 253);
    doc.circle(margin + contentWidth / 2, yPos + 10, 5, 'F');
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('!', margin + contentWidth / 2 - 1, yPos + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...textDark);
    doc.text(actionLines, margin + contentWidth / 2, yPos + 20, { align: 'center', maxWidth: contentWidth - 16 });
  }

  // ─── Footer ─────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  const fileName = `${deal.company} Status Update - ${dateMMDD}.pdf`;
  if (options?.returnBlob) {
    return { blob: doc.output('blob'), pageCount: doc.getNumberOfPages() };
  }
  doc.save(fileName);
}

/** Convenience helper: build the Status Report PDF as a File ready to attach. */
export function buildStatusReportPdfFile(
  deal: Deal,
  configuredStages?: LenderStageConfig[],
  configuredSubstages?: LenderStageConfig[],
  outstandingItems?: OutstandingItem[],
  editableContent?: StatusReportEditableContent,
): File {
  const result = exportStatusReportToPDF(
    deal,
    configuredStages,
    configuredSubstages,
    outstandingItems,
    editableContent,
    { returnBlob: true },
  ) as { blob: Blob; pageCount: number };
  const { blob, pageCount } = result;
  const dateMMDD = new Date()
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
    .replace('/', '-');
  // Fresh per-generation stamp prevents any cached/stale chip from being
  // re-used. The composer binds by File identity, but this also makes the
  // server-side storage key (if uploaded later) unique per click.
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${deal.company} Status Update - ${dateMMDD} [${uniq}].pdf`;
  // Verify the PDF is a real, non-stub document before handing it to the
  // composer. A jsPDF-rendered status report for any real deal should be
  // well above 5 KB and have at least one page. If anything looks off,
  // throw so the caller can surface an error instead of attaching a broken
  // chip to the email draft.
  // eslint-disable-next-line no-console
  console.info('[StatusReport] generated PDF', {
    deal: deal.company,
    bytes: blob.size,
    mime: blob.type,
    pages: pageCount,
    fileName,
  });
  const MIN_BYTES = 5_000; // stub jsPDF is ~1–2 KB; real reports start ~15 KB+
  if (!blob || blob.size < MIN_BYTES) {
    throw new Error(
      `Status report PDF looks empty (${blob?.size ?? 0} bytes, ${pageCount} pages). Refusing to attach.`,
    );
  }
  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error(
      `Status report blob has wrong mime type "${blob.type}". Expected application/pdf.`,
    );
  }
  const file = new File([blob], fileName, { type: 'application/pdf' });
  // eslint-disable-next-line no-console
  console.info('[StatusReport] attached File', {
    name: file.name,
    size: file.size,
    type: file.type,
  });
  return file;
}

// Status Report Word Export
export async function exportStatusReportToWord(
  deal: Deal,
  configuredStages?: LenderStageConfig[],
  configuredSubstages?: LenderStageConfig[],
  outstandingItems?: OutstandingItem[],
  /**
   * Optional AI-rewritten "Key Feedback" strings keyed by lender name.
   * When provided, the Passed Lender Reasons table uses these instead of
   * raw lender notes. Empty string => intentionally blank for that lender.
   */
  passFeedbackOverrides?: Record<string, string>,
): Promise<void> {
  const dateMMDD = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-');
  const reportTitle = `${deal.company} Debt Status Report - ${dateMMDD}`;

  // Strip HTML tags + entities so notes render as real bullets, not "<ul><li>" text.
  const stripHtml = (s: string) =>
    (s || '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|li|div|h[1-6])\s*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const noteBullets = stripHtml(deal.notes || '')
    .split(/\n+/)
    .map(l => l.replace(/^[\s•\-*]+/, '').trim())
    .filter(Boolean);

  const children: any[] = [
    // Title
    new Paragraph({
      children: [
        new TextRun({
          text: reportTitle,
          bold: true,
          size: 48,
          color: '9333EA',
        }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${formatDate(new Date().toISOString())}`,
          size: 22,
          color: '666666',
        }),
      ],
      spacing: { after: 400 },
    }),

    // Deal Status Header
    new Paragraph({
      children: [
        new TextRun({
          text: 'Deal Status',
          bold: true,
          size: 28,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 200 },
    }),
  ];

  // Deal Status Content — render parsed bullets instead of literal HTML.
  if (noteBullets.length > 0) {
    for (const b of noteBullets) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: b, size: 22 })],
        spacing: { after: 80 },
      }));
    }
  } else {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'No status notes available', size: 22, italics: true, color: '888888' })],
      spacing: { after: 400 },
    }));
  }

  // Lender Pipeline Snapshot — counts mirror the modal preview buckets.
  const buckets = bucketLenders(deal.lenders, configuredStages);
  if ((deal.lenders || []).length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Lender Pipeline Snapshot', bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `On Deck: ${buckets.onDeck.length}    `, size: 22, bold: true }),
          new TextRun({ text: `In Review: ${buckets.inReview.length}    `, size: 22, bold: true }),
          new TextRun({ text: `Terms Issued: ${buckets.termsIssued.length}    `, size: 22, bold: true }),
          new TextRun({ text: `Passed: ${buckets.passed.length}`, size: 22, bold: true }),
        ],
        spacing: { after: 200 },
      }),
    );
  }

  // Lenders Section — client-facing: hide Excluded / On Hold; columns Lender | Stage | Notes.
  const clientLenders = (deal.lenders || []).filter(l => !isExcludedFromClientReport(l, configuredStages));
  if (clientLenders.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Current Lenders',
            bold: true,
            size: 28,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createHeaderCell('Lender'),
              createHeaderCell('Stage'),
              createHeaderCell('Notes'),
            ],
          }),
          ...clientLenders.map(lender => {
            const stageName = configuredStages?.find(s => s.id === lender.stage)?.label || 
                              LENDER_STAGE_CONFIG[lender.stage]?.label || 
                              lender.stage;
            const cleanNotes = stripHtml(lender.notes || '').replace(/\s+/g, ' ').trim() || '-';
            return new TableRow({
              children: [
                createDataCell(lender.name),
                createDataCell(stageName),
                createDataCell(cleanNotes),
              ],
            });
          }),
        ],
      })
    );
  }

  // Passed Lender Reasons — client-friendly Lender | Key Feedback.
  if (buckets.passed.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Passed Lender Reasons', bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3800, 6200],
        rows: [
          new TableRow({
            children: [
              createHeaderCell('Lender'),
              createHeaderCell('Key Feedback'),
            ],
          }),
          ...buckets.passed.map(l => {
            const { reason, feedback } = extractPassDetails(l);
            const override = passFeedbackOverrides?.[l.name];
            // Never fall back to raw notes — overrides win, otherwise blank.
            const keyFeedback =
              passFeedbackOverrides && l.name in passFeedbackOverrides
                ? (override || '')
                : (passFeedbackOverrides ? '' : (feedback || ''));
            return new TableRow({
              children: [
                createDataCell(l.name),
                createDataCell(keyFeedback),
              ],
            });
          }),
        ],
      }),
    );
  }

  // Outstanding Items — client-facing: incomplete items only, numbered list.
  const pendingItems = (outstandingItems || []).filter(i => !i.completed && !i.received);
  if (pendingItems.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Outstanding Items',
            bold: true,
            size: 28,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      }),
      ...pendingItems.map((item, idx) => new Paragraph({
        children: [new TextRun({ text: `${idx + 1}. ${stripHtml(item.text)}`, size: 22 })],
        spacing: { after: 80 },
      })),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${deal.company} Debt Status Report - ${dateMMDD}.docx`);
}
