export interface LenderCsvRow {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  preferences: string;
  website: string;
  description: string;
}

export function exportLendersToCsv(lenders: {
  name: string;
  contact: { name: string; email: string; phone: string };
  preferences: string[];
  website?: string;
  description?: string;
}[]): string {
  const headers = ['Name', 'Contact Name', 'Email', 'Phone', 'Preferences', 'Website', 'Description'];
  
  const rows = lenders.map(lender => [
    escapeCsvField(lender.name),
    escapeCsvField(lender.contact.name),
    escapeCsvField(lender.contact.email),
    escapeCsvField(lender.contact.phone),
    escapeCsvField(lender.preferences.join('; ')),
    escapeCsvField(lender.website || ''),
    escapeCsvField(lender.description || ''),
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function parseCsvToLenders(csvContent: string): LenderCsvRow[] {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file must have a header row and at least one data row');
  }

  // Skip header row
  const dataLines = lines.slice(1);
  
  return dataLines.map((line, index) => {
    const fields = parseCsvLine(line);
    
    if (fields.length < 1 || !fields[0]?.trim()) {
      throw new Error(`Row ${index + 2}: Lender name is required`);
    }

    return {
      name: fields[0]?.trim() || '',
      contactName: fields[1]?.trim() || '',
      email: fields[2]?.trim() || '',
      phone: fields[3]?.trim() || '',
      preferences: fields[4]?.trim() || '',
      website: fields[5]?.trim() || '',
      description: fields[6]?.trim() || '',
    };
  });
}

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
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current);
  return result;
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
