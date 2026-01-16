import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
  user_id: string;
  timestamp?: string;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
  config: Record<string, string>;
}

async function sendToWebhook(
  webhookUrl: string, 
  apiKey: string | undefined, 
  payload: WebhookPayload,
  integrationName: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  try {
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
        event: payload.type.toLowerCase(),
        table: payload.table,
        data: payload.record,
        previous_data: payload.old_record,
        timestamp: payload.timestamp || new Date().toISOString(),
        source: 'lovable-cloud',
        integration: integrationName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Webhook to ${integrationName} failed with status ${response.status}:`, errorText);
      return { success: false, error: errorText, status: response.status };
    }

    console.log(`Webhook to ${integrationName} succeeded`);
    return { success: true, status: response.status };
  } catch (error) {
    console.error(`Webhook to ${integrationName} error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: WebhookPayload = await req.json();
    
    console.log(`Processing webhook for ${payload.type} on ${payload.table}:`, {
      type: payload.type,
      table: payload.table,
      recordId: payload.record?.id || payload.old_record?.id,
      userId: payload.user_id,
    });

    // Initialize Supabase client to fetch user's webhook integrations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all active webhook integrations for this user
    const { data: integrations, error: fetchError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', payload.user_id)
      .eq('type', 'webhook')
      .eq('status', 'connected');

    if (fetchError) {
      console.error('Failed to fetch integrations:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch integrations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integrations || integrations.length === 0) {
      console.log('No active webhook integrations found for user');
      return new Response(
        JSON.stringify({ success: true, message: 'No active webhook integrations', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${integrations.length} active webhook integration(s)`);

    // Send to all active webhook integrations
    const results = await Promise.allSettled(
      integrations.map((integration: Integration) => {
        const webhookUrl = integration.config?.url || integration.config?.webhook_url;
        const apiKey = integration.config?.api_key;
        
        if (!webhookUrl) {
          console.warn(`Integration ${integration.name} has no webhook URL configured`);
          return Promise.resolve({ success: false, error: 'No webhook URL configured' });
        }

        return sendToWebhook(webhookUrl, apiKey, payload, integration.name);
      })
    );

    const successCount = results.filter(
      r => r.status === 'fulfilled' && (r.value as { success: boolean }).success
    ).length;

    console.log(`Webhook sync completed: ${successCount}/${integrations.length} successful`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount,
        total: integrations.length,
        results: results.map((r, i) => ({
          integration: integrations[i].name,
          ...(r.status === 'fulfilled' ? r.value : { success: false, error: 'Promise rejected' })
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook sync error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
