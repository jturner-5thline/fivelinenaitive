import ExcelJS from 'exceljs';
import type { DailyData, DailyRowStructure } from './types';

const EXCEL_SERIAL_MIN = 40000;
const EXCEL_SERIAL_MAX = 50000;
const MS_PER_DAY = 86400000;

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

function getCellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (v instanceof Date) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return (v as any).richText.map((rt: any) => rt.text).join('').trim();
    if ('text' in v) return String((v as any).text ?? '').trim();
    if ('result' in v) return normalizeLabel(String((v as any).result ?? ''));
  }
  return String(v).trim();
}

function getCellNumberOrNull(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as any).result;
    if (r === null || r === undefined || r === '') return null;
    if (typeof r === 'number') return r;
    const text = String(r).trim();
    if (!text) return null;
    const neg = /^\(.*\)$/.test(text);
    const cleaned = text.replace(/[,$\s()]/g, '');
    if (!cleaned) return null;
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? null : (neg ? -parsed : parsed);
  }
  if (typeof v === 'string') {
    const text = v.trim();
    if (!text) return null;
    const neg = /^\(.*\)$/.test(text);
    const cleaned = text.replace(/[,$\s()]/g, '');
    if (!cleaned) return null;
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? null : (neg ? -parsed : parsed);
  }
  return null;
}

function excelSerialToDate(serialNumber: number): Date {
  return new Date((serialNumber - 25569) * MS_PER_DAY);
}

function normalizeDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateLike(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  if (typeof value === 'number' && value >= EXCEL_SERIAL_MIN && value <= EXCEL_SERIAL_MAX) {
    return normalizeDate(excelSerialToDate(value));
  }

  if (typeof value === 'object' && value && 'result' in value) {
    return parseDateLike((value as any).result);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 2020 && parsed.getUTCFullYear() <= 2035) {
      return normalizeDate(parsed);
    }
  }

  return null;
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDiff(previous: Date, current: Date): number {
  return Math.round((current.getTime() - previous.getTime()) / MS_PER_DAY);
}

function getWorksheetMaxCol(worksheet: ExcelJS.Worksheet): number {
  let maxCol = Math.max(worksheet.actualColumnCount || 0, worksheet.columnCount || 0);
  const rowsToScan = Math.min(worksheet.rowCount || 60, 60);

  for (let r = 1; r <= rowsToScan; r++) {
    const row = worksheet.getRow(r);
    maxCol = Math.max(maxCol, row.actualCellCount || 0, row.cellCount || 0);
  }

  return Math.min(Math.max(maxCol, 1), 1000);
}

function getCombinedRowLabel(row: ExcelJS.Row, firstDateCol: number): string {
  const parts: string[] = [];

  for (let c = 1; c < firstDateCol; c++) {
    const text = normalizeLabel(getCellText(row.getCell(c)));
    if (text) parts.push(text);
  }

  if (parts.length === 0) return '';

  let label = parts.join(' ');
  label = label.replace(/\s+\|\s+/g, ' | ');
  label = label.replace(/^(Customer Payments?)\s+(5LC|5LCA|5LFS|5LT)$/i, '$1 - $2');
  label = label.replace(/^(Loan Proceeds)\s+(5LC|5LCA|5LFS|5LT)$/i, '$1 - $2');
  return normalizeLabel(label);
}

function isWeekNumberRow(row: ExcelJS.Row, firstDateCol: number, lastDateCol: number, label: string): boolean {
  if (/^week$/i.test(label) || /^week number/i.test(label)) return true;

  let integerCount = 0;
  let checkedCount = 0;
  for (let c = firstDateCol; c <= Math.min(lastDateCol, firstDateCol + 20); c++) {
    const value = getCellNumberOrNull(row.getCell(c));
    if (value === null) continue;
    checkedCount += 1;
    if (Number.isInteger(value) && value >= 1 && value <= 53) integerCount += 1;
  }

  return checkedCount >= 5 && integerCount === checkedCount;
}

function isActualsForecastRow(row: ExcelJS.Row, firstDateCol: number, lastDateCol: number): boolean {
  let labelCount = 0;
  for (let c = firstDateCol; c <= Math.min(lastDateCol, firstDateCol + 40); c++) {
    const text = getCellText(row.getCell(c)).toUpperCase();
    if (text.includes('ACTUAL') || text.includes('FORECAST')) labelCount += 1;
  }
  return labelCount >= 3;
}

function findDateHeaderRow(worksheet: ExcelJS.Worksheet, maxScanRows: number, maxCol: number) {
  let bestRow = -1;
  let bestCount = 0;

  for (let r = 1; r <= maxScanRows; r++) {
    const row = worksheet.getRow(r);
    let count = 0;
    for (let c = 1; c <= maxCol; c++) {
      if (parseDateLike(row.getCell(c).value)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestRow = r;
    }
  }

  return bestRow;
}

/** Collect ALL date columns from the header row, skipping non-date columns (YTD Total etc.) */
function collectDateColumns(worksheet: ExcelJS.Worksheet, dateRowNum: number, maxCol: number): { col: number; date: Date }[] {
  const result: { col: number; date: Date }[] = [];
  const row = worksheet.getRow(dateRowNum);

  for (let c = 1; c <= maxCol; c++) {
    const parsed = parseDateLike(row.getCell(c).value);
    if (parsed) {
      result.push({ col: c, date: parsed });
    }
    // Non-date columns (YTD Total, blanks, text) are simply skipped
  }

  // Sort by date to ensure chronological order
  result.sort((a, b) => a.date.getTime() - b.date.getTime());
  return result;
}

export async function parseCashFlowExcel(file: File): Promise<{
  dailyData: DailyData;
  rowStructure: DailyRowStructure;
  forecastStartIndex: number | null;
  diagnostics: {
    worksheetName: string;
    dateColumnCount: number;
    dataRowCount: number;
    importedValueCount: number;
    firstDate: string;
    lastDate: string;
    firstDataRow: number;
    lastDataRow: number;
    firstDateCol: number;
    lastDateCol: number;
  };
}> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  let worksheet = workbook.getWorksheet('Cash Flow Weekly');
  if (!worksheet) {
    worksheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes('cash flow'));
  }
  if (!worksheet) worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('No worksheet found in the Excel file');

  const maxScanRows = Math.min(30, worksheet.rowCount || 30);
  const maxCol = getWorksheetMaxCol(worksheet);
  const dateRowNum = findDateHeaderRow(worksheet, maxScanRows, maxCol);

  if (dateRowNum === -1) {
    throw new Error('Could not find the daily date header row with sequential dates.');
  }

  const dateColumns = collectDateColumns(worksheet, dateRowNum, maxCol);
  if (dateColumns.length < 10) {
    throw new Error('Could not extract the daily date columns from the spreadsheet.');
  }

  const firstDateCol = dateColumns[0].col;
  const lastDateCol = dateColumns[dateColumns.length - 1].col;
  const dates: string[] = dateColumns.map(dc => toDateKey(dc.date));
  // Map from sequential index to actual spreadsheet column
  const dateColMap: number[] = dateColumns.map(dc => dc.col);

  let forecastStartIndex: number | null = null;
  for (let r = Math.max(1, dateRowNum - 3); r <= dateRowNum + 1; r++) {
    const row = worksheet.getRow(r);
    for (let c = firstDateCol; c <= lastDateCol; c++) {
      const text = getCellText(row.getCell(c)).toUpperCase();
      if (text.includes('FORECAST')) {
        // Find which dateColMap index this column corresponds to
        const idx = dateColMap.indexOf(c);
        if (idx >= 0) { forecastStartIndex = idx; break; }
        // If exact col not in map, find first date col >= c
        const nearIdx = dateColMap.findIndex(col => col >= c);
        if (nearIdx >= 0) { forecastStartIndex = nearIdx; break; }
      }
    }
    if (forecastStartIndex !== null) break;
  }

  let firstDataRow = -1;
  for (let r = dateRowNum + 1; r <= Math.min((worksheet.rowCount || dateRowNum + 80), dateRowNum + 40); r++) {
    const label = getCombinedRowLabel(worksheet.getRow(r), firstDateCol);
    if (/BEGINNING.*BANK.*BALANCE|BEGINNING.*CASH.*ON.*HAND|^BEGINNING/i.test(label)) {
      firstDataRow = r;
      break;
    }
  }

  if (firstDataRow === -1) {
    throw new Error('Could not find the BEGINNING BANK BALANCE row after the date headers.');
  }

  let lastDataRow = -1;
  for (let r = firstDataRow; r <= (worksheet.rowCount || firstDataRow + 120); r++) {
    const label = getCombinedRowLabel(worksheet.getRow(r), firstDateCol);
    if (/NET\s*CASH\s*CHANGE/i.test(label)) {
      lastDataRow = r;
      break;
    }
  }

  if (lastDataRow === -1) {
    throw new Error('Could not find the NET CASH CHANGE row to determine the end of the daily section.');
  }

  type SectionState = 'init' | 'balance_begin' | 'balance_end' | 'receipts' | 'disbursements' | 'transfers' | 'summary';

  const rows: Record<string, { label: string; entity: string; values: number[] }> = {};
  const structureRows: DailyRowStructure['rows'] = [];
  let currentSection: SectionState = 'init';
  let rowCounter = 15;

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const row = worksheet.getRow(r);
    const labelText = getCombinedRowLabel(row, firstDateCol);

    if (!labelText) continue;
    if (isActualsForecastRow(row, firstDateCol, lastDateCol)) continue;
    if (isWeekNumberRow(row, firstDateCol, lastDateCol, labelText)) continue;
    if (/YTD\s*TOTAL/i.test(labelText)) continue; // skip YTD rows, don't break

    if (/BEGINNING.*BANK.*BALANCE|BEGINNING.*CASH.*ON.*HAND|^BEGINNING/i.test(labelText)) {
      currentSection = 'balance_begin';
    } else if (/ENDING.*BANK.*BALANCE|ENDING.*CASH.*ON.*HAND|^ENDING/i.test(labelText)) {
      currentSection = 'balance_end';
    } else if (/\(\s*\+\s*\)\s*CASH\s*RECEIPTS|TOTAL\s*CASH\s*RECEIPTS|CASH\s*RECEIPTS/i.test(labelText)) {
      currentSection = 'receipts';
    } else if (/\(\s*[-–]\s*\)\s*CASH\s*DISBURSEMENTS|TOTAL\s*DISBURSEMENTS|CASH\s*DISBURSEMENTS/i.test(labelText)) {
      currentSection = 'disbursements';
    } else if (/INTERNAL\s*TRANSFERS?/i.test(labelText)) {
      currentSection = 'transfers';
    } else if (/NET\s*CASH\s*CHANGE/i.test(labelText)) {
      currentSection = 'summary';
    }

    if (currentSection === 'init') continue;

    const values: number[] = [];
    let hasAnyNumericValues = false;
    for (let i = 0; i < dateColMap.length; i++) {
      const numericValue = getCellNumberOrNull(row.getCell(dateColMap[i]));
      if (numericValue !== null) hasAnyNumericValues = true;
      values.push(numericValue ?? 0);
    }

    const isSectionHeader = /^\(\s*\+\s*\)\s*CASH\s*RECEIPTS$/i.test(labelText)
      || /^\(\s*[-–]\s*\)\s*CASH\s*DISBURSEMENTS$/i.test(labelText)
      || /^\(\s*\+\s*\)\s*\/\s*\(\s*[-–]\s*\)\s*INTERNAL\s*TRANSFERS?$/i.test(labelText);

    if (isSectionHeader && !hasAnyNumericValues) continue;

    const isTotal = /BEGINNING\s*BANK\s*BALANCE|ENDING\s*BANK\s*BALANCE|TOTAL\s*CASH\s*RECEIPTS|TOTAL\s*RECEIPTS|TOTAL\s*DISBURSEMENTS|NET\s*CASH\s*CHANGE/i.test(labelText);
    const entity = extractEntity(labelText);
    const rowKey = `row_${rowCounter}`;

    rows[rowKey] = {
      label: labelText,
      entity,
      values,
    };

    structureRows.push({
      row_num: rowCounter,
      label: labelText,
      entity,
      section: currentSection,
      is_total: isTotal,
      is_protected: isTotal,
      indent: !isTotal && currentSection !== 'summary',
    });

    rowCounter += 1;
  }

  if (Object.keys(rows || {}).length === 0) {
    throw new Error(
      `No data rows found in the spreadsheet. Date row ${dateRowNum}, daily columns ${firstDateCol}-${lastDateCol}, first data row ${firstDataRow}, last data row ${lastDataRow}.`
    );
  }

  const diagnostics = {
    worksheetName: worksheet.name,
    dateColumnCount: dates.length,
    dataRowCount: structureRows.length,
    importedValueCount: dates.length * structureRows.length,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    firstDataRow,
    lastDataRow,
    firstDateCol,
    lastDateCol,
  };

  console.info('Cash flow parser result', diagnostics);

  const jan1Index = dates.indexOf('2025-01-01');
  if (jan1Index >= 0) {
    const beginCashRow = Object.values(rows || {}).find((row) => /BEGINNING.*BANK.*BALANCE|BEGINNING.*CASH.*ON.*HAND/i.test(row.label));
    if (beginCashRow && beginCashRow.values[jan1Index] === 0) {
      throw new Error('The parser found the daily date columns, but the Jan 1 2025 beginning cash value came through as 0. Check the sheet layout and header detection.');
    }
  }

  return {
    dailyData: { dates, rows },
    rowStructure: { rows: structureRows },
    forecastStartIndex,
    diagnostics,
  };
}
