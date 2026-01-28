import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

export interface ParsedSheet {
  name: string;
  data: (string | number | null)[][];
  colWidths: number[];
}

export interface ParsedExcelModel {
  fileName: string;
  sheets: ParsedSheet[];
  rawWorkbook: XLSX.WorkBook | null;
}

export function useExcelModelParser() {
  const [parsedModel, setParsedModel] = useState<ParsedExcelModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseExcelFromUrl = useCallback(async (url: string, fileName: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file');
      
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Parse all sheets
      const parsedSheets: ParsedSheet[] = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const jsonData = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { 
          header: 1,
          defval: null,
          raw: false
        });
        
        // Calculate column widths based on content
        const maxCols = Math.max(...jsonData.map(row => row.length), 1);
        const colWidths = Array(maxCols).fill(100);
        
        jsonData.forEach(row => {
          row.forEach((cell, colIndex) => {
            if (cell !== null) {
              const cellLength = String(cell).length;
              colWidths[colIndex] = Math.max(colWidths[colIndex], Math.min(cellLength * 8 + 20, 300));
            }
          });
        });
        
        return {
          name,
          data: jsonData,
          colWidths,
        };
      });
      
      const result: ParsedExcelModel = {
        fileName,
        sheets: parsedSheets,
        rawWorkbook: workbook,
      };
      
      setParsedModel(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse Excel file';
      setError(message);
      setParsedModel(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearModel = useCallback(() => {
    setParsedModel(null);
    setError(null);
  }, []);

  return {
    parsedModel,
    isLoading,
    error,
    parseExcelFromUrl,
    clearModel,
  };
}
