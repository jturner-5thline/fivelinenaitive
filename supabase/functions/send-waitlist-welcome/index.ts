import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WaitlistWelcomeRequest {
  name: string;
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email }: WaitlistWelcomeRequest = await req.json();

    console.log(`Sending waitlist welcome email to ${email}`);

    const emailResponse = await resend.emails.send({
      from: "nAItive <noreply@updates.naitive.co>",
      reply_to: "support@naitive.co",
      to: [email],
      subject: "Welcome to the nAItive Waitlist!",
      headers: {
        "List-Unsubscribe": "<https://naitive.co/unsubscribe>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      text: `Hey ${name}!\n\nThanks for joining the nAItive waitlist! We're thrilled to have you on board.\n\nYou're now on the list to be among the first to experience our AI-powered lending platform. We're working hard to build something amazing, and we can't wait to share it with you.\n\nWe'll keep you updated on our progress and let you know as soon as early access becomes available.\n\nStay tuned for updates!\n— The nAItive Team\n\n---\nnAItive | Unsubscribe: https://naitive.co/unsubscribe`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="color-scheme" content="dark light">
          <meta name="supported-color-schemes" content="dark light">
          <title>Welcome to nAItive</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <!-- Preheader text -->
          <div style="display: none; max-height: 0; overflow: hidden;">
            You're on the list! Be among the first to experience our AI-powered lending platform.
            &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0a0a0a;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px;">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding-bottom: 32px;">
                      <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: #ffffff;">
                        n<span style="color: #22c55e;">AI</span>tive
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Main Content -->
                  <tr>
                    <td style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 16px; padding: 40px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 24px; color: #ffffff; font-weight: 600;">
                        Hey ${name}!
                      </h2>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        Thanks for joining the nAItive waitlist! We're thrilled to have you on board.
                      </p>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        You're now on the list to be among the first to experience our AI-powered lending platform. We're working hard to build something amazing, and we can't wait to share it with you.
                      </p>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #a1a1aa;">
                        We'll keep you updated on our progress and let you know as soon as early access becomes available.
                      </p>
                      
                      <hr style="border: none; border-top: 1px solid rgba(34, 197, 94, 0.2); margin: 32px 0;">
                      
                      <p style="margin: 0; font-size: 14px; color: #71717a;">
                        Stay tuned for updates!
                      </p>
                      <p style="margin: 8px 0 0 0; font-size: 14px; color: #22c55e; font-weight: 500;">
                        — The nAItive Team
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td align="center" style="padding-top: 32px;">
                      <p style="margin: 0; font-size: 12px; color: #52525b;">
                        © ${new Date().getFullYear()} nAItive. All rights reserved.
                      </p>
                      <p style="margin: 8px 0 0 0; font-size: 12px; color: #52525b;">
                        <a href="https://naitive.co/unsubscribe" style="color: #22c55e; text-decoration: underline;">Unsubscribe</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Waitlist welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending waitlist welcome email:", error);
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
