import { AgreementSection } from './types';
import { resolveForExport, renderQualifierList } from './templateResolver';
import { Document, Packer, Paragraph, TextRun, AlignmentType, TabStopPosition, TabStopType } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
}

export async function exportToDocx(
  sections: AgreementSection[],
  values: Record<string, string>,
  companyName: string
) {
  const enabled = sections.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order);
  const companyShort = values['company_short'] || 'Company';
  const children: Paragraph[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: 'ADVISORY AGREEMENT', bold: true, font: 'Times New Roman', size: 28 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));

  for (const section of enabled) {
    const isExhibit = section.section_id.startsWith('exhibit_');
    const resolved = resolveForExport(section.template_text, values);

    if (isExhibit) {
      children.push(new Paragraph({
        children: [new TextRun({ text: resolved, bold: true, font: 'Times New Roman', size: 24 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 },
      }));

      if (section.qualifiers?.length) {
        const qualText = resolveForExport(
          renderQualifierList(section.qualifiers, section.section_id === 'exhibit_a' ? 'exhibit_a' : 'exhibit_b', values),
          values
        );
        for (const line of qualText.split('\n').filter(Boolean)) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, font: 'Times New Roman', size: 22 })],
            indent: line.startsWith('(') ? { left: 720 } : undefined,
            spacing: { after: 100 },
          }));
        }
      }
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: resolved, font: 'Times New Roman', size: 22 })],
        spacing: { after: 200 },
      }));

      if (section.subsections) {
        for (const sub of section.subsections.filter(s => s.enabled)) {
          const subResolved = resolveForExport(sub.template_text, values);
          children.push(new Paragraph({
            children: [new TextRun({ text: subResolved, font: 'Times New Roman', size: 22 })],
            indent: { left: 720 },
            spacing: { after: 100 },
          }));
        }
      }
    }
  }

  // Signature block
  children.push(new Paragraph({ spacing: { before: 600 } }));
  for (const entity of ['5th Line Capital Advisors LLC', companyShort]) {
    children.push(new Paragraph({
      children: [new TextRun({ text: entity, bold: true, font: 'Times New Roman', size: 22 })],
      spacing: { before: 400, after: 100 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Agreed to and Accepted:', font: 'Times New Roman', size: 20, italics: true })],
      spacing: { after: 200 },
    }));
    for (const label of ['Name', 'Title', 'Date']) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `${label}: ___________________________`, font: 'Times New Roman', size: 22 })],
        spacing: { after: 100 },
      }));
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Advisory_Agreement_${sanitizeName(companyName)}.docx`);
}

export async function exportToPdf(
  sections: AgreementSection[],
  values: Record<string, string>,
  companyName: string
) {
  const enabled = sections.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order);
  const companyShort = values['company_short'] || 'Company';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 54; // 0.75in
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addText = (text: string, opts: { bold?: boolean; size?: number; align?: string; indent?: number } = {}) => {
    const { bold = false, size = 11, align = 'left', indent = 0 } = opts;
    doc.setFontSize(size);
    doc.setFont('times', bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, maxWidth - indent);
    const lineHeight = size * 1.6;

    for (const line of lines) {
      if (y + lineHeight > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      if (align === 'center') {
        doc.text(line, pageWidth / 2, y, { align: 'center' });
      } else {
        doc.text(line, margin + indent, y);
      }
      y += lineHeight;
    }
    y += size * 0.5;
  };

  // Title
  addText('ADVISORY AGREEMENT', { bold: true, size: 14, align: 'center' });
  y += 10;

  for (const section of enabled) {
    const isExhibit = section.section_id.startsWith('exhibit_');
    const resolved = resolveForExport(section.template_text, values);

    if (isExhibit) {
      y += 20;
      addText(resolved, { bold: true, size: 12, align: 'center' });
      if (section.qualifiers?.length) {
        const qualText = resolveForExport(
          renderQualifierList(section.qualifiers, section.section_id === 'exhibit_a' ? 'exhibit_a' : 'exhibit_b', values),
          values
        );
        for (const line of qualText.split('\n').filter(Boolean)) {
          addText(line, { indent: line.startsWith('(') ? 36 : 0 });
        }
      }
    } else {
      addText(resolved);
      if (section.subsections) {
        for (const sub of section.subsections.filter(s => s.enabled)) {
          addText(resolveForExport(sub.template_text, values), { indent: 36 });
        }
      }
    }
  }

  // Signature
  y += 30;
  for (const entity of ['5th Line Capital Advisors LLC', companyShort]) {
    addText(entity, { bold: true });
    addText('Agreed to and Accepted:', { size: 10 });
    for (const label of ['Name', 'Title', 'Date']) {
      addText(`${label}: ___________________________`);
    }
    y += 10;
  }

  doc.save(`Advisory_Agreement_${sanitizeName(companyName)}.pdf`);
}
