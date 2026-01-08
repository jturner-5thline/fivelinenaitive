import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendInviteRequest {
  invitationId: string;
  email: string;
  companyName: string;
  inviterName: string;
  role: string;
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { email, companyName, inviterName, role, token }: SendInviteRequest = await req.json();

    // Construct the invite URL - use the origin from the request or fallback
    const origin = req.headers.get("origin") || "https://lovable.dev";
    const inviteUrl = `${origin}/accept-invite?token=${token}`;

    console.log(`Sending invite to ${email} for company ${companyName}`);

    const emailResponse = await resend.emails.send({
      from: "nAItive <team@5thline.co>",
      to: [email],
      subject: `You've been invited to join ${companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; background-color: #f5f5f5;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 24px;">You're Invited!</h1>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              <strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> as a <strong>${role}</strong>.
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Click the button below to accept the invitation and get started.
            </p>
            <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0;">
              Accept Invitation
            </a>
            <p style="color: #999; font-size: 14px; margin-top: 32px;">
              This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-invite function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
