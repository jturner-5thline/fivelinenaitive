import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COUNT_THRESHOLD = 5;
const DAYS_THRESHOLD = 5;

interface PendingGroup {
  deal_id: string;
  thread_id: string | null;
  client_email: string | null;
  client_name: string | null;
  company_id: string | null;
  pending_count: number;
  oldest_created_at: string;
  requests: Array<{ id: string; title: string; description: string | null; created_at: string }>;
}

function generateDraftHtml(clientName: string, requests: PendingGroup['requests']): { html: string; text: string } {
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,';
  const items = requests.map((r, i) => {
    const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      html: `<li style="margin-bottom:8px;"><strong>${i + 1}. ${r.title}</strong>${r.description ? `<br/><span style="color:#666;">${r.description}</span>` : ''}<br/><small style="color:#999;">Requested: ${date}</small></li>`,
      text: `${i + 1}. ${r.title}${r.description ? `\n   ${r.description}` : ''}\n   Requested: ${date}`,
    };
  });

  const html = `
<div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
  <p>${greeting}</p>
  <p>We have the following outstanding items that require your attention. Could you please review and confirm each?</p>
  <ol style="padding-left: 20px;">
    ${items.map(i => i.html).join('\n    ')}
  </ol>
  <p>Please let us know if you have any questions or need clarification on any of the above.</p>
  <p>Best regards,<br/>The 5th Line Team</p>
</div>`.trim();

  const text = `${greeting}

We have the following outstanding items that require your attention. Could you please review and confirm each?

${items.map(i => i.text).join('\n\n')}

Please let us know if you have any questions or need clarification on any of the above.

Best regards,
The 5th Line Team`;

  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get auth header for user context (optional - scheduled jobs won't have it)
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'evaluate'; // 'evaluate' | 'force_draft' | 'approve' | 'reject'

    if (mode === 'approve') {
      const { draft_id } = body;
      if (!draft_id || !userId) {
        return new Response(JSON.stringify({ error: 'Missing draft_id or auth' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.from('client_request_drafts').update({
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      }).eq('id', draft_id).eq('status', 'needs_approval');

      if (error) throw error;

      // Update linked requests
      await supabase.from('client_requests').update({ status: 'approved' })
        .eq('draft_id', draft_id).eq('status', 'included_in_draft');

      // Audit
      await supabase.from('client_request_audit_log').insert({
        draft_id, action: 'approved', performed_by: userId,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'reject') {
      const { draft_id, notes } = body;
      if (!draft_id || !userId) {
        return new Response(JSON.stringify({ error: 'Missing draft_id or auth' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.from('client_request_drafts').update({
        status: 'rejected',
        rejected_by: userId,
        rejected_at: new Date().toISOString(),
        rejection_notes: notes || null,
      }).eq('id', draft_id).eq('status', 'needs_approval');

      if (error) throw error;

      // Reset linked requests back to pending
      await supabase.from('client_requests').update({ status: 'pending', draft_id: null })
        .eq('draft_id', draft_id).eq('status', 'included_in_draft');

      // Audit
      await supabase.from('client_request_audit_log').insert({
        draft_id, action: 'rejected', performed_by: userId,
        details: notes ? { notes } : null,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- EVALUATE MODE ---
    // Find all pending requests, grouped by deal_id + thread_id
    const { data: pendingRequests, error: fetchErr } = await supabase
      .from('client_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!pendingRequests || pendingRequests.length === 0) {
      return new Response(JSON.stringify({ drafts_created: 0, message: 'No pending requests' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by deal_id + thread_id
    const groups: Record<string, PendingGroup> = {};
    for (const r of pendingRequests) {
      const key = `${r.deal_id}::${r.thread_id || 'no-thread'}`;
      if (!groups[key]) {
        groups[key] = {
          deal_id: r.deal_id,
          thread_id: r.thread_id,
          client_email: r.client_email,
          client_name: r.client_name,
          company_id: r.company_id,
          pending_count: 0,
          oldest_created_at: r.created_at,
          requests: [],
        };
      }
      groups[key].pending_count++;
      groups[key].requests.push({
        id: r.id,
        title: r.title,
        description: r.description,
        created_at: r.created_at,
      });
      if (r.created_at < groups[key].oldest_created_at) {
        groups[key].oldest_created_at = r.created_at;
      }
    }

    const now = new Date();
    let draftsCreated = 0;

    for (const group of Object.values(groups)) {
      const oldestAge = Math.floor((now.getTime() - new Date(group.oldest_created_at).getTime()) / (1000 * 60 * 60 * 24));
      const countTriggered = group.pending_count >= COUNT_THRESHOLD;
      const timeTriggered = oldestAge >= DAYS_THRESHOLD;
      const forceMode = mode === 'force_draft' && body.deal_id === group.deal_id;

      if (!countTriggered && !timeTriggered && !forceMode) continue;

      // Check for existing non-sent draft for this deal+thread
      const { data: existingDrafts } = await supabase
        .from('client_request_drafts')
        .select('id')
        .eq('deal_id', group.deal_id)
        .eq('thread_id', group.thread_id || '')
        .in('status', ['needs_approval'])
        .limit(1);

      if (existingDrafts && existingDrafts.length > 0) {
        // Flag that new requests are pending on existing draft
        await supabase.from('client_request_drafts')
          .update({ new_requests_pending: true })
          .eq('id', existingDrafts[0].id);
        continue;
      }

      // Generate draft
      const triggerReason = forceMode ? 'manual' : countTriggered ? 'count_threshold' : 'time_threshold';
      const { html, text } = generateDraftHtml(group.client_name || '', group.requests);

      const { data: draft, error: draftErr } = await supabase
        .from('client_request_drafts')
        .insert({
          deal_id: group.deal_id,
          thread_id: group.thread_id,
          client_email: group.client_email,
          client_name: group.client_name,
          body_html: html,
          body_text: text,
          request_count: group.pending_count,
          trigger_reason: triggerReason,
          created_by: userId,
          company_id: group.company_id,
        })
        .select('id')
        .single();

      if (draftErr) {
        console.error('Failed to create draft:', draftErr);
        continue;
      }

      // Link requests to draft
      const requestIds = group.requests.map(r => r.id);
      await supabase.from('client_requests')
        .update({ status: 'included_in_draft', draft_id: draft.id })
        .in('id', requestIds);

      // Audit
      await supabase.from('client_request_audit_log').insert({
        draft_id: draft.id,
        action: 'draft_created',
        performed_by: userId,
        details: { trigger_reason: triggerReason, request_count: group.pending_count },
      });

      draftsCreated++;
    }

    return new Response(JSON.stringify({ drafts_created: draftsCreated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
