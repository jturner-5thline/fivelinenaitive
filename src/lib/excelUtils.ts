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
          // Handle rich text, formulas, etc.
          if ('result' in value) {
            // Formula result
            const result = value.result;
            if (typeof result === 'number') {
              rowData.push(result);
            } else if (result !== undefined && result !== null) {
              rowData.push(String(result));
            } else {
              rowData.push(null);
            }
          } else if ('richText' in value) {
            // Rich text
            rowData.push(value.richText.map((rt: { text: string }) => rt.text).join(''));
          } else if ('text' in value) {
            // Hyperlink or other object with text
            rowData.push(String(value.text));
          } else if (value instanceof Date) {
            rowData.push(value.toLocaleDateString());
          } else {
            rowData.push(String(value));
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
