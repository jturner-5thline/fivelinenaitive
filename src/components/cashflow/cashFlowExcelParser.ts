import ExcelJS from 'exceljs';
import type { DailyData, DailyRowStructure } from './types';

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

function isDateValue(val: any): Date | null {
  if (val instanceof Date) return val;
  if (typeof val === 'number' && val > 40000 && val < 55000) {
    // Excel serial date
    return new Date((val - 25569) * 86400000);
  }
  if (typeof val === 'string') {
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2030) {
      return parsed;
    }
  }
  return null;
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
    worksheet = workbook.worksheets.find(ws =>
      ws.name.toLowerCase().includes('cash flow') || ws.name.toLowerCase().includes('daily')
    );
  }
  if (!worksheet) worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('No worksheet found in the Excel file');

  const maxScanRows = 25;
  const maxCol = Math.min(worksheet.columnCount || 500, 500);

  // ── STEP 1: Find the date header row ──
  // The date header row has MANY consecutive date values across columns.
  // Row 5 might have a single date (last update) — we need the row with many dates.
  let dateRowNum = -1;
  let bestDateCount = 0;

  for (let r = 1; r <= maxScanRows; r++) {
    const row = worksheet.getRow(r);
    let dateCount = 0;
    // Sample columns 2..min(50, maxCol) to count dates
    const sampleEnd = Math.min(50, maxCol);
    for (let c = 2; c <= sampleEnd; c++) {
      const val = row.getCell(c).value;
      if (isDateValue(val)) dateCount++;
    }
    // The date header row should have many dates (>10)
    if (dateCount > bestDateCount && dateCount >= 5) {
      bestDateCount = dateCount;
      dateRowNum = r;
    }
  }

  if (dateRowNum === -1) {
    throw new Error('Could not find the date header row. Expected a row with many date values.');
  }

  // ── STEP 2: Determine label column ──
  // Check if column A or B has the row labels by looking a few rows after dateRowNum
  let labelCol = 1; // default column A
  for (let r = dateRowNum + 1; r <= dateRowNum + 5; r++) {
    const row = worksheet.getRow(r);
    const a = getCellText(row.getCell(1));
    const b = getCellText(row.getCell(2));
    if (/BEGINNING|ENDING|CASH|BALANCE/i.test(a)) { labelCol = 1; break; }
    if (/BEGINNING|ENDING|CASH|BALANCE/i.test(b)) { labelCol = 2; break; }
  }
  const dataStartCol = labelCol === 1 ? 2 : 3; // Data columns start after the label column

  // ── STEP 3: Extract dates ──
  const dateRow = worksheet.getRow(dateRowNum);
  const dates: string[] = [];

  for (let c = dataStartCol; c <= maxCol; c++) {
    const val = dateRow.getCell(c).value;
    const d = isDateValue(val);
    if (d) {
      dates.push(d.toISOString().split('T')[0]);
    } else if (dates.length > 5) {
      // Stop at first non-date cell after collecting dates
      break;
    }
  }

  if (dates.length === 0) throw new Error('Could not extract dates from the date header row.');

  const numCols = dates.length;

  // ── STEP 4: Find ACTUALS/FORECAST row (should be above dateRowNum) ──
  let forecastRowNum = -1;
  for (let r = 1; r < dateRowNum; r++) {
    const row = worksheet.getRow(r);
    let hasActual = false;
    let hasForecast = false;
    for (let c = dataStartCol; c <= Math.min(dataStartCol + 30, maxCol); c++) {
      const text = getCellText(row.getCell(c)).toUpperCase();
      if (text.includes('ACTUAL')) hasActual = true;
      if (text.includes('FORECAST')) hasForecast = true;
    }
    if (hasActual || hasForecast) {
      forecastRowNum = r;
      break;
    }
  }

  let forecastStartIndex: number | null = null;
  if (forecastRowNum > 0) {
    const fRow = worksheet.getRow(forecastRowNum);
    for (let c = dataStartCol; c < dataStartCol + numCols; c++) {
      const text = getCellText(fRow.getCell(c)).toUpperCase();
      if (text.includes('FORECAST')) {
        forecastStartIndex = c - dataStartCol;
        break;
      }
    }
  }

  // ── STEP 5: Find the first data row (search for "BEGINNING") ──
  let firstDataRow = -1;
  for (let r = dateRowNum + 1; r <= dateRowNum + 10; r++) {
    const row = worksheet.getRow(r);
    const label = normalizeLabel(getCellText(row.getCell(labelCol)));
    if (/BEGINNING/i.test(label)) {
      firstDataRow = r;
      break;
    }
  }

  if (firstDataRow === -1) {
    // Fallback: start 2 rows after dateRowNum (skip week number row)
    firstDataRow = dateRowNum + 2;
  }

  // ── STEP 6: Parse data rows ──
  type SectionState = 'init' | 'balance_begin' | 'balance_end' | 'receipts' | 'disbursements' | 'transfers' | 'summary';
  let currentSection: SectionState = 'init';

  const rows: Record<string, { label: string; entity: string; values: number[] }> = {};
  const structureRows: DailyRowStructure['rows'] = [];
  let rowCounter = 15;

  const maxDataRows = Math.min(worksheet.rowCount || 200, firstDataRow + 100);

  for (let r = firstDataRow; r <= maxDataRows; r++) {
    const row = worksheet.getRow(r);
    const labelText = normalizeLabel(getCellText(row.getCell(labelCol)));

    if (!labelText) continue;

    // Update section state based on label
    if (/BEGINNING.*BANK.*BALANCE|BEGINNING.*CASH/i.test(labelText)) {
      currentSection = 'balance_begin';
    } else if (/ENDING.*BANK.*BALANCE|ENDING.*CASH.*ON.*HAND/i.test(labelText)) {
      currentSection = 'balance_end';
    } else if (/\(\s*\+\s*\)\s*CASH\s*RECEIPTS|CASH\s*RECEIPTS/i.test(labelText)) {
      currentSection = 'receipts';
    } else if (/\(\s*[-–]\s*\)\s*CASH\s*DISBURSEMENTS|CASH\s*DISBURSEMENTS/i.test(labelText)) {
      currentSection = 'disbursements';
    } else if (/INTERNAL\s*TRANSFERS|\(\s*\+\s*\).*\(\s*[-–]\s*\).*TRANSFER/i.test(labelText)) {
      currentSection = 'transfers';
    } else if (/NET\s*CASH\s*CHANGE/i.test(labelText)) {
      currentSection = 'summary';
    }

    if (currentSection === 'init') continue;

    // Identify totals and section headers
    const isTotal = /^TOTAL|BEGINNING\s*BANK|ENDING\s*BANK|NET\s*CASH|ENDING\s*CASH/i.test(labelText)
      || /TOTAL\s*(CASH\s*)?RECEIPTS|TOTAL\s*(CASH\s*)?DISBURSEMENTS|TOTAL\s*TRANSFERS/i.test(labelText);
    const isSectionHeader = /^\(\s*\+\s*\)\s*CASH\s*RECEIPTS$|^\(\s*[-–]\s*\)\s*CASH\s*DISBURSEMENTS$|^\(\s*\+\s*\).*\(\s*[-–]\s*\).*TRANSFER/i.test(labelText);

    if (isSectionHeader) continue;

    const entity = extractEntity(labelText);
    const isProtected = isTotal;
    const indent = !isTotal;

    // Extract values
    const values: number[] = [];
    for (let c = dataStartCol; c < dataStartCol + numCols; c++) {
      values.push(getCellNumber(row.getCell(c)));
    }

    // Skip all-zero detail rows
    const hasData = values.some(v => v !== 0);
    if (!hasData && indent) continue;

    const rowKey = `row_${rowCounter}`;

    // Clean up label
    let displayLabel = labelText;
    displayLabel = displayLabel.replace(/\s*[-–]\s*(5LC|5LCA|5LFS|5LT)\s*$/i, '');
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
    throw new Error(
      `No data rows found. Detected date row at row ${dateRowNum} with ${dates.length} dates. ` +
      `First data row search started at row ${firstDataRow}. Label column: ${labelCol}. ` +
      `Check the sheet layout matches expected format.`
    );
  }

  return {
    dailyData: { dates, rows },
    rowStructure: { rows: structureRows },
    forecastStartIndex,
  };
}
