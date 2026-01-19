// Parser for non-bank lenders spreadsheet data
// Columns from spreadsheet:
// Service Provider ID | Lenders | Preferred Geography | Preferred Revenue | Preferred Loan Amount Max | 
// Preferred Loan Amount Min | Preferred Loan Amount | Primary Contact Phone | Primary Contact | 
// Primary Contact Title | Primary Contact Email | Primary Lender Type | HQ Location | HQ Address Line 1 |
// HQ City | HQ State/Province | HQ Post Code | HQ Country/Territory/Region | Website | Description | 
// Preferred Industry | Preferred Verticals | View Service Provider Online

export interface NonBankLenderRow {
  name: string;
  geo?: string;
  min_revenue?: number;
  max_deal?: number;
  min_deal?: number;
  contact_name?: string;
  contact_title?: string;
  email?: string;
  lender_type: string;
  industries?: string[];
  description?: string;
}

// Convert decimal to millions (e.g., 2.00 -> 2000000)
function parseDecimalToMillions(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  
  // Handle range format like "0.50 - 5.00" - take the max
  if (value.includes("-")) {
    const parts = value.split("-").map((p) => p.trim());
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
  if (!value || value.trim() === "") return null;
  
  if (value.includes("-")) {
    const parts = value.split("-").map((p) => p.trim());
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
  if (!value || value.trim() === "") return null;
  return value.split(",").map((i) => i.trim()).filter((i) => i.length > 0);
}

// Parse a markdown table row
function parseMarkdownTableRow(row: string): string[] {
  return row
    .split("|")
    .map((cell) => cell.trim().replace(/\\/g, ""))
    .filter((_, index, arr) => index > 0 && index < arr.length - 1);
}

export function parseNonBankLendersMarkdown(markdownContent: string): NonBankLenderRow[] {
  const lines = markdownContent.split("\n").filter((line) => line.trim().startsWith("|"));
  
  // Skip header row and separator row
  const dataLines = lines.slice(2);
  
  const lenders: NonBankLenderRow[] = [];
  
  for (const line of dataLines) {
    const cells = parseMarkdownTableRow(line);
    
    // Column mapping based on the spreadsheet:
    // 0: Service Provider ID
    // 1: Lenders (name)
    // 2: Preferred Geography
    // 3: Preferred Revenue
    // 4: Preferred Loan Amount Max
    // 5: Preferred Loan Amount Min
    // 6: Preferred Loan Amount (range string)
    // 7: Primary Contact Phone
    // 8: Primary Contact
    // 9: Primary Contact Title
    // 10: Primary Contact Email
    // 11: Primary Lender Type
    // 12: HQ Location
    // ... rest not needed for now
    // 19: Description
    // 20: Preferred Industry
    
    const name = cells[1]?.trim();
    if (!name) continue;
    
    const loanAmountRange = cells[6] || "";
    
    lenders.push({
      name,
      geo: cells[2] || undefined,
      min_revenue: undefined, // Not in this spreadsheet
      max_deal: parseDecimalToMillions(cells[4]) ?? parseDecimalToMillions(loanAmountRange.split("-")[1]) ?? undefined,
      min_deal: parseMinFromRange(cells[5]) ?? parseMinFromRange(loanAmountRange) ?? undefined,
      contact_name: cells[8] || undefined,
      contact_title: cells[9] || undefined,
      email: cells[10] || undefined,
      lender_type: cells[11] || "Lender", // Use provided type from spreadsheet
      industries: parseIndustries(cells[20]) ?? undefined,
      description: cells[19] || undefined,
    });
  }
  
  return lenders;
}

// Pre-parsed data from the uploaded spreadsheet
export const nonBankLendersData: NonBankLenderRow[] = [];
