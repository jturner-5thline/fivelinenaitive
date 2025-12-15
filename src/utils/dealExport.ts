import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { Deal, STAGE_CONFIG, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG, LENDER_STATUS_CONFIG, LENDER_STAGE_CONFIG, LENDER_TRACKING_STATUS_CONFIG } from '@/types/deal';

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
