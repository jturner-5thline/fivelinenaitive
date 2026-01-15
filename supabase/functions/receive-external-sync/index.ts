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
    first_name?: string;
    last_name?: string;
    lender_name?: string;
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
      
      const { notification_message, company_name, user_email, first_name, last_name, lender_name } = payload.request;
      
      // Use lender_name from payload directly, or extract from message as fallback
      let resolvedLenderName = lender_name || null;
      if (!resolvedLenderName && notification_message) {
        const atMatch = notification_message.match(/at\s+(.+?)\s+Requested/i);
        if (atMatch) {
          resolvedLenderName = atMatch[1];
        }
      }
      
      // Build requester name from first/last name if available
      const requesterName = [first_name, last_name].filter(Boolean).join(' ') || null;
      
      console.log('Extracted data:', { resolvedLenderName, requesterName, user_email, company_name });
      
      const { error: insertError } = await supabase
        .from('flex_info_notifications')
        .insert({
          type: 'info_request',
          deal_id: payload.deal_id,
          message: notification_message,
          user_email: user_email,
          lender_name: resolvedLenderName,
          company_name: company_name,
          status: 'pending',
        });
      
      if (insertError) {
        console.error('Error inserting info notification:', insertError);
        throw insertError;
      }
      
      console.log('Successfully inserted info notification for deal:', payload.deal_id);
      
      // Send email notification to deal owner
      try {
        const { data: deal } = await supabase
          .from('deals')
          .select('company, user_id')
          .eq('id', payload.deal_id)
          .single();
        
        if (deal && deal.user_id) {
          console.log('Sending email notification to deal owner:', deal.user_id);
          
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-flex-alert`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              alert_type: 'info_request',
              deal_id: payload.deal_id,
              deal_name: deal.company,
              user_id: deal.user_id,
              lender_name: resolvedLenderName,
              lender_email: user_email,
              message: notification_message,
            }),
          });
          
          const emailResult = await emailResponse.json();
          console.log('Email notification result:', emailResult);
        } else {
          console.log('Could not find deal owner for email notification');
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // Don't fail the whole request if email fails
      }
      
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
