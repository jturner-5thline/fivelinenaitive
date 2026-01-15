import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface SyncPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK_SYNC';
  table: string;
  source_project_id: string;
  record?: Record<string, unknown>;
  records?: Record<string, unknown>[];
  old_record?: Record<string, unknown>;
  // Info request event fields
  event?: string;
  deal_id?: string;
  request?: {
    notification_message: string;
    company_name: string;
    user_email: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
    const expectedKey = Deno.env.get('EXTERNAL_SYNC_API_KEY');
    
    if (expectedKey && apiKey !== expectedKey) {
      console.error('Invalid API key provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: SyncPayload = await req.json();
    console.log('Received sync payload:', JSON.stringify(payload));

    // Handle info_request events from Flex
    if (payload.event === 'info_request' && payload.deal_id && payload.request) {
      console.log('Processing info_request event for deal:', payload.deal_id);
      
      // Extract lender name from notification message (e.g., "Kate Duquett at Lender Requested...")
      const message = payload.request.notification_message;
      let lenderName: string | null = null;
      const atMatch = message.match(/at\s+(.+?)\s+Requested/i);
      if (atMatch) {
        lenderName = atMatch[1];
      }
      
      const { error: insertError } = await supabase
        .from('flex_info_notifications')
        .insert({
          type: 'info_request',
          deal_id: payload.deal_id,
          message: message,
          user_email: payload.request.user_email,
          lender_name: lenderName,
          company_name: payload.request.company_name,
          status: 'pending',
        });
      
      if (insertError) {
        console.error('Error inserting info notification:', insertError);
        throw insertError;
      }
      
      console.log('Successfully inserted info notification for deal:', payload.deal_id);
      
      return new Response(
        JSON.stringify({ success: true, event: 'info_request' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { type, table, source_project_id, record, records, old_record } = payload;

    // Handle bulk sync
    if (type === 'BULK_SYNC' && records) {
      const results: Record<string, { inserted: number; updated: number; errors: string[] }> = {};
      
      for (const rec of records) {
        const tableName = (rec._table as string) || table;
        if (!results[tableName]) {
          results[tableName] = { inserted: 0, updated: 0, errors: [] };
        }
        
        try {
          await upsertRecord(supabase, tableName, source_project_id, rec);
          results[tableName].inserted++;
        } catch (e) {
          results[tableName].errors.push(e instanceof Error ? e.message : 'Unknown error');
        }
      }
      
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle single record operations
    if (type === 'DELETE' && old_record) {
      await deleteRecord(supabase, table, source_project_id, old_record);
    } else if (record) {
      await upsertRecord(supabase, table, source_project_id, record);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function upsertRecord(
  supabase: any,
  table: string,
  source_project_id: string,
  record: Record<string, unknown>
) {
  const externalTable = getExternalTableName(table);
  if (!externalTable) {
    console.log(`Skipping unsupported table: ${table}`);
    return;
  }

  const mappedRecord = mapRecord(table, record, source_project_id);
  
  const { error } = await supabase
    .from(externalTable)
    .upsert(mappedRecord, { 
      onConflict: 'source_project_id,external_id',
      ignoreDuplicates: false 
    });

  if (error) {
    console.error(`Error upserting to ${externalTable}:`, error);
    throw error;
  }
  
  console.log(`Upserted record to ${externalTable}:`, mappedRecord.external_id);
}

// deno-lint-ignore no-explicit-any
async function deleteRecord(
  supabase: any,
  table: string,
  source_project_id: string,
  record: Record<string, unknown>
) {
  const externalTable = getExternalTableName(table);
  if (!externalTable) return;

  const { error } = await supabase
    .from(externalTable)
    .delete()
    .eq('source_project_id', source_project_id)
    .eq('external_id', record.id as string);

  if (error) {
    console.error(`Error deleting from ${externalTable}:`, error);
    throw error;
  }
  
  console.log(`Deleted record from ${externalTable}:`, record.id);
}

function getExternalTableName(table: string): string | null {
  const tableMap: Record<string, string> = {
    'profiles': 'external_profiles',
    'deals': 'external_deals',
    'deal_lenders': 'external_deal_lenders',
    'activity_logs': 'external_activity_logs',
  };
  return tableMap[table] || null;
}

function mapRecord(table: string, record: Record<string, unknown>, source_project_id: string): Record<string, unknown> {
  const base = {
    external_id: record.id,
    source_project_id,
    synced_at: new Date().toISOString(),
  };

  switch (table) {
    case 'profiles':
      return {
        ...base,
        user_id: record.user_id,
        email: record.email,
        display_name: record.display_name,
        first_name: record.first_name,
        last_name: record.last_name,
        avatar_url: record.avatar_url,
        onboarding_completed: record.onboarding_completed,
        external_created_at: record.created_at,
      };
    case 'deals':
      return {
        ...base,
        user_id: record.user_id,
        company_id: record.company_id,
        company: record.company,
        value: record.value,
        stage: record.stage,
        status: record.status,
        deal_type: record.deal_type,
        borrower_name: record.borrower_name,
        property_address: record.property_address,
        notes: record.notes,
        external_created_at: record.created_at,
        external_updated_at: record.updated_at,
      };
    case 'deal_lenders':
      return {
        ...base,
        external_deal_id: record.deal_id,
        name: record.name,
        stage: record.stage,
        substage: record.substage,
        status: record.status,
        notes: record.notes,
        external_created_at: record.created_at,
        external_updated_at: record.updated_at,
      };
    case 'activity_logs':
      return {
        ...base,
        external_deal_id: record.deal_id,
        user_id: record.user_id,
        activity_type: record.activity_type,
        description: record.description,
        metadata: record.metadata,
        external_created_at: record.created_at,
      };
    default:
      return base;
  }
}
