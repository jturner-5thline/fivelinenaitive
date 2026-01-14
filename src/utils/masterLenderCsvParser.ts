import type { MasterLenderInsert } from '@/hooks/useMasterLenders';

// CSV column header mappings (case-insensitive)
const COLUMN_MAPPINGS: Record<string, keyof MasterLenderInsert> = {
  'e-mail': 'email',
  'email': 'email',
  'lender': 'name',
  'lender name': 'name',
  'name': 'name',
  'lender type': 'lender_type',
  'loan types': 'loan_types',
  'sub debt': 'sub_debt',
  'cash-burn': 'cash_burn',
  'cash burn': 'cash_burn',
  'sponsorship?': 'sponsorship',
  'sponsorship': 'sponsorship',
  'min. rev': 'min_revenue',
  'min rev': 'min_revenue',
  'min revenue': 'min_revenue',
  'ebitda min.': 'ebitda_min',
  'ebitda min': 'ebitda_min',
  'min. deal': 'min_deal',
  'min deal': 'min_deal',
  'max deal': 'max_deal',
  'industries': 'industries',
  'industries to avoid': 'industries_to_avoid',
  'b2b | b2c': 'b2b_b2c',
  'b2b/b2c': 'b2b_b2c',
  'refinancing': 'refinancing',
  'company requirements': 'company_requirements',
  'deal structure notes': 'deal_structure_notes',
  'geo': 'geo',
  'geography': 'geo',
  'contact': 'contact_name',
  'contact name': 'contact_name',
  'title': 'contact_title',
  'contact title': 'contact_title',
  'relationship owner(s)': 'relationship_owners',
  'relationship owners': 'relationship_owners',
  'lender one-pager': 'lender_one_pager_url',
  'one pager': 'lender_one_pager_url',
  'referral lender': 'referral_lender',
  'referral fee offered': 'referral_fee_offered',
  'referral agreement': 'referral_agreement',
  'nda': 'nda',
  'onboarded to flex': 'onboarded_to_flex',
  'last modified': 'external_last_modified',
  'created by': 'external_created_by',
  'upfront checklist': 'upfront_checklist',
  'post-term sheet checklist': 'post_term_sheet_checklist',
  'what is the best address to send you a thank-you gift or note': 'gift_address',
  'gift address': 'gift_address',
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

function parseNumeric(value: string): number | null {
  if (!value || value.trim() === '') return null;
  
  // Remove common formatting: $, commas, spaces
  const cleaned = value.replace(/[$,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  
  return isNaN(num) ? null : num;
}

function parseArray(value: string): string[] | null {
  if (!value || value.trim() === '') return null;
  
  // Split by comma, trim each value, filter empty strings
  return value
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

function parseDate(value: string): string | null {
  if (!value || value.trim() === '') return null;
  
  try {
    // Try to parse various date formats
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

export interface ParseResult {
  lenders: MasterLenderInsert[];
  errors: string[];
  skipped: number;
}

export function parseMasterLendersCsv(csvContent: string): ParseResult {
  const errors: string[] = [];
  let skipped = 0;
  
  // Handle BOM and normalize line endings
  const normalized = csvContent
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // Split into lines, handling potential multi-line values
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (const char of normalized) {
    if (char === '"') {
      inQuotes = !inQuotes;
    }
    if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }
  
  if (lines.length < 2) {
    return { lenders: [], errors: ['CSV must have a header row and at least one data row'], skipped: 0 };
  }
  
  // Parse header row
  const headers = parseCsvLine(lines[0]);
  const columnIndexMap: Map<number, keyof MasterLenderInsert> = new Map();
  
  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();
    const mappedField = COLUMN_MAPPINGS[normalizedHeader];
    if (mappedField) {
      columnIndexMap.set(index, mappedField);
    }
  });
  
  // Parse data rows
  const lenders: MasterLenderInsert[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      skipped++;
      continue;
    }
    
    const values = parseCsvLine(line);
    const lender: Partial<MasterLenderInsert> = {};
    
    columnIndexMap.forEach((field, colIndex) => {
      const value = values[colIndex] || '';
      
      // Handle different field types
      switch (field) {
        case 'min_revenue':
        case 'ebitda_min':
        case 'min_deal':
        case 'max_deal':
          (lender as any)[field] = parseNumeric(value);
          break;
        case 'loan_types':
        case 'industries':
        case 'industries_to_avoid':
          (lender as any)[field] = parseArray(value);
          break;
        case 'external_last_modified':
          (lender as any)[field] = parseDate(value);
          break;
        default:
          (lender as any)[field] = value || null;
      }
    });
    
    // Validate required field: name
    if (!lender.name || lender.name.trim() === '') {
      skipped++;
      if (values.some(v => v.trim())) {
        errors.push(`Row ${i + 1}: Missing lender name, skipped`);
      }
      continue;
    }
    
    lenders.push(lender as MasterLenderInsert);
  }
  
  return { lenders, errors, skipped };
}

export function exportMasterLendersToCsv(lenders: MasterLenderInsert[]): string {
  const headers = [
    'E-mail',
    'Lender',
    'Lender Type',
    'Loan Types',
    'Sub Debt',
    'Cash-Burn',
    'Sponsorship?',
    'Min. Rev',
    'EBITDA Min.',
    'Min. Deal',
    'Max Deal',
    'Industries',
    'Industries to Avoid',
    'B2B | B2C',
    'Refinancing',
    'Company Requirements',
    'Deal Structure Notes',
    'Geo',
    'Contact',
    'Title',
    'Relationship Owner(s)',
    'Lender One-pager',
    'Referral Lender',
    'Referral Fee Offered',
    'Referral Agreement',
    'NDA',
    'Onboarded to FLEx',
    'Upfront Checklist',
    'Post-Term Sheet Checklist',
    'Gift Address',
  ];
  
  const rows = lenders.map(lender => [
    escapeCsvField(lender.email || ''),
    escapeCsvField(lender.name),
    escapeCsvField(lender.lender_type || ''),
    escapeCsvField(lender.loan_types?.join(', ') || ''),
    escapeCsvField(lender.sub_debt || ''),
    escapeCsvField(lender.cash_burn || ''),
    escapeCsvField(lender.sponsorship || ''),
    lender.min_revenue?.toString() || '',
    lender.ebitda_min?.toString() || '',
    lender.min_deal?.toString() || '',
    lender.max_deal?.toString() || '',
    escapeCsvField(lender.industries?.join(', ') || ''),
    escapeCsvField(lender.industries_to_avoid?.join(', ') || ''),
    escapeCsvField(lender.b2b_b2c || ''),
    escapeCsvField(lender.refinancing || ''),
    escapeCsvField(lender.company_requirements || ''),
    escapeCsvField(lender.deal_structure_notes || ''),
    escapeCsvField(lender.geo || ''),
    escapeCsvField(lender.contact_name || ''),
    escapeCsvField(lender.contact_title || ''),
    escapeCsvField(lender.relationship_owners || ''),
    escapeCsvField(lender.lender_one_pager_url || ''),
    escapeCsvField(lender.referral_lender || ''),
    escapeCsvField(lender.referral_fee_offered || ''),
    escapeCsvField(lender.referral_agreement || ''),
    escapeCsvField(lender.nda || ''),
    escapeCsvField(lender.onboarded_to_flex || ''),
    escapeCsvField(lender.upfront_checklist || ''),
    escapeCsvField(lender.post_term_sheet_checklist || ''),
    escapeCsvField(lender.gift_address || ''),
  ]);
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
