import ExcelJS from 'exceljs';

export interface ParsedSheet {
  name: string;
  data: (string | number | null)[][];
  colWidths: number[];
}

export interface ParsedExcelResult {
  sheets: ParsedSheet[];
  workbook: ExcelJS.Workbook;
}

/**
 * Parse an Excel file from an ArrayBuffer
 */
export async function parseExcelFromBuffer(buffer: ArrayBuffer): Promise<ParsedExcelResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheets: ParsedSheet[] = [];
  
  workbook.worksheets.forEach((worksheet) => {
    const data: (string | number | null)[][] = [];
    let maxCols = 0;
    
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rowData: (string | number | null)[] = [];
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Ensure we have enough slots for this column
        while (rowData.length < colNumber - 1) {
          rowData.push(null);
        }
        
        // Get cell value
        const value = cell.value;
        if (value === null || value === undefined) {
          rowData.push(null);
        } else if (typeof value === 'object') {
          // Handle rich text, formulas, errors, hyperlinks, dates, etc.
          if (value instanceof Date) {
            rowData.push(value.toLocaleDateString());
          } else if ('result' in value) {
            // Formula cell — extract the resolved result
            const result = (value as any).result;
            if (result === null || result === undefined) {
              rowData.push(null);
            } else if (typeof result === 'object') {
              // Nested object result (e.g. error objects, rich text in formula)
              if ('richText' in result) {
                rowData.push((result as any).richText.map((rt: { text: string }) => rt.text).join(''));
              } else if ('text' in result) {
                rowData.push(String((result as any).text));
              } else {
                rowData.push(null);
              }
            } else if (typeof result === 'number') {
              rowData.push(result);
            } else {
              rowData.push(String(result));
            }
          } else if ('richText' in value) {
            rowData.push((value as any).richText.map((rt: { text: string }) => rt.text).join(''));
          } else if ('text' in value) {
            // Hyperlink or other object with text
            rowData.push(String((value as any).text));
          } else if ('error' in value) {
            rowData.push(String((value as any).error));
          } else {
            // Unknown object shape — try to extract any reasonable value
            const v = (value as any).v ?? (value as any).value ?? (value as any).w;
            if (v !== undefined && v !== null) {
              rowData.push(typeof v === 'number' ? v : String(v));
            } else {
              rowData.push(null);
            }
          }
        } else if (typeof value === 'number') {
          rowData.push(value);
        } else if (typeof value === 'boolean') {
          rowData.push(value ? 'TRUE' : 'FALSE');
        } else {
          rowData.push(String(value));
        }
        
        maxCols = Math.max(maxCols, colNumber);
      });
      
      // Ensure row index alignment (rows are 1-indexed in ExcelJS)
      while (data.length < rowNumber - 1) {
        data.push([]);
      }
      data.push(rowData);
    });
    
    // Calculate column widths based on content
    const colWidths = Array(maxCols).fill(100);
    data.forEach(row => {
      row.forEach((cell, colIndex) => {
        if (cell !== null) {
          const cellLength = String(cell).length;
          colWidths[colIndex] = Math.max(colWidths[colIndex], Math.min(cellLength * 8 + 20, 300));
        }
      });
    });
    
    sheets.push({
      name: worksheet.name,
      data,
      colWidths,
    });
  });
  
  return { sheets, workbook };
}

/**
 * Parse an Excel file from a URL
 */
export async function parseExcelFromUrl(url: string): Promise<ParsedExcelResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch file');
  const arrayBuffer = await response.arrayBuffer();
  return parseExcelFromBuffer(arrayBuffer);
}

/**
 * Parse an Excel file from a File object
 */
export async function parseExcelFromFile(file: File): Promise<ParsedExcelResult> {
  const arrayBuffer = await file.arrayBuffer();
  return parseExcelFromBuffer(arrayBuffer);
}

/**
 * Convert sheet data back to a workbook for saving/export
 */
export function createWorkbookFromSheets(sheets: ParsedSheet[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  
  sheets.forEach(sheet => {
    const worksheet = workbook.addWorksheet(sheet.name);
    
    sheet.data.forEach((row, rowIndex) => {
      const excelRow = worksheet.getRow(rowIndex + 1);
      row.forEach((cell, colIndex) => {
        excelRow.getCell(colIndex + 1).value = cell;
      });
      excelRow.commit();
    });
  });
  
  return workbook;
}

/**
 * Export workbook to ArrayBuffer
 */
export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

/**
 * Export workbook to Blob
 */
export async function workbookToBlob(workbook: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await workbookToBuffer(workbook);
  return new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
}
