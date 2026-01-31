import { useState, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { parseExcelFromUrl, ParsedSheet } from '@/lib/excelUtils';

export type { ParsedSheet };

export interface ParsedExcelModel {
  fileName: string;
  sheets: ParsedSheet[];
  rawWorkbook: ExcelJS.Workbook | null;
}

export function useExcelModelParser() {
  const [parsedModel, setParsedModel] = useState<ParsedExcelModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseExcel = useCallback(async (url: string, fileName: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { sheets, workbook } = await parseExcelFromUrl(url);
      
      const result: ParsedExcelModel = {
        fileName,
        sheets,
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
    parseExcelFromUrl: parseExcel,
    clearModel,
  };
}
