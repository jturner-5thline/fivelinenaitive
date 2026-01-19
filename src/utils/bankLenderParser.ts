import { MasterLenderInsert } from '@/hooks/useMasterLenders';

interface ParsedBankRow {
  name: string;
  geo: string;
  preferredRevenue: string;
  maxDeal: string;
  minDeal: string;
  preferredLoanAmount: string;
  contactPhone: string;
  contactName: string;
  contactTitle: string;
  email: string;
  lenderType: string;
  hqLocation: string;
  website: string;
  description: string;
  industries: string;
  verticals: string;
}

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
  // Split by | and get the cell values
  const parts = line.split('|');
  // First and last are usually empty due to leading/trailing |
  return parts.slice(1, -1).map(cell => 
    cell.trim().replace(/\\/g, '') // Remove backslashes used for escaping
  );
}

export function parseBankLendersMarkdown(markdownContent: string): MasterLenderInsert[] {
  const lines = markdownContent.split('\n');
  const lenders: MasterLenderInsert[] = [];
  
  // Find the header line and data lines
  let headerFound = false;
  let separatorSkipped = false;
  
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Skip non-table lines
    if (!line.includes('|')) continue;
    
    // Check for header line
    if (line.includes('Lenders|Preferred Geography')) {
      headerFound = true;
      continue;
    }
    
    // Skip separator line (contains only - and |)
    if (headerFound && !separatorSkipped && line.match(/^\|[-|]+\|$/)) {
      separatorSkipped = true;
      continue;
    }
    
    // Process data rows
    if (headerFound && separatorSkipped) {
      const cells = parseMarkdownRow(line);
      
      if (cells.length < 5 || !cells[0]) continue; // Skip if no name
      
      const name = cells[0].trim();
      if (!name || name === 'View Service Provider Online') continue;
      
      // Map columns based on the header:
      // 0: Lenders, 1: Preferred Geography, 2: Preferred Revenue, 
      // 3: Preferred Loan Amount Max, 4: Preferred Loan Amount Min, 5: Preferred Loan Amount
      // 6: Primary Contact Phone, 7: Primary Contact, 8: Primary Contact Title, 9: Primary Contact Email
      // 10: Primary Lender Type, 11: HQ Location, 12-16: Address info, 17: Website
      // 18: Description, 19: Preferred Industry, 20: Preferred Verticals
      
      const lender: MasterLenderInsert = {
        name,
        lender_type: 'Bank', // Force all to be "Bank" as requested
        geo: cells[1] || null,
        min_revenue: parseMinFromRange(cells[2]), // Revenue converted to millions
        max_deal: parseDecimalToMillions(cells[3]), // Max loan amount converted to millions
        min_deal: parseDecimalToMillions(cells[4]), // Min loan amount converted to millions
        contact_name: cells[7] || null,
        contact_title: cells[8] || null,
        email: cells[9] || null,
        deal_structure_notes: cells[18] || null, // Description
        industries: parseIndustries(cells[19]),
      };
      
      lenders.push(lender);
    }
  }
  
  return lenders;
}

export function getBankLenderStats(lenders: MasterLenderInsert[]): {
  total: number;
  withContact: number;
  withRevenue: number;
  withLoanAmounts: number;
} {
  return {
    total: lenders.length,
    withContact: lenders.filter(l => l.contact_name || l.email).length,
    withRevenue: lenders.filter(l => l.min_revenue != null).length,
    withLoanAmounts: lenders.filter(l => l.min_deal != null || l.max_deal != null).length,
  };
}
