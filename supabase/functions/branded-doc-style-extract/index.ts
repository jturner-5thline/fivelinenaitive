import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractRequest {
  source_type: "image" | "url";
  // For image: data URL (data:image/...;base64,...) OR storage path in 'ai-style-refs'
  image_data_url?: string;
  image_storage_path?: string;
  // For url:
  url?: string;
}

interface StyleResult {
  palette: { name: string; hex: string; role: string }[];
  fonts: { heading?: string; body?: string };
  layout_notes: string;
  source: "ai" | "lightweight";
}

const FALLBACK_STYLE: StyleResult = {
  palette: [
    { name: "Primary", hex: "#1E2952", role: "primary" },
    { name: "Accent", hex: "#4338CA", role: "accent" },
    { name: "Foreground", hex: "#0F172A", role: "foreground" },
    { name: "Muted", hex: "#64748B", role: "muted" },
    { name: "Background", hex: "#FFFFFF", role: "background" },
    { name: "Surface", hex: "#F8FAFC", role: "surface" },
  ],
  fonts: { heading: "Inter", body: "Inter" },
  layout_notes: "Modern, professional layout with clear hierarchy, ample whitespace, and subtle accent color usage.",
  source: "lightweight",
};

function isValidHex(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function parseAiJson(raw: string): StyleResult | null {
  try {
    const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || !Array.isArray(parsed.palette)) return null;
    parsed.palette = parsed.palette
      .map((c: any) => ({
        name: String(c.name || "Color"),
        hex: String(c.hex || "").trim(),
        role: String(c.role || "accent"),
      }))
      .filter((c: any) => isValidHex(c.hex))
      .slice(0, 6);
    if (parsed.palette.length < 2) return null;
    parsed.fonts = parsed.fonts && typeof parsed.fonts === "object" ? parsed.fonts : {};
    parsed.layout_notes = String(parsed.layout_notes || "");
    parsed.source = "ai";
    return parsed as StyleResult;
  } catch {
    return null;
  }
}

async function callGeminiVision(
  prompt: string,
  imageDataUrl?: string,
): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const userContent: any[] = [{ type: "text", text: prompt }];
  if (imageDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a brand designer. Analyze visual references and return ONLY a JSON object with: palette (array of {name,hex,role} where role is one of primary/accent/foreground/muted/background/surface), fonts ({heading,body}), layout_notes (1-3 sentences). No prose, JSON only.",
          },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn("[style-extract] Gemini call failed:", response.status, await response.text());
      return null;
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn("[style-extract] Gemini error:", err);
    return null;
  }
}

async function lightweightFromUrl(url: string): Promise<StyleResult> {
  // Try to scrape <meta name="theme-color"> and basic colors from HTML
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; naitiveBrandBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const themeColor = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const palette = [...FALLBACK_STYLE.palette];
    if (themeColor && isValidHex(themeColor)) {
      palette[0] = { name: "Brand", hex: themeColor, role: "primary" };
    }
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    return {
      ...FALLBACK_STYLE,
      palette,
      layout_notes: title
        ? `Style derived from ${title}. Clean, modern layout with brand color emphasis.`
        : FALLBACK_STYLE.layout_notes,
      source: "lightweight",
    };
  } catch {
    return FALLBACK_STYLE;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // 5th Line proprietary action — hard gate by company-account email domain.
    {
      const callerEmail = String(userData.user.email || "").toLowerCase();
      const isFifthLine = callerEmail.endsWith("@5thline.co") || callerEmail.endsWith("@naitive.co");
      if (!isFifthLine) {
        return new Response(JSON.stringify({ error: "Forbidden: 5th Line proprietary action" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = (await req.json()) as ExtractRequest;
    if (!body?.source_type) {
      return new Response(JSON.stringify({ error: "source_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let imageDataUrl: string | undefined = body.image_data_url;

    // Resolve storage path -> data url for Gemini vision
    if (!imageDataUrl && body.image_storage_path) {
      const { data: blob, error } = await supabase.storage
        .from("ai-style-refs")
        .download(body.image_storage_path);
      if (!error && blob) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin);
        imageDataUrl = `data:${blob.type || "image/png"};base64,${b64}`;
      }
    }

    // 1) Try AI extraction
    let aiResult: StyleResult | null = null;
    if (body.source_type === "image" && imageDataUrl) {
      const raw = await callGeminiVision(
        "Analyze this brand reference image. Extract a 5-6 color palette as hex values, identify font style families (heading/body), and describe the layout in 1-3 sentences. Return JSON only.",
        imageDataUrl,
      );
      if (raw) aiResult = parseAiJson(raw);
    } else if (body.source_type === "url" && body.url) {
      const raw = await callGeminiVision(
        `Analyze the brand at this URL: ${body.url}. Based on the brand name and any prior knowledge, infer a likely color palette (5-6 hex colors), font style families, and layout direction. Return JSON only.`,
      );
      if (raw) aiResult = parseAiJson(raw);
    }

    // 2) Fallback
    if (!aiResult) {
      if (body.source_type === "url" && body.url) {
        const lite = await lightweightFromUrl(body.url);
        return new Response(JSON.stringify(lite), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(FALLBACK_STYLE), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(aiResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[branded-doc-style-extract] error:", err);
    return new Response(JSON.stringify({ error: String(err), ...FALLBACK_STYLE }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
