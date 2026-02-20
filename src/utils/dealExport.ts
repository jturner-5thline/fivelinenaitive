import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, AlignmentType, PageOrientation } from 'docx';
import { saveAs } from 'file-saver';
import { Deal, DealStatus, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG, LENDER_TRACKING_STATUS_CONFIG } from '@/types/deal';

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
        LENDER_STATUS_CONFIG[lender.status].label,
        LENDER_STAGE_CONFIG[lender.stage].label,
        LENDER_TRACKING_STATUS_CONFIG[lender.trackingStatus].label,
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
      LENDER_STATUS_CONFIG[lender.status].label,
      LENDER_STAGE_CONFIG[lender.stage].label,
      LENDER_TRACKING_STATUS_CONFIG[lender.trackingStatus].label,
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
                            createDataCell(LENDER_STATUS_CONFIG[lender.status].label),
                            createDataCell(LENDER_STAGE_CONFIG[lender.stage].label),
                            createDataCell(LENDER_TRACKING_STATUS_CONFIG[lender.trackingStatus].label),
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

interface LenderStageConfig {
  id: string;
  label: string;
}

interface OutstandingItem {
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

// Status Report PDF Export — matches branded design template
export function exportStatusReportToPDF(deal: Deal, configuredStages?: LenderStageConfig[], configuredSubstages?: LenderStageConfig[], outstandingItems?: OutstandingItem[]): void {
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

  // Parse notes into bullet points (split by newlines, strip HTML tags)
  const rawNotes = deal.notes || '';
  const strippedNotes = rawNotes.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const bulletItems = strippedNotes.split(/\n+/).map(s => s.trim()).filter(Boolean);

  if (bulletItems.length > 0) {
    for (const item of bulletItems) {
      if (yPos > pageHeight - 40) { doc.addPage(); yPos = 20; }
      const lines = doc.splitTextToSize(item, contentWidth - 10);
      // Bullet circle
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

  // ─── Key Lenders – Process Status & Next Actions ────────────────────────
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

  // Filter active lenders for the detail table (exclude passed)
  const activeLenders = (deal.lenders || []).filter(l => l.trackingStatus !== 'passed');

  if (activeLenders.length > 0) {
    const lenderTableData = activeLenders.map(lender => {
      const stageName = configuredStages?.find(s => s.id === lender.stage)?.label ||
        LENDER_STAGE_CONFIG[lender.stage]?.label || lender.stage;
      return [
        lender.name,
        stageName,
        '', // Key Focus Areas — placeholder, can be enriched
        '', // Current Challenges — placeholder
        lender.notes || '',
      ];
    });

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

  // ─── PAGE 2 ───────────────────────────────────────────────────────────────
  doc.addPage();
  yPos = 20;

  // ─── Lender Pipeline Snapshot ───────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brandBlue);
  doc.text('Lender Pipeline Snapshot', margin, yPos);
  yPos += 10;

  // Group lenders by tracking status
  const allLenders = deal.lenders || [];
  const pipelineGroups: { label: string; lenders: string[]; borderColor: [number, number, number]; iconColor: [number, number, number] }[] = [
    { label: 'On Deck', lenders: allLenders.filter(l => l.trackingStatus === 'on-deck').map(l => l.name), borderColor: [59, 130, 246], iconColor: [59, 130, 246] },
    { label: 'In Review', lenders: allLenders.filter(l => l.trackingStatus === 'active').map(l => l.name), borderColor: [59, 130, 246], iconColor: [59, 130, 246] },
    { label: 'Terms Issued', lenders: allLenders.filter(l => l.stage === 'term-sheets' || l.stage === 'draft-terms').map(l => l.name), borderColor: [34, 197, 94], iconColor: [34, 197, 94] },
    { label: 'Passed', lenders: allLenders.filter(l => l.trackingStatus === 'passed').map(l => l.name), borderColor: [239, 68, 68], iconColor: [239, 68, 68] },
  ];

  const cardW = (contentWidth - 9) / 4; // 4 cards with 3px gap
  const cardX = margin;

  for (let i = 0; i < pipelineGroups.length; i++) {
    const g = pipelineGroups[i];
    const x = cardX + i * (cardW + 3);
    const cardH = Math.max(40, 32 + g.lenders.length * 5);

    // Card background
    doc.setFillColor(...bgLight);
    doc.setDrawColor(...g.borderColor);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, yPos, cardW, cardH, 2, 2, 'FD');

    // Icon circle
    doc.setFillColor(...g.iconColor);
    doc.circle(x + 8, yPos + 8, 4, 'F');

    // Stage label with count
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...textDark);
    doc.text(`${g.label} (${g.lenders.length})`, x + 5, yPos + 20);

    // Lender names
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMedium);
    g.lenders.forEach((name, idx) => {
      doc.text(`${idx + 1}. ${name}`, x + 7, yPos + 26 + idx * 5);
    });
  }

  const maxCardH = Math.max(40, ...pipelineGroups.map(g => 32 + g.lenders.length * 5));
  yPos += maxCardH + 15;

  // ─── Recent Milestones ──────────────────────────────────────────────────
  const completedMilestones = (deal.milestones || []).filter(m => m.completed);
  if (completedMilestones.length > 0 || true) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...brandBlue);
    doc.text('Recent Milestones', margin, yPos);
    yPos += 10;

    const milestoneItems = completedMilestones.length > 0
      ? completedMilestones.slice(0, 3).map(m => m.title)
      : ['No completed milestones yet'];

    const mCardW = (contentWidth - 6) / 3;
    for (let i = 0; i < Math.min(milestoneItems.length, 3); i++) {
      const x = margin + i * (mCardW + 3);
      const lines = doc.splitTextToSize(milestoneItems[i], mCardW - 10);
      const cH = Math.max(35, 22 + lines.length * 4);

      doc.setFillColor(...bgLight);
      doc.setDrawColor(34, 197, 94);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, yPos, mCardW, cH, 2, 2, 'FD');

      // Icon circle
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

  // ─── Next Steps ─────────────────────────────────────────────────────────
  const upcomingMilestones = (deal.milestones || []).filter(m => !m.completed);
  if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brandBlue);
  doc.text('Next Steps', margin, yPos);
  yPos += 10;

  const nextItems = upcomingMilestones.length > 0
    ? upcomingMilestones.slice(0, 2).map(m => m.title)
    : ['No upcoming steps defined'];

  const nsCardW = (contentWidth - 3) / 2;
  for (let i = 0; i < Math.min(nextItems.length, 2); i++) {
    const x = margin + i * (nsCardW + 3);
    const lines = doc.splitTextToSize(nextItems[i], nsCardW - 10);
    const cH = Math.max(35, 22 + lines.length * 4);

    doc.setFillColor(255, 251, 235); // Light amber
    doc.setDrawColor(251, 146, 60); // Orange
    doc.setLineWidth(0.6);
    doc.roundedRect(x, yPos, nsCardW, cH, 2, 2, 'FD');

    // Orange circle with arrow
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

  // ─── What We Need From You ──────────────────────────────────────────────
  if (yPos > pageHeight - 50) { doc.addPage(); yPos = 20; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brandBlue);
  doc.text('What We Need From You', margin, yPos);
  yPos += 10;

  const pendingItems = (outstandingItems || []).filter(i => !i.completed && !i.received);
  const actionText = pendingItems.length > 0
    ? pendingItems.map(i => i.text).join('\n')
    : 'No action items at this time.';

  const actionLines = doc.splitTextToSize(actionText, contentWidth - 20);
  const actionCardH = Math.max(35, 20 + actionLines.length * 5);

  doc.setFillColor(241, 245, 249); // Light blue-gray
  doc.setDrawColor(147, 197, 253); // Blue border
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, yPos, contentWidth, actionCardH, 2, 2, 'FD');

  // Warning/info icon
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

  doc.save(`${deal.company} Status Update - ${dateMMDD}.pdf`);
}

// Status Report Word Export
export async function exportStatusReportToWord(deal: Deal, configuredStages?: LenderStageConfig[], configuredSubstages?: LenderStageConfig[], outstandingItems?: OutstandingItem[]): Promise<void> {
  const dateMMDD = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-');
  const reportTitle = `${deal.company} Debt Status Report - ${dateMMDD}`;
  
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

    // Deal Status Content
    new Paragraph({
      children: [
        new TextRun({
          text: deal.notes || 'No status notes available',
          size: 22,
          italics: !deal.notes,
          color: deal.notes ? '000000' : '888888',
        }),
      ],
      spacing: { after: 400 },
    }),
  ];

  // Lenders Section
  if (deal.lenders && deal.lenders.length > 0) {
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
              createHeaderCell('Lender Name'),
              createHeaderCell('Stage'),
              createHeaderCell('Substage'),
              createHeaderCell('Tracking'),
              createHeaderCell('Pass Reason'),
              createHeaderCell('Notes'),
            ],
          }),
          ...deal.lenders.map(lender => {
            const stageName = configuredStages?.find(s => s.id === lender.stage)?.label || 
                              LENDER_STAGE_CONFIG[lender.stage]?.label || 
                              lender.stage;
            const substageName = lender.substage 
              ? (configuredSubstages?.find(s => s.id === lender.substage)?.label || lender.substage)
              : '-';
            const passReason = lender.trackingStatus === 'passed' && lender.passReason 
              ? lender.passReason 
              : '-';
            return new TableRow({
              children: [
                createDataCell(lender.name),
                createDataCell(stageName),
                createDataCell(substageName),
                createDataCell(LENDER_TRACKING_STATUS_CONFIG[lender.trackingStatus]?.label || lender.trackingStatus),
                createDataCell(passReason),
                createDataCell(lender.notes || '-'),
              ],
            });
          }),
        ],
      })
    );
  }

  // Outstanding Items Section
  if (outstandingItems && outstandingItems.length > 0) {
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
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createHeaderCell('Item'),
              createHeaderCell('Status'),
              createHeaderCell('Requested By'),
              createHeaderCell('Completed'),
            ],
          }),
          ...outstandingItems.map(item => {
            const status = item.received && item.approved 
              ? 'Completed' 
              : item.approved 
                ? 'Approved' 
                : item.received 
                  ? 'Received' 
                  : 'Requested';
            const requestedBy = Array.isArray(item.requestedBy) 
              ? item.requestedBy.join(', ') 
              : item.requestedBy || '-';
            const completedDate = item.completedAt 
              ? formatDate(item.completedAt) 
              : '-';
            return new TableRow({
              children: [
                createDataCell(item.text),
                createDataCell(status),
                createDataCell(requestedBy),
                createDataCell(completedDate),
              ],
            });
          }),
        ],
      })
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
