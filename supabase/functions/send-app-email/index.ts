import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Auth note: verify_jwt = true in config.toml, so Supabase's gateway validates
// the caller's JWT (anon or service_role) before the request reaches this code.

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return json({ error: 'Server configuration error' }, 500)
  }

  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string | undefined
  let templateData: Record<string, unknown> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    idempotencyKey = body.idempotencyKey || body.idempotency_key
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return json({ error: 'Invalid JSON in request body' }, 400)
  }

  if (!templateName || typeof templateName !== 'string') {
    return json({ error: 'templateName is required' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const logSend = async (
    status: 'sent' | 'suppressed' | 'failed',
    errorMessage?: string,
  ) => {
    const { error } = await supabase.from('email_send_log').insert({
      message_id: null,
      template_name: templateName,
      recipient_email: recipientEmail ?? null,
      status,
      error_message: errorMessage ?? null,
    })
    if (error) {
      console.error('Failed to write email_send_log', {
        code: error.code,
        message: error.message,
      })
    }
  }

  try {
    const result = await sendTemplateEmail(templateName, recipientEmail, {
      templateData,
      idempotencyKey,
    })

    if (!result.sent) {
      await logSend('suppressed')
      console.log('Email suppressed', { templateName })
      return json({ success: false, reason: 'email_suppressed' })
    }

    await logSend('sent')
    console.log('App email sent', { templateName })
    return json({ success: true, sent: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logSend('failed', message.slice(0, 1000))
    console.error('Failed to send app email', { templateName, error: message })
    return json({ error: 'Failed to send email' }, 500)
  }
})
