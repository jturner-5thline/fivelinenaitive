import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MasterLenderInsert } from '@/hooks/useMasterLenders';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// Convert decimal to millions (e.g., 2.00 -> 2000000)
function parseDecimalToMillions(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  
  // Handle range format like "0.50 - 5.00" - take the max
  if (value.includes('-')) {
    const parts = value.split('-').map((p) => p.trim());
    const numbers = parts.map((p) => parseFloat(p)).filter((n) => !isNaN(n));
    if (numbers.length > 0) {
      return Math.max(...numbers) * 1_000_000;
    }
    return null;
  }
  
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return num * 1_000_000;
}

// Parse min value from range
function parseMinFromRange(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  
  if (value.includes('-')) {
    const parts = value.split('-').map((p) => p.trim());
    const numbers = parts.map((p) => parseFloat(p)).filter((n) => !isNaN(n));
    if (numbers.length > 0) {
      return Math.min(...numbers) * 1_000_000;
    }
    return null;
  }
  
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return num * 1_000_000;
}

// Parse industries from comma-separated string
function parseIndustries(value: string | undefined): string[] | null {
  if (!value || value.trim() === '') return null;
  return value.split(',').map((i) => i.trim()).filter((i) => i.length > 0);
}

// Parse markdown table row
function parseMarkdownRow(line: string): string[] {
  const parts = line.split('|');
  return parts.slice(1, -1).map(cell => 
    cell.trim().replace(/\\/g, '')
  );
}

// The column order for this spreadsheet:
// 0: Service Provider ID
// 1: Lenders (name)
// 2: Preferred Geography
// 3: Preferred Revenue
// 4: Preferred Loan Amount Max
// 5: Preferred Loan Amount Min
// 6: Preferred Loan Amount (range)
// 7: Primary Contact Phone
// 8: Primary Contact
// 9: Primary Contact Title
// 10: Primary Contact Email
// 11: Primary Lender Type
// 12-18: Location fields
// 19: Description
// 20: Preferred Industry

function parseNonBankLendersMarkdown(markdownContent: string): MasterLenderInsert[] {
  const lines = markdownContent.split('\n');
  const lenders: MasterLenderInsert[] = [];
  
  let headerFound = false;
  let separatorSkipped = false;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!line.includes('|')) continue;
    
    // Look for the header row
    if (line.includes('Service Provider ID|Lenders|')) {
      headerFound = true;
      continue;
    }
    
    // Skip the separator row (|---|---|...)
    if (headerFound && !separatorSkipped && line.match(/^\|[-|]+\|$/)) {
      separatorSkipped = true;
      continue;
    }
    
    if (headerFound && separatorSkipped) {
      const cells = parseMarkdownRow(line);
      
      // Skip empty rows
      if (cells.length < 2 || !cells[1]) continue;
      
      const name = cells[1].trim();
      if (!name || name === 'View Service Provider Online') continue;
      
      const lender: MasterLenderInsert = {
        name,
        lender_type: cells[11] || 'Lender', // Use the type from spreadsheet
        geo: cells[2] || null,
        min_revenue: parseMinFromRange(cells[3]),
        max_deal: parseDecimalToMillions(cells[4]),
        min_deal: parseMinFromRange(cells[5]),
        contact_name: cells[8] || null,
        contact_title: cells[9] || null,
        email: cells[10]?.replace(/\\@/g, '@') || null,
        deal_structure_notes: cells[19] || null,
        industries: parseIndustries(cells[20]),
      };
      
      lenders.push(lender);
    }
  }
  
  return lenders;
}

interface NonBankLendersImportButtonProps {
  onImportComplete?: () => void;
}

export function NonBankLendersImportButton({ onImportComplete }: NonBankLendersImportButtonProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      // Fetch the parsed markdown file
      const response = await fetch('/data/non-bank-lenders-parsed.md');
      if (!response.ok) {
        throw new Error('Failed to load non-bank lenders data. Please ensure the file exists.');
      }
      
      const content = await response.text();
      const lenders = parseNonBankLendersMarkdown(content);
      
      if (lenders.length === 0) {
        toast({ 
          title: 'No lenders found', 
          description: 'Could not parse any lenders from the file.',
          variant: 'destructive' 
        });
        return;
      }

      // Call the edge function with the parsed data
      const { data, error } = await supabase.functions.invoke('import-non-bank-lenders', {
        body: { rows: lenders },
      });

      if (error) throw error;

      if (data.success) {
        const message = data.skippedDuplicates > 0 
          ? `Imported ${data.imported} lenders (${data.skippedDuplicates} duplicates skipped)`
          : `Successfully imported ${data.imported} lenders`;
        toast({ title: 'Non-Bank Import Complete', description: message });
        onImportComplete?.();
      } else {
        toast({ 
          title: 'Import failed', 
          description: data.error || 'Unknown error occurred',
          variant: 'destructive' 
        });
      }
      
      setIsConfirmOpen(false);
    } catch (error) {
      console.error('Import error:', error);
      toast({ 
        title: 'Import failed', 
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive' 
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
      <AlertDialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsConfirmOpen(true)}
          disabled={isImporting}
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Users className="h-4 w-4 mr-2" />
          )}
          Import Non-Banks
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Import Non-Bank Lenders</AlertDialogTitle>
          <AlertDialogDescription>
            This will import non-bank lenders from the uploaded spreadsheet.
            <br /><br />
            <strong>Import rules:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Lender type preserved from spreadsheet (not set to "Bank")</li>
              <li>Decimal values converted to millions (e.g., 2.00 → $2,000,000)</li>
              <li>Exact name matches will be skipped (no duplicates)</li>
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleImport} disabled={isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              'Import Non-Banks'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
