import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('WEBHOOK_SYNC_URL');
    const apiKey = Deno.env.get('WEBHOOK_SYNC_API_KEY');

    if (!webhookUrl) {
      console.log('WEBHOOK_SYNC_URL not configured, skipping sync');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook URL not configured, sync skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: WebhookPayload = await req.json();
    
    console.log(`Syncing ${payload.type} on ${payload.table}:`, {
      type: payload.type,
      table: payload.table,
      recordId: payload.record?.id || payload.old_record?.id,
    });

    // Forward to external webhook
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-API-Key'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        source: 'lovable-cloud',
        project_id: Deno.env.get('SUPABASE_PROJECT_ID') || 'unknown',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Webhook failed with status ${response.status}:`, errorText);
      
      // Don't throw - we don't want to break the original transaction
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Webhook returned ${response.status}`,
          details: errorText 
        }),
        { 
          status: 200, // Return 200 to not break the trigger
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await response.json().catch(() => ({}));
    
    console.log('Webhook sync successful:', {
      table: payload.table,
      type: payload.type,
      responseStatus: response.status,
    });

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook sync error:', error);
    
    // Return success to not break the original database operation
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        note: 'Error logged but not propagated to avoid breaking transactions'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
