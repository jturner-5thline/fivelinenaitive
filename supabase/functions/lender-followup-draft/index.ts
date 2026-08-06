import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { callClaude } from '../_shared/claudeChat.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Generate a short, on-brand follow-up email draft for a single lender on a
 * specific deal. Returns { subject, body, category }.
 *
 * Auth: requires a signed-in user (mirrors polish-email-draft).
 * No DB writes — purely a draft generator. The client is responsible for
 * sending via gmail-messages and logging activity.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const lenderName = String(body.lender_name || '').trim();
    const dealName = String(body.deal_name || '').trim();
    const company = String(body.company || '').trim();
    const stage = String(body.stage || '').trim();
    const lastContactDays = Number.isFinite(body.days_since_last_contact)
      ? Number(body.days_since_last_contact)
      : null;
    const contactName = String(body.contact_name || '').trim();
    // Resolve sender name from the authenticated user's profile so the
    // sign-off matches whoever is logged in (no hardcoded fallback name).
    let senderName = String(body.sender_name || '').trim();
    if (!senderName) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name, email')
          .eq('user_id', user.id)
          .maybeSingle();
        senderName = (
          (profile?.display_name as string | undefined)?.trim() ||
          `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() ||
          (profile?.email ? String(profile.email).split('@')[0] : '') ||
          ''
        );
      } catch (_e) {
        // leave senderName empty — the AI will simply omit a name in sign-off.
      }
    }
    const notes = String(body.notes || '').trim();
    // When true, the app is replying inside an existing deal thread with this
    // lender — the draft must read as a continuation, not a new introduction.
    const replyInThread = body.reply_in_thread === true;
    const threadSubject = String(body.thread_subject || '').trim();
    // Optional Gmail context: most recent message in a thread that involves
    // this lender's email domain and the deal name. Used for "Following up
    // on your message from [date]…" personalization.
    const gmail = body.gmail_context && typeof body.gmail_context === 'object'
      ? body.gmail_context as { date?: string; from?: string; snippet?: string; subject?: string }
      : null;

    if (!lenderName) {
      return new Response(JSON.stringify({ error: 'lender_name required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stage + staleness routing — mirrors the documented playbook so the
    // popover label and the AI draft stay consistent with what the deal
    // team expects to see.
    const lc = stage.toLowerCase();
    const days = lastContactDays;
    type Template = { category: string; subject: string; bodyTemplate: (firstName: string) => string };
    const dn = dealName || company || 'the deal';
    // Greeting: extract first name from the contact (handles "Cyndi Koan, CFO"
    // → "Cyndi"). Fall back to "<Lender> Team" rather than a generic "there".
    const firstNameFromContact = (() => {
      if (!contactName) return '';
      const beforeComma = contactName.split(',')[0].trim();
      const first = beforeComma.split(/\s+/)[0] || '';
      return first;
    })();
    const teamFallback = lenderName ? `${lenderName} Team` : 'there';
    const fn = firstNameFromContact || teamFallback;

    const templateForStage = (): Template => {
      // Passed / no response 14+ days — overrides everything else.
      if (lc.includes('passed') || lc.includes('declined') || lc.includes('no response') || (days !== null && days >= 14 && (lc.includes('submit') || lc === ''))) {
        return {
          category: 'Final Check-In',
          subject: `${dn} — Final Check-In`,
          bodyTemplate: (n) => `Hi ${n},\n\nWanted to check in one last time on ${dn}. If the timing isn't right, no worries — I'd appreciate knowing so we can plan accordingly.\n\nThanks for your time either way.\n\n${senderName}`,
        };
      }
      if (lc.includes('agreement')) {
        return {
          category: 'Agreement Status',
          subject: `${dn} — Agreement Status`,
          bodyTemplate: (n) => `Hi ${n},\n\nJust checking in on the agreement for ${dn}. Is there anything outstanding on your end before we can finalize? Happy to coordinate.\n\n${senderName}`,
        };
      }
      if (lc.includes('term') || lc.includes('offer') || lc.includes('lol')) {
        return {
          category: 'Check on Terms',
          subject: `${dn} — Terms Follow-Up`,
          bodyTemplate: (n) => `Hi ${n},\n\nWanted to follow up on the term sheet we received. Do you have a sense of timeline for any revisions or next steps? Happy to discuss.\n\n${senderName}`,
        };
      }
      if (lc.includes('diligence') || lc.includes(' dd') || lc.startsWith('dd')) {
        return {
          category: 'DD Check-In',
          subject: `${dn} DD Update`,
          bodyTemplate: (n) => `Hi ${n},\n\nFollowing up on the outstanding due diligence items for ${dn}. Happy to set up a call to work through any open questions — let me know what would be most helpful.\n\n${senderName}`,
        };
      }
      if (lc.includes('review')) {
        return {
          category: 'Check on Questions',
          subject: `${dn} — Any Questions?`,
          bodyTemplate: (n) => `Hi ${n},\n\nJust checking in on ${dn} as you review. Do you have any initial questions or need any additional materials? Happy to jump on a call.\n\n${senderName}`,
        };
      }
      // Submitted bucket (and anything that defaults to "we sent it").
      if (days !== null && days >= 7) {
        return {
          category: 'Gentle Nudge',
          subject: `${dn} — Checking In`,
          bodyTemplate: (n) => `Hi ${n},\n\nWanted to follow up on our submission from ${days} days ago. I know things get busy — happy to schedule a quick call to walk through the deal if helpful. Let me know.\n\n${senderName}`,
        };
      }
      return {
        category: 'Confirm Receipt',
        subject: `Re: ${dn} — Following Up`,
        bodyTemplate: (n) => `Hi ${n},\n\nJust wanted to confirm you received ${dn}. Happy to answer any questions or provide additional information. Looking forward to hearing your initial thoughts.\n\n${senderName}`,
      };
    };

    const tpl = templateForStage();
    const category = tpl.category;
    const baseSubject = tpl.subject;
    const baseBody = tpl.bodyTemplate(fn);

    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      // No AI available — return the deterministic template directly.
      return new Response(JSON.stringify({ subject: baseSubject, body: baseBody, category }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Light AI personalization pass: keep the template's intent + subject,
    // but allow it to weave in a one-line reference to the most recent
    // Gmail thread when context is available. Stays tightly constrained
    // so we don't drift from the playbook copy.
    const gmailLine = gmail && (gmail.snippet || gmail.subject || gmail.date)
      ? `Recent thread context — date: ${gmail.date || '(unknown)'}, from: ${gmail.from || '(unknown)'}, subject: ${gmail.subject || '(none)'}, snippet: ${(gmail.snippet || '').slice(0, 300)}`
      : 'No recent Gmail thread found involving this lender for this deal.';

    const system = [
      "You are 5th Line's writing engine for institutional debt deals.",
      'You are personalizing a pre-approved follow-up email template. Keep the template intent and tone.',
      'Tone: professional, concise, neutral-warm, no fluff, no marketing language.',
      'Hard rules:',
      '- Plain prose, no markdown, no bullets, no headings.',
      '- 3 to 5 short sentences in the body.',
      '- Keep the subject line within a few words of the suggested subject.',
      replyInThread
        ? '- This email is a REPLY inside an existing thread with this lender about this deal. Write it as a continuation of that conversation: no re-introduction, no restating who we are, no re-explaining the deal from scratch. Reference the prior message briefly (e.g. "Following up on my note from [date]…") using the actual date from the thread context when available.'
        : '- If recent thread context is provided, you MAY open with a single sentence like "Following up on your message from [date]…" using the actual date from the context. Otherwise do not invent prior correspondence.',
      replyInThread && threadSubject
        ? `- The thread subject is "${threadSubject}". Return that exact subject prefixed with "Re: " (do not add a second "Re: " if it already starts with one).`
        : '',
      '- Never invent numbers, dates, terms, or commitments.',
      `- Address the recipient as "Hi ${fn}," exactly. Do not substitute a different greeting and do not use placeholders like "[Contact Name]".`,
      senderName
        ? `- Sign off as "${senderName}" on its own line.`
        : '- Do not include a sign-off name; the app will append the user\'s configured signature.',
      'Return STRICT JSON: {"subject": string, "body": string}. No prose outside the JSON.',
    ].join('\n');

    const userMsg = [
      `Deal: ${dealName || '(unnamed)'} for ${company || '(client)'}`,
      `Lender: ${lenderName}`,
      `Lender stage: ${stage || '(unknown)'}`,
      replyInThread ? `Replying inside existing thread: "${threadSubject || '(subject unknown)'}"` : 'Starting a new email thread.',
      days !== null ? `Days since last contact: ${days}` : 'No prior contact recorded.',
      `Recipient first name: ${fn}`,
      notes ? `Internal notes (do not quote verbatim): ${notes.slice(0, 400)}` : '',
      `Category: ${category}`,
      `Suggested subject: ${baseSubject}`,
      `Suggested body:\n${baseBody}`,
      gmailLine,
      'Personalize the follow-up now, staying close to the suggested copy.',
    ].filter(Boolean).join('\n');

    let raw = '';
    try {
      const result = await callClaude({
        system,
        messages: [{ role: 'user', content: userMsg }],
        temperature: 0.4,
        maxTokens: 1024,
      });
      raw = result.text;
    } catch (e: any) {
      console.error('[lender-followup-draft] Claude error', e?.status, e?.message);
      return new Response(JSON.stringify({ subject: baseSubject, body: baseBody, category }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let subject = baseSubject;
    let bodyOut = '';
    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed?.subject) subject = String(parsed.subject).trim();
      if (parsed?.body) bodyOut = String(parsed.body).trim();
    } catch {
      // Fallback: treat whole content as body.
      bodyOut = raw.trim();
    }

    if (!bodyOut) bodyOut = baseBody;

    return new Response(JSON.stringify({ subject, body: bodyOut, category }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
