import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LenderUpdate {
  name: string;
  active: boolean;
  tier: string | null;
}

// Parse CSV handling quoted fields with commas and newlines
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n after \r
      }
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f)) { // Only add non-empty rows
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
    } else {
      currentField += char;
    }
  }
  
  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f)) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { csvContent, fileUrl } = await req.json();
    
    let csvData = csvContent;
    
    // If fileUrl provided, fetch the CSV content
    if (fileUrl && !csvContent) {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch CSV from URL: ${response.status}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      csvData = await response.text();
      // Remove BOM if present
      if (csvData.charCodeAt(0) === 0xFEFF) {
        csvData = csvData.slice(1);
      }
    }
    
    // Remove BOM if present in csvContent too
    if (csvData && csvData.charCodeAt(0) === 0xFEFF) {
      csvData = csvData.slice(1);
    }
    
    if (!csvData) {
      return new Response(
        JSON.stringify({ error: 'No CSV content provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse CSV
    const rows = parseCSV(csvData);
    
    if (rows.length < 2) {
      return new Response(
        JSON.stringify({ error: 'CSV has no data rows' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get header indices
    const rawHeaders = rows[0];
    console.log('Raw headers:', JSON.stringify(rawHeaders.slice(0, 5)));
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^\w]/g, ''));
    console.log('Normalized headers:', JSON.stringify(headers.slice(0, 5)));
    const lenderIndex = headers.findIndex(h => h === 'lender');
    const activeIndex = headers.findIndex(h => h === 'active');
    const tierIndex = headers.findIndex(h => h === 'tier');

    console.log(`Found indices - lender: ${lenderIndex}, active: ${activeIndex}, tier: ${tierIndex}`);

    if (lenderIndex === -1) {
      return new Response(
        JSON.stringify({ error: 'Could not find Lender column', headers: headers.slice(0, 10) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract lender updates
    const updates: LenderUpdate[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[lenderIndex]?.trim();
      if (!name) continue;

      const activeValue = activeIndex !== -1 ? row[activeIndex]?.trim().toLowerCase() : '';
      const tierValue = tierIndex !== -1 ? row[tierIndex]?.trim() : '';

      // Handle tier - don't add T prefix if already present
      let tier: string | null = null;
      if (tierValue) {
        tier = tierValue.startsWith('T') ? tierValue : `T${tierValue}`;
      }

      updates.push({
        name,
        active: activeValue === 'checked',
        tier,
      });
    }

    console.log(`Processing ${updates.length} lenders from CSV`);

    // Get all lenders from DB
    const { data: existingLenders, error: fetchError } = await supabase
      .from('master_lenders')
      .select('id, name');

    if (fetchError) {
      throw fetchError;
    }

    // Create a map for case-insensitive matching
    const lenderMap = new Map<string, string>();
    for (const lender of existingLenders || []) {
      lenderMap.set(lender.name.toLowerCase().trim(), lender.id);
    }

    // Update lenders
    let updated = 0;
    let notFound: string[] = [];

    for (const update of updates) {
      const normalizedName = update.name.toLowerCase().trim();
      const lenderId = lenderMap.get(normalizedName);

      if (lenderId) {
        const { error: updateError } = await supabase
          .from('master_lenders')
          .update({
            active: update.active,
            tier: update.tier,
          })
          .eq('id', lenderId);

        if (updateError) {
          console.error(`Error updating ${update.name}:`, updateError);
        } else {
          updated++;
        }
      } else {
        notFound.push(update.name);
      }
    }

    console.log(`Updated ${updated} lenders, ${notFound.length} not found`);

    return new Response(
      JSON.stringify({
        success: true,
        updated,
        notFound: notFound.slice(0, 20), // Return first 20 not found
        totalNotFound: notFound.length,
        totalProcessed: updates.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
