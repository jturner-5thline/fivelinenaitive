/**
 * Rep Performance & Pipeline Model - Sheet Data
 * Encoded from Book2.xlsx Google Sheets snapshot
 * Single source of truth for the initial grid state
 */

export interface CellData {
  rawValue: string | number | null;
  formattedValue: string;
  type: 'string' | 'number' | 'currency' | 'percent' | 'empty';
  bold?: boolean;
  italic?: boolean;
  headerBand?: boolean;
  formula?: boolean;
}

export interface SheetRow {
  cells: CellData[];
}

export interface SheetState {
  rows: SheetRow[];
  colCount: number;
  rowCount: number;
}

// Helper to create cells
function s(v: string, opts?: Partial<CellData>): CellData {
  return { rawValue: v, formattedValue: v, type: 'string', ...opts };
}
function n(v: number, fmt?: string, opts?: Partial<CellData>): CellData {
  return { rawValue: v, formattedValue: fmt ?? String(v), type: 'number', ...opts };
}
function c(v: number, fmt: string, opts?: Partial<CellData>): CellData {
  return { rawValue: v, formattedValue: fmt, type: 'currency', ...opts };
}
function p(v: number, fmt: string, opts?: Partial<CellData>): CellData {
  return { rawValue: v, formattedValue: fmt, type: 'percent', ...opts };
}
function e(): CellData {
  return { rawValue: null, formattedValue: '', type: 'empty' };
}

// Parse the sheet data from the parsed document
// We'll encode the key sections of the spreadsheet

// Column layout:
// A: Name/Label (col 0)
// B: TEAM (col 1)
// C-E: empty spacer (cols 2-4)
// F: Plan/Metric label (col 5)
// G-R: Jan 2025 - Dec 2025 (cols 6-17)
// S-AD: Jan 2026 - Dec 2026 (cols 18-29)
// AE-AP: Jan 2027 - Dec 2027 (cols 30-41)
// AQ: empty spacer (col 42)
// AR-AV: Q1-2025 through 2025 (cols 43-47)
// AW: empty spacer (col 48)
// AX-BB: Q1-2026 through 2026 (cols 49-53)
// BC: empty spacer (col 54)
// BD-BH: Q1-2027 through 2027 (cols 55-59)

const TOTAL_COLS = 60;

function emptyRow(): CellData[] {
  return Array(TOTAL_COLS).fill(null).map(() => e());
}

function makeRow(entries: [number, CellData][]): CellData[] {
  const row = emptyRow();
  for (const [col, cell] of entries) {
    if (col < TOTAL_COLS) row[col] = cell;
  }
  return row;
}

// Build header rows
const headerOpts = { bold: true, headerBand: true };
const italicOpts = { italic: true };

// Row 1: Year
const row1 = makeRow([
  [5, s('Year', headerOpts)],
  [6, s('2025', headerOpts)], [7, s('2025', headerOpts)], [8, s('2025', headerOpts)],
  [9, s('2025', headerOpts)], [10, s('2025', headerOpts)], [11, s('2025', headerOpts)],
  [12, s('2025', headerOpts)], [13, s('2025', headerOpts)], [14, s('2025', headerOpts)],
  [15, s('2025', headerOpts)], [16, s('2025', headerOpts)], [17, s('2025', headerOpts)],
  [18, s('2026', headerOpts)], [19, s('2026', headerOpts)], [20, s('2026', headerOpts)],
  [21, s('2026', headerOpts)], [22, s('2026', headerOpts)], [23, s('2026', headerOpts)],
  [24, s('2026', headerOpts)], [25, s('2026', headerOpts)], [26, s('2026', headerOpts)],
  [27, s('2026', headerOpts)], [28, s('2026', headerOpts)], [29, s('2026', headerOpts)],
  [30, s('2027', headerOpts)], [31, s('2027', headerOpts)], [32, s('2027', headerOpts)],
  [33, s('2027', headerOpts)], [34, s('2027', headerOpts)], [35, s('2027', headerOpts)],
  [36, s('2027', headerOpts)], [37, s('2027', headerOpts)], [38, s('2027', headerOpts)],
  [39, s('2027', headerOpts)], [40, s('2027', headerOpts)], [41, s('2027', headerOpts)],
]);

// Row 2: Quarter
const row2 = makeRow([
  [5, s('Quarter', headerOpts)],
  [6, s('Q1-2025', headerOpts)], [7, s('Q1-2025', headerOpts)], [8, s('Q1-2025', headerOpts)],
  [9, s('Q2-2025', headerOpts)], [10, s('Q2-2025', headerOpts)], [11, s('Q2-2025', headerOpts)],
  [12, s('Q3-2025', headerOpts)], [13, s('Q3-2025', headerOpts)], [14, s('Q3-2025', headerOpts)],
  [15, s('Q4-2025', headerOpts)], [16, s('Q4-2025', headerOpts)], [17, s('Q4-2025', headerOpts)],
  [18, s('Q1-2026', headerOpts)], [19, s('Q1-2026', headerOpts)], [20, s('Q1-2026', headerOpts)],
  [21, s('Q2-2026', headerOpts)], [22, s('Q2-2026', headerOpts)], [23, s('Q2-2026', headerOpts)],
  [24, s('Q3-2026', headerOpts)], [25, s('Q3-2026', headerOpts)], [26, s('Q3-2026', headerOpts)],
  [27, s('Q4-2026', headerOpts)], [28, s('Q4-2026', headerOpts)], [29, s('Q4-2026', headerOpts)],
  [30, s('Q1-2027', headerOpts)], [31, s('Q1-2027', headerOpts)], [32, s('Q1-2027', headerOpts)],
  [33, s('Q2-2027', headerOpts)], [34, s('Q2-2027', headerOpts)], [35, s('Q2-2027', headerOpts)],
  [36, s('Q3-2027', headerOpts)], [37, s('Q3-2027', headerOpts)], [38, s('Q3-2027', headerOpts)],
  [39, s('Q4-2027', headerOpts)], [40, s('Q4-2027', headerOpts)], [41, s('Q4-2027', headerOpts)],
]);

// Row 3: Actuals/Forecast
const row3Entries: [number, CellData][] = [];
for (let i = 6; i <= 18; i++) row3Entries.push([i, s('Actuals', italicOpts)]);
for (let i = 19; i <= 41; i++) row3Entries.push([i, s('Forecast', italicOpts)]);
const row3 = makeRow(row3Entries);

// Row 4: Select Latest Actuals Month
const row4 = makeRow([
  [0, s('Select Latest Actuals Month', headerOpts)],
  [1, s('Jan 2026')],
]);

// Row 5: Monthly header
const row5 = makeRow([
  [18, s('Monthly', { bold: true, headerBand: true })],
  [43, s('Quarterly', { bold: true, headerBand: true })],
]);

// Row 6: Last Updated
const row6 = makeRow([[0, s('Last Updated:')]]);

// Row 7: T3M Average Deal Signed
const t3mVals = ['$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$5.0MM','$5.7MM','$6.0MM','$4.3MM','$4.3MM','$4.3MM','$4.6MM',
  '$3.7MM','$2.9MM','$2.9MM','$3.0MM','$3.0MM','$3.0MM','$3.0MM','$3.0MM','$3.0MM','$3.0MM','$3.0MM','$3.0MM',
  '$4.0MM','$5.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM','$6.0MM'];
const row7Entries: [number, CellData][] = [[5, s('T3M Average Deal Signed', headerOpts)]];
t3mVals.forEach((v, i) => row7Entries.push([6 + i, c(0, v)]));
// Quarterly
const t3mQ = ['$.0MM','$5.0MM','$4.3MM','$4.6MM','','$2.9MM','$3.0MM','$3.0MM','$3.0MM'];
t3mQ.forEach((v, i) => { if (v) row7Entries.push([43 + i, c(0, v)]); });
const row7 = makeRow(row7Entries);

// Row 8: Name / TEAM header
const row8 = makeRow([
  [0, s('Name', headerOpts)],
  [1, s('TEAM', headerOpts)],
  [5, s('2025', headerOpts)],
]);

// Row 9: Plan header with month labels
const monthLabels2025 = ['Jan 2025','Feb 2025','Mar 2025','Apr 2025','May 2025','Jun 2025','Jul 2025','Aug 2025','Sep 2025','Oct 2025','Nov 2025','Dec 2025'];
const monthLabels2026 = ['Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026'];
const monthLabels2027 = ['Jan 2027','Feb 2027','Mar 2027','Apr 2027','May 2027','Jun 2027','Jul 2027','Aug 2027','Sep 2027','Oct 2027','Nov 2027','Dec 2027'];
const row9Entries: [number, CellData][] = [[5, s('Plan', headerOpts)]];
monthLabels2025.forEach((m, i) => row9Entries.push([6 + i, s(m, headerOpts)]));
monthLabels2026.forEach((m, i) => row9Entries.push([18 + i, s(m, headerOpts)]));
monthLabels2027.forEach((m, i) => row9Entries.push([30 + i, s(m, headerOpts)]));
// Quarterly headers
['Q1-2025','Q2-2025','Q3-2025','Q4-2025','2025'].forEach((q, i) => row9Entries.push([43 + i, s(q, headerOpts)]));
['Q1-2026','Q2-2026','Q3-2026','Q4-2026','2026'].forEach((q, i) => row9Entries.push([49 + i, s(q, headerOpts)]));
['Q1-2027','Q2-2027','Q3-2027','Q4-2027','2027'].forEach((q, i) => row9Entries.push([55 + i, s(q, headerOpts)]));
const row9 = makeRow(row9Entries);

// Helper for data rows
function dataRow(
  label: string, 
  labelCol: number,
  values: string[], 
  startCol: number, 
  type: CellData['type'] = 'string',
  opts?: Partial<CellData>,
  leftLabels?: [number, CellData][]
): CellData[] {
  const entries: [number, CellData][] = leftLabels ?? [];
  entries.push([labelCol, s(label, opts)]);
  values.forEach((v, i) => {
    if (v === '' || v === undefined) return;
    const cell: CellData = {
      rawValue: v,
      formattedValue: v,
      type: v.startsWith('$') ? 'currency' : v.endsWith('%') ? 'percent' : type,
      ...opts
    };
    entries.push([startCol + i, cell]);
  });
  return makeRow(entries);
}

// Build the metric rows
// Row 10: Time (Whole Months) / Deals on Board
const dealsOnBoard = ['0.0','0.0','10.0','9.0','9.0','19.0','9.0','9.0','23.0','9.0','6.0','19.0','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','11','0','0'];
const dealsOnBoardQ = ['10','37','41','34','122','','33','33','33','33','132','','33','33','33','11','110'];
const row10 = makeRow([
  [0, s('Time (Whole Months)')],
  [1, s('#')],
  [4, s('Deals on Board', { bold: true })],
  ...dealsOnBoard.map((v, i): [number, CellData] => [6 + i, n(parseFloat(v) || 0, v)]),
  ...['10','37','41','34','122'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['33','33','33','33','132'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['33','33','33','11','110'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 11: Email to Call / Dollars on Board
const dollarsOnBoard = ['$.0MM','$.0MM','$71.0MM','$60.6MM','$60.6MM','$131.6MM','$60.6MM','$60.6MM','$153.2MM','$60.6MM','$21.2MM','$97.6MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$30.3MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$60.6MM','$.0MM','$.0MM'];
const row11 = makeRow([
  [0, s('Email to Call')],
  [1, n(1, '1')],
  [4, s('Dollars on Board', { bold: true })],
  ...dollarsOnBoard.map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$71.0MM','$252.8MM','$274.4MM','$179.4MM','$777.6MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$90.9MM','$90.9MM','$90.9MM','$151.5MM','$424.2MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$181.8MM','$181.8MM','$181.8MM','$60.6MM','$606.1MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 12: On-Board to Proposal / Proposals Issued #
const proposalsIssued = ['0.0','0.0','4.0','0.0','6.0','10.0','6.0','6.0','15.0','6.0','6.0','12.0','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','7','0'];
const row12 = makeRow([
  [0, s('On-Board to Proposal')],
  [1, n(1, '1')],
  [4, s('Proposals Issued #', { bold: true })],
  ...proposalsIssued.map((v, i): [number, CellData] => [6 + i, n(parseFloat(v), v)]),
  ...['4','16','27','24','71'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['21','21','21','21','84'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['21','21','21','14','77'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 13: Proposal to Engage / Dollars Proposed
const dollarsProposed = ['$.0MM','$.0MM','$.0MM','$.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$14.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$40.0MM','$.0MM'];
const row13 = makeRow([
  [0, s('Proposal to Engage')],
  [1, n(1, '1')],
  [4, s('Dollars Proposed', { bold: true })],
  ...dollarsProposed.map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$.0MM','$80.0MM','$120.0MM','$94.0MM','$294.0MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$60.0MM','$60.0MM','$60.0MM','$80.0MM','$260.0MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$120.0MM','$120.0MM','$120.0MM','$80.0MM','$440.0MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 14: Terms to Funded / Clients Signed
const clientsSigned = ['0','0','1','0','0','4','3','3','8','3','3','7','3','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4'];
const row14 = makeRow([
  [0, s('Terms to Funded')],
  [1, n(2, '2')],
  [4, s('Clients Signed', { bold: true })],
  ...clientsSigned.map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['1','4','14','13','32'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['11','12','12','12','47'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['12','12','12','12','48'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 15: Engage to Terms Signed / Dollars Signed
const dollarsSigned = ['$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$20.0MM','$8.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM','$24.0MM'];
const row15 = makeRow([
  [0, s('Engage to Terms Signed')],
  [1, n(3, '3')],
  [4, s('Dollars Signed', { bold: true })],
  ...dollarsSigned.map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$.0MM','$20.0MM','$60.0MM','$60.0MM','$140.0MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$32.0MM','$36.0MM','$36.0MM','$36.0MM','$140.0MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$72.0MM','$72.0MM','$72.0MM','$72.0MM','$288.0MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 16: Engage to Terms Received / Clients Receiving Terms
const clientsReceivingTerms = ['0','0','0','0','0','0','0','2','2','2','2','2','4','4','4','3','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4'];
const row16 = makeRow([
  [0, s('Engage to Terms Received')],
  [1, n(2, '2')],
  [4, s('Clients Receiving Terms', { bold: true })],
  ...clientsReceivingTerms.map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['0','0','4','6','10'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['12','11','12','12','47'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['12','12','12','12','48'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 17: Terms Signed
const termsSigned = ['0','0','0','0','0','0','0','0','2','2','2','2','4','4','4','4','3','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4'];
const row17 = makeRow([
  [4, s('Terms Signed', { bold: true })],
  ...termsSigned.map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['0','0','2','6','8'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['12','11','12','12','47'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['12','12','12','12','48'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 18: Volume of Terms Signed
const volTermsSigned = ['$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$16.0MM','$16.0MM','$16.0MM','$16.0MM','$10.0MM','$10.0MM','$10.0MM','$10.0MM','$6.4MM','$11.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM'];
const row18 = makeRow([
  [4, s('Volume of Terms Signed', { bold: true })],
  ...volTermsSigned.map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$.0MM','$.0MM','$16.0MM','$48.0MM','$64.0MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$30.0MM','$27.4MM','$36.0MM','$36.0MM','$129.4MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$36.0MM','$36.0MM','$36.0MM','$36.0MM','$144.0MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 19: Deals Closed
const dealsClosed = ['0','0','3','0','0','3','0','0','3','0','2','5','2','2','2','4','4','4','4','3','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4','4'];
const row19 = makeRow([
  [4, s('Deals Closed', { bold: true })],
  ...dealsClosed.map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['3','3','3','7','16'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['6','12','11','12','41'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['12','12','12','12','48'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 20: Dollars Funded
const dollarsFunded = ['$.0MM','$.0MM','$.1MM','$.0MM','$.0MM','$.2MM','$.0MM','$.0MM','$.3MM','$.0MM','$16.0MM','$16.3MM','$8.0MM','$8.0MM','$8.0MM','$10.0MM','$10.4MM','$11.0MM','$12.0MM','$8.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM','$12.0MM'];
const row20 = makeRow([
  [4, s('Dollars Funded', { bold: true })],
  ...dollarsFunded.map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$.1MM','$.2MM','$.3MM','$32.3MM','$32.9MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$24.0MM','$31.4MM','$32.0MM','$36.0MM','$123.4MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$36.0MM','$36.0MM','$36.0MM','$36.0MM','$144.0MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 21: empty
const row21 = emptyRow();

// Row 22: Pipeline Snapshot header
const row22 = makeRow([[4, s('Pipeline Snapshot', { bold: true, headerBand: true })]]);

// Row 23: Deals In Development
const dealsInDev = ['','','','','','','','','','9','22','30','38','45','53','60','68','75','82','90','97','105','112','120','127','135','142','150','157','164','172','179','187','187','183',''];
const row23 = makeRow([
  [4, s('Deals In Development', { bold: true })],
  ...dealsInDev.map((v, i): [number, CellData] => v ? [6 + i, n(parseInt(v), v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
]);

// Row 24: Dollars in Development
const dollarsInDev = ['','','','','','','','','','$152.5MM','$199.4MM','$221.6MM','$239.8MM','$258.0MM','$276.2MM','$294.4MM','$312.5MM','$330.7MM','$348.9MM','$367.1MM','$385.3MM','$421.6MM','$470.0MM','$506.4MM','$542.7MM','$579.1MM','$615.4MM','$651.8MM','$688.2MM','$724.5MM','$760.9MM','$797.3MM','$833.6MM','$833.6MM','$809.6MM',''];
const row24 = makeRow([
  [4, s('Dollars in Development', { bold: true })],
  ...dollarsInDev.map((v, i): [number, CellData] => v ? [6 + i, c(0, v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
]);

// Row 25: Active Deals
const activeDeals = ['','','','','','','','','','9','12','12','13','14','14','16','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',''];
const row25 = makeRow([
  [4, s('Active Deals', { bold: true })],
  ...activeDeals.map((v, i): [number, CellData] => v ? [6 + i, n(parseInt(v), v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
]);

// Row 26: Active Deal Volume
const activeDealVol = ['','','','','','','','','','$64.0MM','$48.0MM','$38.0MM','$28.0MM','$18.0MM','$8.0MM','$1.6MM','$2.6MM','$2.6MM','$2.6MM','$2.6MM','$2.6MM','$2.6MM','$2.6MM','$14.6MM','$26.6MM','$38.6MM','$50.6MM','$62.6MM','$74.6MM','$86.6MM','$98.6MM','$110.6MM','$122.6MM','$134.6MM','$146.6MM',''];
const row26 = makeRow([
  [4, s('Active Deal Volume', { bold: true })],
  ...activeDealVol.map((v, i): [number, CellData] => v ? [6 + i, c(0, v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
]);

// Row 27: Deals in Diligence
const dealsInDiligence = ['','','','','','','','','','3','7','7','8','10','10','9','9','9','10','10','10','10','10','10','10','10','10','10','10','10','10','10','10','11','12','13'];
const row27 = makeRow([
  [4, s('Deals in Diligence', { bold: true })],
  ...dealsInDiligence.map((v, i): [number, CellData] => v ? [6 + i, n(parseInt(v), v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
]);

// Row 28: Dollars in Diligence
const dollarsInDiligence = ['','','','','','','','','','$18.7MM','$25.5MM','$26.8MM','$30.7MM','$32.7MM','$32.7MM','$28.7MM','$28.7MM','$28.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM','$32.7MM'];
const row28 = makeRow([
  [4, s('Dollars in Diligence', { bold: true })],
  ...dollarsInDiligence.map((v, i): [number, CellData] => v ? [6 + i, c(0, v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
]);

// Row 29: empty
const row29 = emptyRow();

// Revenue section
// Row 30: Probability header
const row30 = makeRow([
  [0, s('Probabilty', { bold: true })],
  [1, s('%', { bold: true })],
  [4, s('Retainer Revenue', { bold: true })],
  ...['$0','$0','$0','$0','$0','$31,000','$31,000','$31,000','$31,000','$31,000','$31,000','$31,000'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$7.3K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K','$14.5K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0.0K','$31.0K','$93.0K','$93.0K','$217.0K'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$36.3K','$43.5K','$43.5K','$43.5K','$166.8K'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$43.5K','$43.5K','$43.5K','$43.5K','$174.0K'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 31: Consulting / Milestone Revenue
const row31 = makeRow([
  [0, s('On-Board to Proposal')],
  [1, p(0.66, '66%')],
  [4, s('Consulting / Milestone Revenue', { bold: true })],
  ...['$0','$0','$0','$0','$0','$0','$0','$63,650','$63,650','$63,650','$63,650','$63,650'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$52.9K','$52.9K','$52.9K','$28.2K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K','$52.9K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$127.3K','$191.0K','$318.3K'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$158.7K','$134.0K','$158.7K','$158.7K','$610.1K'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$158.7K','$158.7K','$158.7K','$158.7K','$634.8K'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 32: Fee Revenue
const row32 = makeRow([
  [0, s('Proposal to Engage')],
  [1, p(0.60, '60%')],
  [4, s('Fee Revenue', { bold: true })],
  ...['$0','$0','$0','$0','$0','$0','$0','$0','$0','$0','$400,000','$400,000'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$200.0K','$200.0K','$200.0K','$240.0K','$250.0K','$265.0K','$290.0K','$190.0K','$290.0K','$290.0K','$290.0K','$290.0K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$290.0K','$290.0K','$222.6K','$222.6K','$222.6K','$222.6K','$222.6K','$222.6K','$222.6K','$222.6K','$222.6K','$222.6K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$0.0K','$800.0K','$800.0K'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$600.0K','$755.0K','$770.0K','$870.0K','$2995.0K'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$802.6K','$667.8K','$667.8K','$667.8K','$2806.0K'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 33: Total Revenue
const row33 = makeRow([
  [0, s('Engaged to Signed Terms')],
  [1, p(0.60, '60%')],
  [4, s('Total Revenue', { bold: true, headerBand: true })],
  ...['$0','$0','$0','$0','$0','$31,000','$31,000','$94,650','$94,650','$94,650','$494,650','$494,650'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$260.2K','$267.4K','$267.4K','$282.7K','$317.4K','$332.4K','$357.4K','$257.4K','$357.4K','$357.4K','$357.4K','$357.4K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$357.4K','$357.4K','$290.0K','$290.0K','$290.0K','$290.0K','$290.0K','$290.0K','$290.0K','$290.0K','$290.0K','$290.0K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0.0K','$31.0K','$220.3K','$1084.0K','$1335.3K'].map((v, i): [number, CellData] => [43 + i, c(0, v, { bold: true })]),
  ...['$.79MM','$.93MM','$.97MM','$1.07MM','$3.77MM'].map((v, i): [number, CellData] => [49 + i, c(0, v, { bold: true })]),
  ...['$1.00MM','$.87MM','$.87MM','$.87MM','$3.61MM'].map((v, i): [number, CellData] => [55 + i, c(0, v, { bold: true })]),
]);

// Row 34: empty
const row34 = emptyRow();

// Row 35: TTM Revenue
const row35 = makeRow([
  [0, s('Probabilty', { bold: true })],
  [1, s('%', { bold: true })],
  [4, s('TTM Revenue', { bold: true })],
  ...['-','$0','$0','$0','$0','$31,000','$62,000','$156,650','$251,300','$345,950','$840,600','$1,335,250'].map((v, i): [number, CellData] => [6 + i, v === '-' ? s('-') : c(0, v)]),
  ...['$1.60MM','$1.86MM','$2.13MM','$2.41MM','$2.73MM','$3.03MM','$3.36MM','$3.52MM','$3.78MM','$4.05MM','$3.91MM','$3.77MM'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$3.87MM','$3.96MM','$3.98MM','$3.99MM','$3.96MM','$3.92MM','$3.85MM','$3.88MM','$3.82MM','$3.75MM','$3.68MM','$3.61MM'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
]);

// Row 36: YTD Revenue
const row36 = makeRow([
  [0, s('On-Board to Proposal')],
  [1, p(0.66, '66%')],
  [4, s('YTD Revenue', { bold: true })],
  ...['-','$0','$0','$0','$0','$31,000','$62,000','$156,650','$251,300','$345,950','$840,600','$1,335,250'].map((v, i): [number, CellData] => [6 + i, v === '-' ? s('-') : c(0, v)]),
  ...['$.26MM','$.53MM','$.79MM','$1.08MM','$1.40MM','$1.73MM','$2.08MM','$2.34MM','$2.70MM','$3.06MM','$3.41MM','$3.77MM'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$4.13MM','$4.49MM','$4.78MM','$5.07MM','$5.36MM','$5.65MM','$5.94MM','$6.23MM','$6.52MM','$6.81MM','$7.10MM','$7.39MM'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
]);

// Row 37-38: Probabilities
const row37 = makeRow([
  [0, s('Proposal to Engage')],
  [1, p(0.50, '50%')],
]);
const row38 = makeRow([
  [0, s('Clients Receiving Terms')],
  [1, p(0.75, '75%')],
  [4, s('MSQL', { bold: true })],
  ...['0%','0%','459390%','241784%','36%','43%','46%','49%','55%','63%','65%','68%'].map((v, i): [number, CellData] => [6 + i, p(0, v)]),
  ...['68%','67%','67%','67%','64%','64%','64%','64%','64%','64%','64%','64%'].map((v, i): [number, CellData] => [18 + i, p(0, v)]),
  ...['64%','64%','64%','64%','64%','64%','64%','64%','64%','64%','76%','80%'].map((v, i): [number, CellData] => [30 + i, p(0, v)]),
]);

// Row 39-40
const row39 = makeRow([
  [0, s('Engaged to Terms Signed')],
  [1, p(0.50, '50%')],
]);
const row40 = makeRow([
  [0, s('Terms to Funded')],
  [1, p(0.90, '90%')],
  [4, s('Revenue Signed Up', { bold: true })],
  ...['$0','$0','$0','$0','$0','$600,000,000,000','$600,000,000,000','$600,000,000,000','$600,000,000,000','$600,000,000,000','$600,000,000,000','$600,000,000,000'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$180K','$270K','$270K','$270K','$270K','$270K','$270K','$270K','$270K','$270K','$270K','$270K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$540K','$540K','$540K','$540K','$540K','$540K','$540K','$540K','$540K','$540K','$540K','$540K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
]);

// Row 41: empty
const row41 = emptyRow();

// Rep Cost section
const row42 = makeRow([[4, s('Rep Cost', { bold: true, headerBand: true })]]);

// Row 43: Revenue & Cost / Salary
const salaryVals = ['$0','$0','$22,167','$37,583','$37,583','$37,583','$37,583','$38,833','$38,833','$38,833','$32,583','$32,583'];
const salaryVals2026 = ['$22,167','$22,167','$22,167','$23,333','$23,333','$23,333','$23,333','$23,333','$23,333','$23,333','$23,333','$23,333'];
const row43 = makeRow([
  [0, s('Revenue & Cost', { bold: true })],
  [4, s('Salary', { bold: true })],
  ...salaryVals.map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...salaryVals2026.map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$22,167','$112,750','$115,250','$104,000','$354,167','$0','$66,500','$70,000','$70,000','$70,000','$276,500'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$22,167','$112,750','$115,250','$104,000','$354,167'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$66,500','$70,000','$70,000','$70,000','$276,500'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$134,917','$573,417','$136,500','$416,500','$1,261,333'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 44: Burden Rate
const row44 = makeRow([
  [0, s('Retainer')],
  [1, c(15000, '$15,000')],
  [4, s('Burden Rate', { bold: true })],
  ...['$0','$0','$2,042','$4,740','$4,740','$4,740','$4,740','$4,958','$4,958','$4,958','$4,958','$4,958'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$2,042','$2,042','$2,042','$2,246','$2,246','$2,246','$2,246','$2,246','$2,246','$2,246','$2,246','$2,246'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$2,042','$14,219','$14,656','$14,875','$45,792','$0','$6,125','$6,738','$6,738','$6,738','$26,337'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$2,042','$14,219','$14,656','$14,875','$45,792'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$6,125','$6,738','$6,738','$6,738','$26,337'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$16,260','$75,323','$12,863','$39,813','$144,258'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 45: 401k
const row45 = makeRow([
  [0, s('Milestone Payments')],
  [1, c(30000, '$30,000')],
  [4, s('401k')],
  ...['$0','$0','$0','$0','$0','$900','$949','$1,008','$1,036','$1,064','$1,093','$930'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$767','$787','$808','$819','$829','$835','$835','$824','$814','$803','$792','$782'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$0','$900','$2,992','$3,087','$6,980','$0','$2,362','$2,482','$2,472','$2,377','$9,694'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0','$900','$2,992','$3,087','$6,980'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$2,362','$2,482','$2,472','$2,377','$9,694'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$900','$13,059','$4,844','$14,543','$33,347'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 46: T&E
const row46 = makeRow([
  [0, s('Closing Fee')],
  [1, p(0.023, '2.3%')],
  [4, s('T&E')],
  ...['$0','$0','$1,000','$2,500','$2,500','$2,500','$2,500','$2,500','$2,500','$2,500','$2,500','$2,500'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$1,000','$1,000','$1,000','$1,000','$1,000','$1,000','$1,000','$1,000','$1,000','$1,000','$1,000','$1,000'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$1,000','$7,500','$7,500','$7,500','$23,500','$0','$3,000','$3,000','$3,000','$3,000','$12,000'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$1,000','$7,500','$7,500','$7,500','$23,500'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$3,000','$3,000','$3,000','$3,000','$12,000'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$8,500','$38,500','$6,000','$18,000','$71,000'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 47: Commissions
const row47 = makeRow([
  [0, s('Deal Management Commission')],
  [1, p(0.05, '5.0%')],
  [4, s('Commissions')],
  ...['$0','$0','$0','$0','$0','$1,188','$1,188','$3,916','$3,916','$3,916','$21,416','$21,416'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$3,385','$3,385','$3,385','$5,385','$5,635','$6,010','$6,635','$6,635','$6,635','$6,635','$6,635','$6,635'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$0','$1,188','$9,020','$46,749','$56,956','$0','$10,155','$17,030','$19,905','$19,905','$66,995'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0','$1,188','$9,020','$46,749','$56,956'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$10,155','$17,030','$19,905','$19,905','$66,995'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$1,188','$112,725','$27,185','$106,805','$247,903'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 48: Bonus Pool
const row48 = makeRow([
  [4, s('Bonus Pool')],
  ...Array(36).fill('$0').map((v: string, i: number): [number, CellData] => [6 + i, c(0, v)]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 49: Total Rep Cost
const row49 = makeRow([
  [4, s('Total Rep Cost', { bold: true, headerBand: true })],
  ...['$0','$0','$25,208','$44,823','$44,823','$46,911','$46,959','$51,215','$51,244','$51,272','$62,551','$62,388'].map((v, i): [number, CellData] => [6 + i, c(0, v, { bold: true })]),
  ...['$29,360','$29,381','$29,402','$32,783','$33,043','$33,424','$34,049','$34,038','$34,028','$34,017','$34,007','$33,996'].map((v, i): [number, CellData] => [18 + i, c(0, v, { bold: true })]),
  ...['$0','$25,208','$136,557','$149,419','$176,211','$487,394','$0','$88,142','$99,250','$102,115','$102,020','$391,526'].map((v, i): [number, CellData] => [30 + i, c(0, v, { bold: true })]),
  ...['$25,208','$136,557','$149,419','$176,211','$487,394'].map((v, i): [number, CellData] => [43 + i, c(0, v, { bold: true })]),
  ...['$88,142','$99,250','$102,115','$102,020','$391,526'].map((v, i): [number, CellData] => [49 + i, c(0, v, { bold: true })]),
  ...['$161,765','$813,024','$187,392','$595,660','$1,757,841'].map((v, i): [number, CellData] => [55 + i, c(0, v, { bold: true })]),
]);

// Row 50-51: empty
const row50 = emptyRow();
const row51 = emptyRow();

// Row 52: Net Rep Profit
const row52 = makeRow([
  [4, s('Net Rep Profit', { bold: true, headerBand: true })],
  ...['$0','$0','-$25,208','-$44,823','-$44,823','-$15,911','-$15,959','$43,435','$43,406','$43,378','$432,099','$432,262'].map((v, i): [number, CellData] => [6 + i, c(0, v, { bold: true })]),
  ...['$106,040','$106,019','$105,998','$142,617','$152,357','$166,976','$191,351','$191,362','$191,372','$191,383','$191,394','$191,404'].map((v, i): [number, CellData] => [18 + i, c(0, v, { bold: true })]),
  ...['$0','-$25,208','-$105,557','$70,882','$907,739','$847,856','$0','$318,058','$461,950','$574,085','$574,181','$1,928,274'].map((v, i): [number, CellData] => [30 + i, c(0, v, { bold: true })]),
  ...['-25,208','-105,557','70,882','907,739','847,856'].map((v, i): [number, CellData] => [43 + i, c(0, v, { bold: true })]),
  ...['318,058','461,950','574,085','574,181','1,928,274'].map((v, i): [number, CellData] => [49 + i, c(0, v, { bold: true })]),
  ...['-130,765','1,826,476','780,008','3,076,540','5,552,259'].map((v, i): [number, CellData] => [55 + i, c(0, v, { bold: true })]),
]);

// Row 53-54: empty
const row53 = emptyRow();
const row54 = emptyRow();

// Row 55: All-Time Rep Revenue
const row55 = makeRow([
  [4, s('All-Time Rep Revenue', { bold: true })],
  ...['$0','$0','$0','$0','$0','$31,000','$62,000','$156,650','$251,300','$345,950','$840,600','$1,335,250'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$1,470,650','$1,606,050','$1,741,450','$1,916,850','$2,102,250','$2,302,650','$2,528,050','$2,753,450','$2,978,850','$3,204,250','$3,429,650','$3,655,050'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

// Row 56: All-Time Rep Cost
const row56 = makeRow([
  [4, s('All-Time Rep Cost', { bold: true })],
  ...['$0','$0','$25,208','$70,031','$114,854','$161,765','$208,724','$259,940','$311,183','$362,456','$425,007','$487,394'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$516,754','$546,135','$575,537','$608,319','$641,362','$674,786','$708,835','$742,873','$776,901','$810,918','$844,925','$878,920'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

// Row 57: All-Time Rep Profit
const row57 = makeRow([
  [4, s('All-Time Rep Profit', { bold: true })],
  ...['$0','$0','-$25,208','-$70,031','-$114,854','-$130,765','-$146,724','-$103,290','-$59,883','-$16,506','$415,593','$847,856'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$953,896','$1,059,915','$1,165,913','$1,308,531','$1,460,888','$1,627,864','$1,819,215','$2,010,577','$2,201,949','$2,393,332','$2,584,725','$2,776,130'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

// Row 58: All-Time Rep ROI (%)
const row58 = makeRow([
  [4, s('All-Time Rep ROI (%)', { bold: true })],
  ...['0.00%','0.00%','0.00%','0.00%','0.00%','-575.69%','-304.83%','-59.27%','3.13%','31.93%','112.78%','135.46%'].map((v, i): [number, CellData] => [6 + i, p(0, v)]),
  ...['-1973.19%','-919.31%','-566.71%','-24.98%','101.15%','157.97%','190.75%','212.02%','226.95%','238.02%','246.57%','253.36%'].map((v, i): [number, CellData] => [18 + i, p(0, v)]),
]);

// Row 59: All-Time Rep ROI Multiple
const row59 = makeRow([
  [4, s('All-Time Rep ROI Multiple', { bold: true })],
  ...['0.0','0.0','-3.0','-4.0','-4.0','-3.5','-3.2','-2.4','-1.9','-1.6','0.9','2.7'].map((v, i): [number, CellData] => [6 + i, n(parseFloat(v), v)]),
  ...['3.3','3.8','4.2','5.1','5.9','6.6','7.2','7.8','8.3','8.8','9.2','9.6'].map((v, i): [number, CellData] => [18 + i, n(parseFloat(v), v)]),
]);

// Row 60: empty
const row60 = emptyRow();

// Row 61-65: TTM section
const row61 = makeRow([
  [4, s('TTM Revenue', { bold: true })],
  ...['$-','$-','$-','$-','$-','$31,000','$62,000','$156,650','$251,300','$345,950','$840,600','$1,335,250'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$527,650','$663,050','$798,450','$973,850','$1,159,250','$1,345,150','$1,556,050','$1,748,800','$1,941,550','$2,134,300','$2,227,050','$2,319,800'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

const row62 = makeRow([
  [4, s('TTM Cost', { bold: true })],
  ...['$-','$-','$25,208','$70,031','$114,854','$161,765','$208,724','$259,940','$311,183','$362,456','$425,007','$487,394'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$516,754','$546,135','$550,328','$538,288','$526,508','$513,021','$500,111','$482,934','$465,718','$448,462','$419,918','$391,526'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

const row63 = makeRow([
  [4, s('TTM Rep Profit', { bold: true })],
  ...['$-','$-','$(25,208)','$(70,031)','$(114,854)','$(130,765)','$(146,724)','$(103,290)','$(59,883)','$(16,506)','$415,593','$847,856'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$10,896','$116,915','$248,122','$435,562','$632,742','$832,129','$1,055,939','$1,265,866','$1,475,832','$1,685,838','$1,807,132','$1,928,274'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

const row64 = makeRow([
  [4, s('TTM Rep ROI (%)', { bold: true })],
  ...['0%','0%','0%','0%','0%','-422%','-237%','-66%','-24%','-5%','49%','63%'].map((v, i): [number, CellData] => [6 + i, p(0, v)]),
  ...['2%','18%','31%','45%','55%','62%','68%','72%','76%','79%','81%','83%'].map((v, i): [number, CellData] => [18 + i, p(0, v)]),
]);

const row65 = makeRow([
  [4, s('TTM Rep ROI Multiple', { bold: true })],
  ...['','','-1.00','-1.00','-1.00','-0.81','-0.70','-0.40','-0.19','-0.05','0.98','1.74'].map((v, i): [number, CellData] => v ? [6 + i, n(parseFloat(v), v)] : [6 + i, e()]).filter(([, c]) => c.type !== 'empty') as [number, CellData][],
  ...['0.02','0.21','0.45','0.81','1.20','1.62','2.11','2.62','3.17','3.76','4.30','4.93'].map((v, i): [number, CellData] => [18 + i, n(parseFloat(v), v)]),
]);

// Row 66-67: empty
const row66 = emptyRow();
const row67 = emptyRow();

// Row 68: Projected Metrics header
const row68 = makeRow([
  [4, s('Projected Metrics >>>', { bold: true, headerBand: true })],
  ...Array(12).fill(null).map((_, i): [number, CellData] => [6 + i, s('Actuals', { italic: true, headerBand: true })]),
  [18, s('Actuals', { italic: true, headerBand: true })],
  ...Array(11).fill(null).map((_, i): [number, CellData] => [19 + i, s('Projected', { italic: true, headerBand: true })]),
  ...Array(12).fill(null).map((_, i): [number, CellData] => [30 + i, s('Projected', { italic: true, headerBand: true })]),
]);

// Row 69: empty
const row69 = emptyRow();

// Row 70: Actuals-Input header
const row70 = makeRow([[4, s('Actuals-Input', { bold: true, headerBand: true })]]);

// Row 71: Month headers (same as row 9)
const row71 = makeRow([
  ...monthLabels2025.map((m, i): [number, CellData] => [6 + i, s(m, headerOpts)]),
  ...monthLabels2026.map((m, i): [number, CellData] => [18 + i, s(m, headerOpts)]),
  ...monthLabels2027.map((m, i): [number, CellData] => [30 + i, s(m, headerOpts)]),
  ...['Q1-2025','Q2-2025','Q3-2025','Q4-2025','2025'].map((q, i): [number, CellData] => [43 + i, s(q, headerOpts)]),
  ...['Q1-2026','Q2-2026','Q3-2026','Q4-2026','2026'].map((q, i): [number, CellData] => [49 + i, s(q, headerOpts)]),
  ...['Q1-2027','Q2-2027','Q3-2027','Q4-2027','2027'].map((q, i): [number, CellData] => [55 + i, s(q, headerOpts)]),
]);

// Row 72: "adjust inputs to be full team actuals" / Deals on Board (actuals)
const row72 = makeRow([
  [0, s('adjust inputs to be full team actuals', { italic: true })],
  [4, s('Deals on Board', { bold: true })],
  ...['$0','1','3','6','8','11','2','4','3','11','5','2'].map((v, i): [number, CellData] => [6 + i, n(parseFloat(v.replace('$','')) || 0, v)]),
  ...['5','0','0','0','0','0','0','0','0','0','0','0'].map((v, i): [number, CellData] => [18 + i, n(parseInt(v), v)]),
  ...['0','4','25','9','18','56','0','1','0','0','0','1'].map((v, i): [number, CellData] => [30 + i, n(parseInt(v), v)]),
  ...['4','25','9','18','56'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['5','0','0','0','5'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['29','83','1','1','114'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 73: Dollars on Board (actuals)
const row73 = makeRow([
  [4, s('Dollars on Board', { bold: true })],
  ...['$.0MM','$10.0MM','$9.0MM','$42.0MM','$34.4MM','$140.0MM','$33.0MM','$20.5MM','$18.5MM','$74.0MM','$27.0MM','$4.6MM'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$61.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['0','19,000,000','216,400,000','72,000,000','105,600,000','413,000,000','0','15,000,000','0','0','0','15,000,000'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$19MM','$216MM','$72MM','$106MM','$413MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$61MM','$MM','$MM','$MM','$61MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$235MM','$591MM','$15MM','$15MM','$856MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 74: Proposals Issued # (actuals)
const row74 = makeRow([
  [4, s('Proposals Issued #', { bold: true })],
  ...['0','0','1','1','3','6','3','5','4','2','4','2'].map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['4','0','0','0','0','0','0','0','0','0','0','0'].map((v, i): [number, CellData] => [18 + i, n(parseInt(v), v)]),
  ...['0','1','10','12','8','31','0','2','0','0','0','2'].map((v, i): [number, CellData] => [30 + i, n(parseInt(v), v)]),
  ...['1','10','12','8','31'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['4','0','0','0','4'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['11','51','2','2','66'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 75: Dollars Proposed (actuals)
const row75 = makeRow([
  [4, s('Dollars Proposed', { bold: true })],
  ...['$.0MM','$.0MM','$11.0MM','$3.0MM','$32.0MM','$33.5MM','$79.0MM','$42.5MM','$22.5MM','$25.0MM','$83.5MM','$19.0MM'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$41.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$11,000,000','$68,500,000','$144,000,000','$127,500,000','$351,000,000','$0','$30,000,000','$0','$0','$0','$30,000,000'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$11MM','$69MM','$144MM','$128MM','$351MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$41MM','$MM','$MM','$MM','$41MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$80MM','$623MM','$30MM','$30MM','$762MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Row 76: Clients Signed (actuals)
const row76 = makeRow([
  [4, s('Clients Signed', { bold: true })],
  ...['0','0','0','0','3','1','2','2','5','1','2','1'].map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['3','0','0','0','0','0','0','0','0','0','0','0'].map((v, i): [number, CellData] => [18 + i, n(parseInt(v), v)]),
  ...['0','0','4','9','4','17','0','1','0','0','0','1'].map((v, i): [number, CellData] => [30 + i, n(parseInt(v), v)]),
  ...['0','4','9','4','17'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['3','0','0','0','3'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['4','30','1','1','36'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

// Row 77: Dollars Signed (actuals)
const row77 = makeRow([
  [4, s('Dollars Signed', { bold: true })],
  ...['$.0MM','$.0MM','$.0MM','$.0MM','$43.0MM','$5.5MM','$8.5MM','$12.0MM','$29.5MM','$5.0MM','$47.0MM','$3.0MM'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$26.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0','$0','$48,500,000','$50,000,000','$55,000,000','$153,500,000','$0','$15,000,000','$0','$0','$0','$15,000,000'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$MM','$49MM','$50MM','$55MM','$154MM'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$26MM','$MM','$MM','$MM','$26MM'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$49MM','$259MM','$15MM','$15MM','$337MM'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

// Rows 78-82: More actuals data
const row78 = makeRow([
  [4, s('Clients Receiving Terms', { bold: true })],
  ...['0','0','0','0','0','1','0','1','2','4','0','0'].map((v, i): [number, CellData] => [6 + i, n(parseInt(v), v)]),
  ...['1','0','0','0','0','0','0','0','0','0','0','0'].map((v, i): [number, CellData] => [18 + i, n(parseInt(v), v)]),
  ...['0','0','1','3','4','8','0','0','0','0','0','0'].map((v, i): [number, CellData] => [30 + i, n(parseInt(v), v)]),
  ...['0','1','3','4','8'].map((v, i): [number, CellData] => [43 + i, n(parseInt(v), v)]),
  ...['1','0','0','0','1'].map((v, i): [number, CellData] => [49 + i, n(parseInt(v), v)]),
  ...['1','15','0','0','16'].map((v, i): [number, CellData] => [55 + i, n(parseInt(v), v)]),
]);

const row79 = makeRow([
  [4, s('Deals Closed', { bold: true })],
  ...['0','0','0','0','0','0','0','0','0','0','0','0'].map((v, i): [number, CellData] => [6 + i, n(0, '0')]),
  ...['0','0','0','0','0','0','0','0','0','0','0','0'].map((v, i): [number, CellData] => [18 + i, n(0, '0')]),
  ...Array(12).fill(null).map((_, i): [number, CellData] => [30 + i, n(0, '0')]),
]);

const row80 = makeRow([
  [4, s('Dollars Funded', { bold: true })],
  ...['$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$3.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$3.5MM'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM','$.0MM'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
]);

// Row 81: empty
const row81 = emptyRow();

// Revenue actuals
const row82 = makeRow([
  [4, s('Retainer Revenue', { bold: true })],
  ...['$0.0K','$0.0K','$15.0K','$0.0K','$0.0K','$0.0K','$20.0K','$0.0K','$43.0K','$17.5K','$23.5K','$15.5K'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$0.0K','$63.0K','$56.5K','$119.5K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$15,000','$0','$63,000','$56,500','$134,500'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$0','$239,000','$0','$0','$239,000'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

const row83 = makeRow([
  [4, s('Consulting / Milestone Revenue', { bold: true })],
  ...['$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$31.5K','$0.0K','$0.0K','$0.0K','$15.0K','$45.0K','$0.0K'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$31.5K','$0.0K','$60.0K','$91.5K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0','$31,500','$0','$60,000','$91,500'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$31,500','$151,500','$0','$0','$183,000'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

const row84 = makeRow([
  [4, s('Fee Revenue', { bold: true })],
  ...['$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$6.0K','$0.0K','$0.0K','$0.0K','$0.0K','$92.5K'].map((v, i): [number, CellData] => [6 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [18 + i, c(0, v)]),
  ...['$0.0K','$0.0K','$0.0K','$6.0K','$92.5K','$98.5K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [30 + i, c(0, v)]),
  ...['$0','$0','$6,000','$92,500','$98,500'].map((v, i): [number, CellData] => [43 + i, c(0, v)]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [49 + i, c(0, v)]),
  ...['$0','$197,000','$0','$0','$197,000'].map((v, i): [number, CellData] => [55 + i, c(0, v)]),
]);

const row85 = makeRow([
  [4, s('Total Revenue', { bold: true, headerBand: true })],
  ...['$0.0K','$0.0K','$15.0K','$0.0K','$0.0K','$31.5K','$26.0K','$0.0K','$43.0K','$32.5K','$68.5K','$108.0K'].map((v, i): [number, CellData] => [6 + i, c(0, v, { bold: true })]),
  ...['$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [18 + i, c(0, v, { bold: true })]),
  ...['$0.0K','$0.0K','$31.5K','$69.0K','$209.0K','$309.5K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K','$0.0K'].map((v, i): [number, CellData] => [30 + i, c(0, v, { bold: true })]),
  ...['$15,000','$31,500','$69,000','$209,000','$324,500'].map((v, i): [number, CellData] => [43 + i, c(0, v, { bold: true })]),
  ...['$0','$0','$0','$0','$0'].map((v, i): [number, CellData] => [49 + i, c(0, v, { bold: true })]),
  ...['$31,500','$587,500','$0','$0','$619,000'].map((v, i): [number, CellData] => [55 + i, c(0, v, { bold: true })]),
]);

// Assemble all rows
const allRows: CellData[][] = [
  row1, row2, row3, row4, row5, row6, row7, row8, row9,
  row10, row11, row12, row13, row14, row15, row16, row17, row18, row19, row20,
  row21, row22, row23, row24, row25, row26, row27, row28,
  row29, row30, row31, row32, row33, row34, row35, row36, row37, row38, row39, row40,
  row41, row42, row43, row44, row45, row46, row47, row48, row49,
  row50, row51, row52, row53, row54, row55, row56, row57, row58, row59,
  row60, row61, row62, row63, row64, row65, row66, row67, row68, row69, row70, row71,
  row72, row73, row74, row75, row76, row77, row78, row79, row80, row81,
  row82, row83, row84, row85,
];

const COLS_TO_REMOVE = 4; // Remove columns A-D (indices 0-3)

export function getInitialSheetState(): SheetState {
  const adjustedRows = allRows.map(cells => {
    const newCells = cells.slice(COLS_TO_REMOVE);
    return { cells: newCells };
  });
  return {
    rows: adjustedRows,
    colCount: TOTAL_COLS - COLS_TO_REMOVE,
    rowCount: adjustedRows.length,
  };
}

export function getColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}
