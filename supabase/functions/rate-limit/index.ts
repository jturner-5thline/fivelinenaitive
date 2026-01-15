import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for, x-real-ip',
};

// Rate limit configuration
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 requests per minute
const BLOCK_DURATION_SECONDS = 300; // Block for 5 minutes if exceeded
const BOT_BLOCK_DURATION_SECONDS = 3600; // Block bots for 1 hour

// Known bot user agent patterns
const BOT_PATTERNS = [
  /bot/i, /spider/i, /crawl/i, /scrape/i, /curl/i, /wget/i,
  /python-requests/i, /python-urllib/i, /axios/i, /node-fetch/i,
  /headless/i, /phantom/i, /selenium/i, /puppeteer/i, /playwright/i,
  /chrome-lighthouse/i, /googlebot/i, /bingbot/i, /slurp/i,
  /duckduckbot/i, /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
  /twitterbot/i, /linkedinbot/i, /whatsapp/i, /telegrambot/i,
  /applebot/i, /semrushbot/i, /ahrefsbot/i, /mj12bot/i,
  /dotbot/i, /petalbot/i, /bytespider/i, /gptbot/i,
  /ccbot/i, /claudebot/i, /anthropic/i,
];

// Allowed bots (search engines we want to allow)
const ALLOWED_BOTS = [
  /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
];

function isBot(userAgent: string | null): { isBot: boolean; isAllowedBot: boolean } {
  if (!userAgent) {
    return { isBot: true, isAllowedBot: false }; // No user agent = suspicious
  }

  const isAllowedBot = ALLOWED_BOTS.some(pattern => pattern.test(userAgent));
  if (isAllowedBot) {
    return { isBot: true, isAllowedBot: true };
  }

  const isDetectedBot = BOT_PATTERNS.some(pattern => pattern.test(userAgent));
  return { isBot: isDetectedBot, isAllowedBot: false };
}

function detectSuspiciousBehavior(headers: Headers): string[] {
  const issues: string[] = [];

  // Check for missing common browser headers
  if (!headers.get('accept-language')) {
    issues.push('missing_accept_language');
  }
  if (!headers.get('accept')) {
    issues.push('missing_accept');
  }

  // Check for suspicious header combinations
  const userAgent = headers.get('user-agent') || '';
  
  // Browser claims to be Chrome but missing sec-ch-ua headers
  if (userAgent.includes('Chrome/') && !headers.get('sec-ch-ua')) {
    issues.push('missing_client_hints');
  }

  return issues;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { path } = body;

    // Get IP from headers (works behind proxies)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') ||
               req.headers.get('cf-connecting-ip') ||
               'unknown';

    const userAgent = req.headers.get('user-agent');
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_SECONDS * 1000);

    console.log(`Rate limit check: IP=${ip}, path=${path}, UA=${userAgent?.substring(0, 50)}`);

    // Bot detection
    const { isBot: detectedBot, isAllowedBot } = isBot(userAgent);
    const suspiciousPatterns = detectSuspiciousBehavior(req.headers);

    // Allow legitimate search engine bots
    if (isAllowedBot) {
      console.log(`Allowed bot detected: ${userAgent}`);
      return new Response(
        JSON.stringify({ allowed: true, isBot: true, isAllowedBot: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Block known scraping bots
    if (detectedBot) {
      console.log(`Blocked bot detected: ${userAgent}`);
      
      // Log the blocked bot
      await supabase.from('rate_limits').insert({
        ip_address: ip,
        path: path || '/',
        is_bot: true,
        user_agent: userAgent,
        blocked_until: new Date(now.getTime() + BOT_BLOCK_DURATION_SECONDS * 1000).toISOString(),
      });

      return new Response(
        JSON.stringify({ 
          allowed: false, 
          reason: 'bot_detected',
          retryAfter: BOT_BLOCK_DURATION_SECONDS 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing rate limit record
    const { data: existingRecord, error: fetchError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('ip_address', ip)
      .eq('path', path || '/')
      .gte('window_start', windowStart.toISOString())
      .order('window_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching rate limit:', fetchError);
      // Allow request on error to avoid blocking legitimate users
      return new Response(
        JSON.stringify({ allowed: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if currently blocked
    if (existingRecord?.blocked_until) {
      const blockedUntil = new Date(existingRecord.blocked_until);
      if (blockedUntil > now) {
        const retryAfter = Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000);
        console.log(`IP ${ip} is blocked until ${blockedUntil.toISOString()}`);
        return new Response(
          JSON.stringify({ 
            allowed: false, 
            reason: 'rate_limited',
            retryAfter 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate new request count
    let newCount = 1;
    if (existingRecord) {
      newCount = existingRecord.request_count + 1;
    }

    // Check if rate limit exceeded
    if (newCount > MAX_REQUESTS_PER_WINDOW) {
      const blockedUntil = new Date(now.getTime() + BLOCK_DURATION_SECONDS * 1000);
      console.log(`Rate limit exceeded for IP ${ip}: ${newCount} requests, blocking until ${blockedUntil.toISOString()}`);

      if (existingRecord) {
        await supabase
          .from('rate_limits')
          .update({
            request_count: newCount,
            blocked_until: blockedUntil.toISOString(),
            is_bot: suspiciousPatterns.length > 2, // Mark as bot if too many suspicious patterns
          })
          .eq('id', existingRecord.id);
      } else {
        await supabase.from('rate_limits').insert({
          ip_address: ip,
          path: path || '/',
          request_count: newCount,
          blocked_until: blockedUntil.toISOString(),
          user_agent: userAgent,
          is_bot: suspiciousPatterns.length > 2,
        });
      }

      return new Response(
        JSON.stringify({ 
          allowed: false, 
          reason: 'rate_limited',
          retryAfter: BLOCK_DURATION_SECONDS 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update or insert rate limit record
    if (existingRecord) {
      await supabase
        .from('rate_limits')
        .update({ request_count: newCount })
        .eq('id', existingRecord.id);
    } else {
      await supabase.from('rate_limits').insert({
        ip_address: ip,
        path: path || '/',
        request_count: 1,
        user_agent: userAgent,
      });
    }

    // Periodically cleanup old records (1% chance per request)
    if (Math.random() < 0.01) {
      await supabase.rpc('cleanup_old_rate_limits');
    }

    console.log(`Request allowed for IP ${ip}: ${newCount}/${MAX_REQUESTS_PER_WINDOW}`);

    return new Response(
      JSON.stringify({ 
        allowed: true,
        remaining: MAX_REQUESTS_PER_WINDOW - newCount,
        suspiciousPatterns: suspiciousPatterns.length > 0 ? suspiciousPatterns : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Rate limit error:', error);
    // Allow on error to avoid blocking legitimate users
    return new Response(
      JSON.stringify({ allowed: true, error: 'internal_error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
