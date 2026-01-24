import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
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
  
  // Handle range format like "0.01 - 2.00" - take the max
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

function parseBankLendersMarkdown(markdownContent: string): MasterLenderInsert[] {
  const lines = markdownContent.split('\n');
  const lenders: MasterLenderInsert[] = [];
  
  let headerFound = false;
  let separatorSkipped = false;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!line.includes('|')) continue;
    
    if (line.includes('Lenders|Preferred Geography')) {
      headerFound = true;
      continue;
    }
    
    if (headerFound && !separatorSkipped && line.match(/^\|[-|]+\|$/)) {
      separatorSkipped = true;
      continue;
    }
    
    if (headerFound && separatorSkipped) {
      const cells = parseMarkdownRow(line);
      
      if (cells.length < 5 || !cells[0]) continue;
      
      const name = cells[0].trim();
      if (!name || name === 'View Service Provider Online') continue;
      
      // Columns: 0: Lenders, 1: Geo, 2: Revenue, 3: Max Loan, 4: Min Loan, 5: Loan Range
      // 6: Phone, 7: Contact, 8: Title, 9: Email, 10: Type, 11-16: Address, 17: Website
      // 18: Description, 19: Industries, 20: Verticals
      
      const lender: MasterLenderInsert = {
        name,
        lender_type: 'Bank', // Force all to be "Bank"
        geo: cells[1] || null,
        min_revenue: parseMinFromRange(cells[2]),
        max_deal: parseDecimalToMillions(cells[3]),
        min_deal: parseDecimalToMillions(cells[4]),
        contact_name: cells[7] || null,
        contact_title: cells[8] || null,
        email: cells[9] || null,
        deal_structure_notes: cells[18] || null,
        industries: parseIndustries(cells[19]),
      };
      
      lenders.push(lender);
    }
  }
  
  return lenders;
}

interface BankLendersImportButtonProps {
  onImport: (lenders: MasterLenderInsert[]) => Promise<{ success: number; failed: number; errors: string[] }>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function BankLendersImportButton({ onImport, open, onOpenChange, showTrigger = true }: BankLendersImportButtonProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [parsedCount, setParsedCount] = useState<number | null>(null);

  // Support both controlled and uncontrolled modes
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const handleImport = async () => {
    setIsImporting(true);
    try {
      // Fetch the parsed markdown file
      const response = await fetch('/data/bank-lenders-parsed.md');
      if (!response.ok) {
        throw new Error('Failed to load bank lenders data');
      }
      
      const content = await response.text();
      const lenders = parseBankLendersMarkdown(content);
      
      if (lenders.length === 0) {
        toast({ 
          title: 'No lenders found', 
          description: 'Could not parse any lenders from the file.',
          variant: 'destructive' 
        });
        return;
      }

      const result = await onImport(lenders);
      
      toast({ 
        title: 'Bank Import Complete', 
        description: `Successfully imported ${result.success} bank lenders${result.failed > 0 ? ` (${result.failed} failed)` : ''}.`
      });
      
      setIsOpen(false);
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

  const checkLendersCount = async () => {
    try {
      const response = await fetch('/data/bank-lenders-parsed.md');
      if (!response.ok) return;
      const content = await response.text();
      const lenders = parseBankLendersMarkdown(content);
      setParsedCount(lenders.length);
    } catch {
      setParsedCount(null);
    }
    setIsOpen(true);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <AlertDialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={checkLendersCount}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4 mr-2" />
            )}
            Import Banks
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Import Bank Lenders</AlertDialogTitle>
          <AlertDialogDescription>
            This will import {parsedCount?.toLocaleString() || '~2,500'} bank lenders from the uploaded spreadsheet.
            <br /><br />
            <strong>Transformations applied:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Lender type set to "Bank" for all entries</li>
              <li>Decimal values converted to millions (e.g., 2.00 → $2,000,000)</li>
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
              'Import Banks'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
