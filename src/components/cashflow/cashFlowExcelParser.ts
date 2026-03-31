import ExcelJS from 'exceljs';
import type { DailyData, DailyRowStructure } from './types';

/**
 * Parse 5th Line Capital daily cash flow spreadsheet.
 * Expects a sheet named "Cash Flow Weekly" with:
 *  - Date headers in row ~2, columns B onward
 *  - ACTUALS/FORECAST label row
 *  - Row structure matching 5th Line's cash flow layout
 */

interface ParsedCashFlowRow {
  label: string;
  entity: string;
  section: 'balance_begin' | 'balance_end' | 'receipts' | 'disbursements' | 'transfers' | 'summary';
  is_total: boolean;
  is_protected: boolean;
  indent: boolean;
  values: number[];
}

// Row label patterns to identify sections
const ROW_PATTERNS: {
  match: (label: string) => boolean;
  section: ParsedCashFlowRow['section'];
  is_total: boolean;
  is_protected: boolean;
  indent: boolean;
  entity: string;
}[] = [];

function normalizeLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).trim().replace(/\s+/g, ' ');
}

function extractEntity(label: string): string {
  if (/8630|5LC(?!A)/i.test(label) && !/5LCA/i.test(label)) return '5LC';
  if (/2681|5LCA/i.test(label)) return '5LCA';
  if (/0661|5LFS/i.test(label)) return '5LFS';
  if (/3965|5LT/i.test(label)) return '5LT';
  return 'ALL';
}

function getCellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as any).result;
    if (typeof r === 'number') return r;
    if (r === null || r === undefined) return 0;
    const parsed = parseFloat(String(r));
    return isNaN(parsed) ? 0 : parsed;
  }
  const parsed = parseFloat(String(v));
  return isNaN(parsed) ? 0 : parsed;
}

function getCellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') {
    if ('richText' in v) return (v as any).richText.map((rt: any) => rt.text).join('').trim();
    if ('text' in v) return String((v as any).text).trim();
    if ('result' in v) return String((v as any).result ?? '').trim();
  }
  return String(v).trim();
}

export async function parseCashFlowExcel(file: File): Promise<{
  dailyData: DailyData;
  rowStructure: DailyRowStructure;
  forecastStartIndex: number | null;
}> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Find the target sheet
  let worksheet = workbook.getWorksheet('Cash Flow Weekly');
  if (!worksheet) {
    // Try partial match
    worksheet = workbook.worksheets.find(ws =>
      ws.name.toLowerCase().includes('cash flow') || ws.name.toLowerCase().includes('daily')
    );
  }
  if (!worksheet) {
    // Fall back to first sheet
    worksheet = workbook.worksheets[0];
  }
  if (!worksheet) throw new Error('No worksheet found in the Excel file');

  // Step 1: Find date header row and data columns
  // Scan first 15 rows to find one with Date values starting from column B
  let dateRowNum = -1;
  let forecastRowNum = -1;
  const maxScanRows = 15;

  for (let r = 1; r <= maxScanRows; r++) {
    const row = worksheet.getRow(r);
    const cellB = row.getCell(2);
    const val = cellB.value;
    // Check if it looks like a date
    if (val instanceof Date) {
      dateRowNum = r;
      break;
    }
    // Check for ACTUALS/FORECAST label
    const text = getCellText(row.getCell(2));
    if (/ACTUAL/i.test(text) || /FORECAST/i.test(text)) {
      forecastRowNum = r;
    }
  }

  // If no date row found by Date object, look for date strings
  if (dateRowNum === -1) {
    for (let r = 1; r <= maxScanRows; r++) {
      const row = worksheet.getRow(r);
      const cellB = row.getCell(2);
      const text = getCellText(cellB);
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(text) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text)) {
        dateRowNum = r;
        break;
      }
    }
  }

  if (dateRowNum === -1) {
    // Fallback: assume row 2 has dates
    dateRowNum = 2;
  }

  // Step 2: Extract dates from the date header row
  const dateRow = worksheet.getRow(dateRowNum);
  const dates: string[] = [];
  const dataStartCol = 2; // Column B
  let lastCol = worksheet.columnCount || 200;
  // Limit to reasonable column count
  if (lastCol > 500) lastCol = 500;

  for (let c = dataStartCol; c <= lastCol; c++) {
    const cell = dateRow.getCell(c);
    const val = cell.value;

    if (val instanceof Date) {
      const iso = val.toISOString().split('T')[0];
      dates.push(iso);
    } else if (typeof val === 'number' && val > 40000 && val < 50000) {
      // Excel serial date
      const d = new Date((val - 25569) * 86400000);
      dates.push(d.toISOString().split('T')[0]);
    } else if (val === null || val === undefined) {
      // Stop at first empty date cell after we've found some dates
      if (dates.length > 5) break;
    } else {
      const text = getCellText(cell);
      if (!text && dates.length > 5) break;
      // Try to parse as date
      const parsed = new Date(text);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2020) {
        dates.push(parsed.toISOString().split('T')[0]);
      } else if (dates.length > 5) {
        break;
      }
    }
  }

  if (dates.length === 0) throw new Error('Could not find date columns in the spreadsheet');

  const numCols = dates.length;

  // Step 3: Find forecast start index from ACTUALS/FORECAST row
  let forecastStartIndex: number | null = null;
  if (forecastRowNum > 0) {
    const fRow = worksheet.getRow(forecastRowNum);
    for (let c = dataStartCol; c < dataStartCol + numCols; c++) {
      const text = getCellText(fRow.getCell(c));
      if (/FORECAST/i.test(text)) {
        forecastStartIndex = c - dataStartCol;
        break;
      }
    }
  }

  // Step 4: Scan all data rows below the date header
  const dataStartRow = dateRowNum + 1;
  // If there's a forecast label row between date row and data, skip it
  const actualDataStart = forecastRowNum && forecastRowNum > dateRowNum ? forecastRowNum + 1 : dataStartRow;

  // We need to identify row sections by scanning labels in column A
  type SectionState = 'init' | 'balance_begin' | 'balance_end' | 'receipts' | 'disbursements' | 'transfers' | 'summary';
  let currentSection: SectionState = 'init';

  const rows: Record<string, { label: string; entity: string; values: number[] }> = {};
  const structureRows: DailyRowStructure['rows'] = [];
  let rowCounter = 15; // Start numbering from 15 to match existing structure

  const maxRows = worksheet.rowCount || 100;

  for (let r = actualDataStart; r <= Math.min(maxRows, actualDataStart + 80); r++) {
    const row = worksheet.getRow(r);
    const labelText = normalizeLabel(getCellText(row.getCell(1)));

    if (!labelText) continue; // Skip empty rows

    // Determine section from label
    if (/BEGINNING.*BANK.*BALANCE|BEGINNING.*CASH.*ON.*HAND/i.test(labelText)) {
      currentSection = 'balance_begin';
    } else if (/ENDING.*BANK.*BALANCE|ENDING.*CASH.*ON.*HAND/i.test(labelText)) {
      currentSection = 'balance_end';
    } else if (/CASH\s*RECEIPTS|\(\s*\+\s*\)\s*CASH/i.test(labelText)) {
      currentSection = 'receipts';
    } else if (/CASH\s*DISBURSEMENTS|\(\s*[\-–]\s*\)\s*CASH/i.test(labelText)) {
      currentSection = 'disbursements';
    } else if (/INTERNAL\s*TRANSFERS|\(\s*\+\s*\).*\(\s*[\-–]\s*\).*TRANSFER/i.test(labelText)) {
      currentSection = 'transfers';
    } else if (/NET\s*CASH\s*CHANGE/i.test(labelText)) {
      currentSection = 'summary';
    }

    if (currentSection === 'init') continue;

    // Determine row properties
    const isTotal = /^TOTAL|BEGINNING\s*BANK|ENDING\s*BANK|NET\s*CASH|ENDING\s*CASH/i.test(labelText)
      || /TOTAL\s*(CASH\s*)?RECEIPTS|TOTAL\s*(CASH\s*)?DISBURSEMENTS|TOTAL\s*TRANSFERS/i.test(labelText);
    const isSectionHeader = /\(\s*\+\s*\)\s*CASH\s*RECEIPTS|\(\s*[\-–]\s*\)\s*CASH\s*DISBURSEMENTS|\(\s*\+\s*\).*\(\s*[\-–]\s*\).*TRANSFER/i.test(labelText);

    if (isSectionHeader) continue; // Section headers are rendered by the UI, not as data rows

    const entity = extractEntity(labelText);
    const isProtected = isTotal;
    const indent = !isTotal;

    // Extract values for each date column
    const values: number[] = [];
    for (let c = dataStartCol; c < dataStartCol + numCols; c++) {
      values.push(getCellNumber(row.getCell(c)));
    }

    // Skip rows that are entirely zero/empty
    const hasData = values.some(v => v !== 0);
    if (!hasData && indent) continue;

    const rowKey = `row_${rowCounter}`;

    // Clean up label for display
    let displayLabel = labelText;
    // Remove entity suffix if present in label
    displayLabel = displayLabel.replace(/\s*-\s*(5LC|5LCA|5LFS|5LT)\s*$/i, '');
    // Remove "TOTAL" prefix duplication
    displayLabel = displayLabel.replace(/^TOTAL\s+CASH\s+/i, 'TOTAL ');

    rows[rowKey] = { label: displayLabel, entity, values };

    structureRows.push({
      row_num: rowCounter,
      label: displayLabel,
      entity,
      section: currentSection as any,
      is_total: isTotal,
      is_protected: isProtected,
      indent,
    });

    rowCounter++;
  }

  if (Object.keys(rows).length === 0) {
    throw new Error('No data rows found in the spreadsheet. Check that the sheet has the expected layout.');
  }

  return {
    dailyData: { dates, rows },
    rowStructure: { rows: structureRows },
    forecastStartIndex,
  };
}
