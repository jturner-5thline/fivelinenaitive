import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DealWriteUpData } from '../DealWriteUp';
import { dealTypeIdsToLabels } from '@/utils/dealTypeLabels';

/* ── Color palette ── */
const C = {
  navy: [30, 41, 82] as [number, number, number],
  primary: [67, 56, 202] as [number, number, number],
  fg: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  lightBg: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [5, 150, 105] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  tableBorder: [226, 232, 240] as [number, number, number],
  headerBg: [241, 245, 249] as [number, number, number],
  badgeBg: [238, 242, 255] as [number, number, number],
};

/* ── Helpers ── */
function fmtCurrency(value: string | undefined): string {
  if (!value) return '—';
  const upper = value.toUpperCase();
  const isNeg = value.startsWith('(') || value.startsWith('-');
  const hasMM = upper.includes('MM') || upper.includes('M');
  const hasK = upper.includes('K');
  const cleaned = value.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return value;
  const sign = isNeg ? '-' : '';
  if (hasMM && num < 1_000) return `${sign}$${num.toFixed(1)}MM`;
  if (hasK && num < 1_000_000) return `${sign}$${num.toFixed(1)}K`;
  if (num >= 1_000_000) return `${sign}$${(num / 1_000_000).toFixed(1)}MM`;
  if (num >= 1_000) return `${sign}$${(num / 1_000).toFixed(1)}K`;
  return `${sign}$${num.toLocaleString()}`;
}

function parseNum(v: string | undefined): number | null {
  if (!v) return null;
  const isNeg = v.startsWith('(') || v.startsWith('-') || (v.includes('(') && v.includes(')'));
  const cleaned = v.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return isNeg ? -n : n;
}

function parsePct(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

interface ExportParams {
  data: DealWriteUpData;
  owners: Array<{ owner_name: string; ownership_percentage: number; owner_url?: string | null }>;
  totalEquityRaised: string;
  dealManager?: string;
  disclaimer?: string;
}

/* ── Page-aware cursor ── */
class PdfCursor {
  doc: jsPDF;
  y: number;
  pageW: number;
  pageH: number;
  marginL: number;
  marginR: number;
  marginTop: number;
  marginBottom: number;
  contentW: number;
  pageNum: number;
  companyName: string;
  disclaimer: string;

  constructor(doc: jsPDF, companyName: string, disclaimer: string) {
    this.doc = doc;
    this.pageW = doc.internal.pageSize.getWidth(); // 612 pt for letter
    this.pageH = doc.internal.pageSize.getHeight(); // 792 pt
    this.marginL = 40;
    this.marginR = 40;
    this.marginTop = 60; // space for header
    this.marginBottom = 50; // space for footer
    this.contentW = this.pageW - this.marginL - this.marginR;
    this.y = this.marginTop;
    this.pageNum = 1;
    this.companyName = companyName;
    this.disclaimer = disclaimer;
    this.drawHeader();
    this.drawFooter();
  }

  ensureSpace(needed: number) {
    if (this.y + needed > this.pageH - this.marginBottom) {
      this.newPage();
    }
  }

  newPage() {
    this.doc.addPage();
    this.pageNum++;
    this.y = this.marginTop;
    this.drawHeader();
    this.drawFooter();
  }

  drawHeader() {
    const d = this.doc;
    // Navy bar
    d.setFillColor(...C.navy);
    d.rect(0, 0, this.pageW, 42, 'F');
    // "5TH LINE" brand
    d.setFontSize(14);
    d.setFont('helvetica', 'bold');
    d.setTextColor(...C.white);
    d.text('5TH LINE', this.marginL, 20);
    // "DEAL WRITE-UP" label
    d.setFontSize(9);
    d.setFont('helvetica', 'normal');
    d.text('DEAL WRITE-UP', this.marginL, 34);
    // Company name right-aligned
    d.setFontSize(10);
    d.setFont('helvetica', 'bold');
    const nameW = d.getTextWidth(this.companyName);
    d.text(this.companyName, this.pageW - this.marginR - nameW, 27);
  }

  drawFooter() {
    const d = this.doc;
    const footerY = this.pageH - 25;
    d.setDrawColor(...C.tableBorder);
    d.line(this.marginL, footerY - 8, this.pageW - this.marginR, footerY - 8);
    d.setFontSize(7);
    d.setFont('helvetica', 'italic');
    d.setTextColor(...C.muted);
    const discText = this.disclaimer || 'Confidential — For Intended Recipients Only';
    const lines = d.splitTextToSize(discText, this.contentW - 60);
    d.text(lines.slice(0, 2), this.marginL, footerY);
    // Page number
    d.setFont('helvetica', 'normal');
    d.setFontSize(8);
    const pgText = `Page ${this.pageNum}`;
    d.text(pgText, this.pageW - this.marginR - d.getTextWidth(pgText), footerY);
  }
}

/* ── Main export function ── */
export async function exportWriteUpToPdf({ data, owners, totalEquityRaised, dealManager, disclaimer }: ExportParams) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const companyName = data.publishAsAnonymous ? 'Anonymous Company' : (data.companyName || 'Untitled');
  const c = new PdfCursor(doc, companyName, disclaimer || '');
  const dealTypeLabels = dealTypeIdsToLabels(data.dealTypes);

  const hasRevGrowth = data.financialYears.some(fy => (fy as any).rev_growth);
  const hasGmChange = data.financialYears.some(fy => (fy as any).gross_margin_change);
  const hasEbitdaChange = data.financialYears.some(fy => (fy as any).ebitda_change);

  /* ── Section helpers ── */
  const sectionTitle = (title: string) => {
    c.ensureSpace(40);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.fg);
    doc.text(title, c.marginL, c.y);
    c.y += 4;
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(2);
    doc.line(c.marginL, c.y, c.marginL + 50, c.y);
    c.y += 16;
  };

  const label = (text: string) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.muted);
    doc.text(text.toUpperCase(), c.marginL, c.y);
    c.y += 12;
  };

  const bodyText = (text: string, opts?: { indent?: number; maxWidth?: number; bold?: boolean; color?: [number, number, number] }) => {
    const x = c.marginL + (opts?.indent || 0);
    const mw = opts?.maxWidth || (c.contentW - (opts?.indent || 0));
    doc.setFontSize(10);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setTextColor(...(opts?.color || C.fg));
    const lines: string[] = doc.splitTextToSize(text, mw);
    for (const line of lines) {
      c.ensureSpace(14);
      doc.text(line, x, c.y);
      c.y += 13;
    }
  };

  const drawBadges = (items: string[], x: number) => {
    let cx = x;
    const maxX = c.pageW - c.marginR;
    for (const item of items) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const tw = doc.getTextWidth(item);
      const bw = tw + 12;
      if (cx + bw > maxX) {
        cx = x;
        c.y += 18;
        c.ensureSpace(18);
      }
      doc.setFillColor(...C.badgeBg);
      doc.setDrawColor(...C.primary);
      doc.setLineWidth(0.5);
      doc.roundedRect(cx, c.y - 10, bw, 16, 3, 3, 'FD');
      doc.setTextColor(...C.primary);
      doc.text(item, cx + 6, c.y);
      cx += bw + 6;
    }
    c.y += 14;
  };

  /* ── 1. Title Section ── */
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.fg);
  doc.text(companyName, c.marginL, c.y);
  c.y += 18;

  // Badges: industries, location, deal types
  const allBadges = [
    ...data.industries,
    ...(data.location ? [data.location] : []),
    ...dealTypeLabels,
  ];
  if (allBadges.length > 0) {
    drawBadges(allBadges, c.marginL);
  }
  c.y += 8;

  /* ── 2. Deal Overview ── */
  if (data.description || data.capitalAsk || data.useOfFunds || dealTypeLabels.length > 0) {
    sectionTitle('Deal Overview');
    if (data.capitalAsk) {
      label('Capital Ask');
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.primary);
      doc.text(fmtCurrency(data.capitalAsk), c.marginL, c.y);
      c.y += 20;
    }
    if (data.description) {
      bodyText(data.description);
      c.y += 6;
    }
    if (dealTypeLabels.length > 0) {
      label('Deal Type');
      bodyText(dealTypeLabels.join(', '), { bold: true });
      c.y += 4;
    }
    if (data.useOfFunds) {
      label('Use of Proceeds');
      const lines = data.useOfFunds.split('\\n').filter(l => l.trim());
      for (const line of lines) {
        const clean = line.replace(/^\\s*[-*•]\\s*/, '');
        bodyText(`• ${clean}`, { indent: 8 });
      }
      c.y += 4;
    }
  }

  /* ── 3. Key Items ── */
  const filteredKeyItems = (data.keyItems || []).filter(i => i.title?.trim());
  if (filteredKeyItems.length > 0) {
    c.ensureSpace(60);
    sectionTitle('Key Items');
    for (const item of filteredKeyItems) {
      c.ensureSpace(30);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.fg);
      doc.text(`▸ ${item.title}`, c.marginL, c.y);
      c.y += 14;
      if (item.description) {
        bodyText(item.description, { indent: 14, color: C.muted });
        c.y += 4;
      }
    }
  }

  /* ── 4. Company Overview ── */
  const overviewFields = [
    { label: 'Headquarters', value: data.location },
    { label: 'Industry', value: data.industries.join(', ') },
    { label: 'Year Founded', value: data.yearFounded },
    { label: 'Customer Base', value: data.customerBase?.join(', ') },
    { label: 'Headcount', value: data.headcount },
    { label: 'Business Model', value: data.billingModels.join(', ') },
    { label: 'Profitability', value: data.profitability },
    { label: 'Accounting System', value: data.accountingSystem },
    { label: 'Company Website', value: data.companyUrl },
    { label: 'Deal Manager', value: dealManager },
  ].filter(f => f.value);

  if (overviewFields.length > 0) {
    c.ensureSpace(60);
    sectionTitle('Company Overview');
    // Render as 2-column grid using a table
    const rows: string[][] = [];
    for (let i = 0; i < overviewFields.length; i += 2) {
      const left = overviewFields[i];
      const right = overviewFields[i + 1];
      rows.push([
        left.label, left.value || '—',
        right ? right.label : '', right ? (right.value || '—') : '',
      ]);
    }
    autoTable(doc, {
      startY: c.y,
      body: rows,
      theme: 'plain',
      margin: { left: c.marginL, right: c.marginR },
      styles: { fontSize: 9, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: C.fg, font: 'helvetica' },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: C.muted, cellWidth: 90 },
        1: { cellWidth: (c.contentW / 2) - 90 },
        2: { fontStyle: 'bold', textColor: C.muted, cellWidth: 90 },
        3: { cellWidth: (c.contentW / 2) - 90 },
      },
      didDrawPage: () => { /* handled by cursor */ },
    });
    c.y = (doc as any).lastAutoTable.finalY + 16;
  }

  /* ── 5. Team ── */
  const filteredTeam = (data.team || []).filter(m => m.name.trim());
  if (filteredTeam.length > 0) {
    c.ensureSpace(60);
    sectionTitle('Team');
    autoTable(doc, {
      startY: c.y,
      head: [['Name', 'Title', 'LinkedIn']],
      body: filteredTeam.map(m => [m.name, m.title || '—', m.linkedin || '—']),
      margin: { left: c.marginL, right: c.marginR },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 6, textColor: C.fg },
      alternateRowStyles: { fillColor: C.lightBg },
      tableLineColor: C.tableBorder,
      tableLineWidth: 0.5,
    });
    c.y = (doc as any).lastAutoTable.finalY + 16;
  }

  /* ── 6. Company Highlights ── */
  const filteredHighlights = data.companyHighlights.filter(i => i.title.trim());
  if (filteredHighlights.length > 0) {
    c.ensureSpace(60);
    sectionTitle('Company Highlights');
    for (const item of filteredHighlights) {
      c.ensureSpace(30);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.fg);
      doc.text(`▸ ${item.title}`, c.marginL, c.y);
      c.y += 14;
      if (item.description) {
        bodyText(item.description, { indent: 14, color: C.muted });
        c.y += 4;
      }
    }
  }

  /* ── 7. Revenue Performance (data table instead of chart) ── */
  const chartData = data.financialYears
    .map(fy => {
      const rev = parseNum(fy.revenue);
      const ebitda = parseNum(fy.ebitda);
      const gm = parsePct(fy.gross_margin);
      return { year: fy.year, revenue: rev, ebitda, grossMargin: gm };
    })
    .filter(d => d.year)
    .sort((a, b) => {
      const py = (y: string) => { const m = y.match(/(\d{4})/); return m ? parseInt(m[1], 10) : 0; };
      return py(a.year) - py(b.year);
    });

  if (chartData.length >= 2) {
    c.ensureSpace(80);
    sectionTitle('Revenue & EBITDA Trends');

    // Revenue trend mini-table
    autoTable(doc, {
      startY: c.y,
      head: [['Year', 'Revenue', 'YoY Δ', 'EBITDA', 'Gross Margin']],
      body: chartData.map((d, i) => {
        const prev = i > 0 ? chartData[i - 1] : null;
        const revGrowth = (d.revenue && prev?.revenue)
          ? `${(((d.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100).toFixed(1)}%`
          : '—';
        const fmtVal = (v: number | null) => {
          if (v === null) return '—';
          const sign = v < 0 ? '-' : '';
          const abs = Math.abs(v);
          if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}MM`;
          if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
          return `${sign}$${abs.toLocaleString()}`;
        };
        return [
          d.year,
          fmtVal(d.revenue),
          revGrowth,
          fmtVal(d.ebitda),
          d.grossMargin !== null ? `${d.grossMargin.toFixed(1)}%` : '—',
        ];
      }),
      margin: { left: c.marginL, right: c.marginR },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 9, halign: 'center' },
      styles: { fontSize: 9, cellPadding: 6, textColor: C.fg, halign: 'center' },
      alternateRowStyles: { fillColor: C.lightBg },
      tableLineColor: C.tableBorder,
      tableLineWidth: 0.5,
    });
    c.y = (doc as any).lastAutoTable.finalY + 16;

    // Margin Analysis sub-table
    const marginData = chartData.map((d, i) => {
      const ebitdaMargin = (d.revenue && d.ebitda) ? (d.ebitda / d.revenue) * 100 : null;
      const prev = i > 0 ? chartData[i - 1] : null;
      const prevEm = (prev?.revenue && prev?.ebitda) ? (prev.ebitda / prev.revenue) * 100 : null;
      const gmChange = (d.grossMargin !== null && prev?.grossMargin !== null && prev?.grossMargin !== undefined)
        ? d.grossMargin - prev.grossMargin : null;
      const emChange = (ebitdaMargin !== null && prevEm !== null) ? ebitdaMargin - prevEm : null;
      return { year: d.year, gm: d.grossMargin, em: ebitdaMargin, gmΔ: gmChange, emΔ: emChange };
    });

    if (marginData.some(d => d.gm !== null || d.em !== null)) {
      c.ensureSpace(60);
      label('Margin Analysis');
      autoTable(doc, {
        startY: c.y,
        head: [['Year', 'Gross Margin', 'Δ GM', 'EBITDA Margin', 'Δ EBITDA Margin']],
        body: marginData.map(d => [
          d.year,
          d.gm !== null ? `${d.gm.toFixed(1)}%` : '—',
          d.gmΔ !== null ? `${d.gmΔ >= 0 ? '+' : ''}${d.gmΔ.toFixed(1)}pp` : '—',
          d.em !== null ? `${d.em.toFixed(1)}%` : '—',
          d.emΔ !== null ? `${d.emΔ >= 0 ? '+' : ''}${d.emΔ.toFixed(1)}pp` : '—',
        ]),
        margin: { left: c.marginL, right: c.marginR },
        headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', fontSize: 9, halign: 'center' },
        styles: { fontSize: 9, cellPadding: 6, textColor: C.fg, halign: 'center' },
        alternateRowStyles: { fillColor: C.lightBg },
        tableLineColor: C.tableBorder,
        tableLineWidth: 0.5,
      });
      c.y = (doc as any).lastAutoTable.finalY + 16;
    }
  }

  /* ── 8. Financials Table ── */
  if (data.financialYears.length > 0) {
    c.ensureSpace(80);
    sectionTitle('Financials');

    const head = ['Year', 'Total Revenue'];
    if (hasRevGrowth) head.push('Rev. Growth');
    head.push('Gross Margin');
    if (hasGmChange) head.push('Δ GM');
    head.push('EBITDA');
    if (hasEbitdaChange) head.push('Δ EBITDA');

    const body = data.financialYears.map(fy => {
      const fyAny = fy as any;
      const row = [fy.year, fmtCurrency(fy.revenue)];
      if (hasRevGrowth) row.push(fyAny.rev_growth || '—');
      row.push(fy.gross_margin || '—');
      if (hasGmChange) row.push(fyAny.gross_margin_change || '—');
      row.push(fmtCurrency(fy.ebitda));
      if (hasEbitdaChange) row.push(fyAny.ebitda_change || '—');
      return row;
    });

    autoTable(doc, {
      startY: c.y,
      head: [head],
      body,
      margin: { left: c.marginL, right: c.marginR },
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 9, halign: 'center' },
      styles: { fontSize: 9, cellPadding: 6, textColor: C.fg, halign: 'center' },
      alternateRowStyles: { fillColor: C.lightBg },
      tableLineColor: C.tableBorder,
      tableLineWidth: 0.5,
    });
    c.y = (doc as any).lastAutoTable.finalY + 16;

    // Existing Debt
    if (data.existingDebtDetails) {
      c.ensureSpace(40);
      label('Existing Debt');
      const debtLines = data.existingDebtDetails.split('\\n').filter(l => l.trim());
      for (const line of debtLines) {
        const clean = line.replace(/^\\s*[-*•]\\s*/, '');
        bodyText(`• ${clean}`, { indent: 8, color: C.muted });
      }
      c.y += 6;
    }

    // Commentary Notes
    if (data.financialComments.length > 0) {
      c.ensureSpace(40);
      label('Commentary Notes');
      for (const fc of data.financialComments) {
        c.ensureSpace(28);
        if (fc.title) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...C.fg);
          doc.text(fc.title, c.marginL + 8, c.y);
          c.y += 13;
        }
        if (fc.description) {
          bodyText(fc.description, { indent: 8, color: C.muted });
          c.y += 4;
        }
      }
    }
  }

  /* ── 9. Ownership & Equity ── */
  if (owners.length > 0 || totalEquityRaised) {
    c.ensureSpace(80);
    sectionTitle('Ownership & Equity');

    if (owners.length > 0) {
      autoTable(doc, {
        startY: c.y,
        head: [['Shareholder', 'Ownership %']],
        body: owners.map(o => [o.owner_name, `${o.ownership_percentage}%`]),
        margin: { left: c.marginL, right: c.marginR },
        headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 6, textColor: C.fg },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: { fillColor: C.lightBg },
        tableLineColor: C.tableBorder,
        tableLineWidth: 0.5,
      });
      c.y = (doc as any).lastAutoTable.finalY + 12;
    }

    if (totalEquityRaised) {
      c.ensureSpace(20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.fg);
      doc.text('Total Equity Raised:', c.marginL, c.y);
      const eqW = doc.getTextWidth('Total Equity Raised:  ');
      doc.setTextColor(...C.primary);
      doc.text(totalEquityRaised, c.marginL + eqW, c.y);
      c.y += 18;
    }
  }

  /* ── 10. Disclaimer ── */
  if (disclaimer && disclaimer.trim()) {
    c.newPage();
    doc.setDrawColor(...C.tableBorder);
    doc.line(c.marginL, c.y, c.pageW - c.marginR, c.y);
    c.y += 14;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...C.muted);
    const discLines: string[] = doc.splitTextToSize(disclaimer, c.contentW);
    for (const line of discLines) {
      c.ensureSpace(12);
      doc.text(line, c.marginL, c.y);
      c.y += 11;
    }
  }

  /* ── Update footers with total page count ── */
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = c.pageH - 25;
    // Overwrite page number with "Page X of Y"
    doc.setFillColor(...C.white);
    doc.rect(c.pageW - c.marginR - 70, footerY - 8, 70, 14, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    const pgText = `Page ${i} of ${totalPages}`;
    doc.text(pgText, c.pageW - c.marginR - doc.getTextWidth(pgText), footerY);
  }

  /* ── Save ── */
  const safeName = (data.publishAsAnonymous ? 'Anonymous' : (data.companyName || 'Deal')).replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${safeName}_WriteUp.pdf`);
}
