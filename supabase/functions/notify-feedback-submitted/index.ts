import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FeedbackNotificationRequest {
  title: string;
  message: string;
  type: string;
  page_url: string;
  user_email: string;
  user_name: string;
  screenshot_url?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, message, type, page_url, user_email, user_name, screenshot_url }: FeedbackNotificationRequest = await req.json();

    // Validate required fields
    if (!title || !message || !type) {
      throw new Error("Missing required fields");
    }

    const typeLabel = type === 'bug' ? '🐛 Bug Report' : '💡 Feature Request';
    const typeColor = type === 'bug' ? '#dc2626' : '#8b5cf6';

    const emailResponse = await resend.emails.send({
      from: "Naitive Platform <notifications@5thline.co>",
      to: ["jturner@5thline.co"],
      subject: `[Feedback] ${typeLabel}: ${title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #861E81, #5B21B6); padding: 20px; border-radius: 8px 8px 0 0; }
            .header h1 { color: white; margin: 0; font-size: 20px; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .type-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; background: ${typeColor}; }
            .field { margin-bottom: 16px; }
            .field-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px; }
            .field-value { font-size: 14px; color: #111827; }
            .message-box { background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; white-space: pre-wrap; }
            .footer { margin-top: 20px; font-size: 12px; color: #9ca3af; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Feedback Submitted</h1>
            </div>
            <div class="content">
              <div class="field">
                <span class="type-badge">${typeLabel}</span>
              </div>
              
              <div class="field">
                <div class="field-label">Title</div>
                <div class="field-value" style="font-weight: 600; font-size: 16px;">${title}</div>
              </div>
              
              <div class="field">
                <div class="field-label">Submitted By</div>
                <div class="field-value">${user_name || 'Unknown'} (${user_email || 'No email'})</div>
              </div>
              
              <div class="field">
                <div class="field-label">Page</div>
                <div class="field-value">${page_url || 'Unknown'}</div>
              </div>
              
              <div class="field">
                <div class="field-label">Description</div>
                <div class="message-box">${message}</div>
              </div>
              
              ${screenshot_url ? `
              <div class="field">
                <div class="field-label">Screenshot Attached</div>
                <div class="field-value">Yes - view in admin panel</div>
              </div>
              ` : ''}
            </div>
            <div class="footer">
              View all feedback in the Admin Panel → Product Enhancement → Feedback
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Feedback notification email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-feedback-submitted function:", error);
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
