import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tables to export (in order to handle foreign key dependencies)
const TABLES = [
  'companies',
  'profiles',
  'company_members',
  'company_invitations',
  'deals',
  'deal_lenders',
  'deal_milestones',
  'deal_attachments',
  'deal_status_notes',
  'deal_flag_notes',
  'lender_notes_history',
  'lender_attachments',
  'activity_logs',
  'outstanding_items',
  'referral_sources',
  'workflows',
  'workflow_runs',
  'notification_reads',
  'login_history',
  'waitlist',
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role to bypass RLS for complete export
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting data export...');
    
    const exportData: Record<string, any[]> = {};
    const errors: string[] = [];

    for (const table of TABLES) {
      console.log(`Exporting table: ${table}`);
      
      // Fetch all data from each table (up to 10000 rows per table)
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(10000);

      if (error) {
        console.error(`Error exporting ${table}:`, error.message);
        errors.push(`${table}: ${error.message}`);
        exportData[table] = [];
      } else {
        exportData[table] = data || [];
        console.log(`Exported ${data?.length || 0} rows from ${table}`);
      }
    }

    // Summary
    const summary = {
      exportedAt: new Date().toISOString(),
      tables: Object.entries(exportData).map(([table, rows]) => ({
        table,
        rowCount: rows.length,
      })),
      totalRows: Object.values(exportData).reduce((sum, rows) => sum + rows.length, 0),
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log('Export complete:', summary);

    return new Response(
      JSON.stringify({
        summary,
        data: exportData,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="naitive-export.json"',
        },
      }
    );
  } catch (error: unknown) {
    console.error('Export failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
