import { useState } from "react";
import { Copy, Check, KeyRound, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * naitive API access card — visible only to jturner@5thline.co.
 * Surfaces the MCP endpoint + example client config so external tools
 * (ChatGPT, Claude, Cursor) can connect via OAuth as the signed-in user.
 */
const MCP_URL = "https://tgkksvazruzbghssnxde.supabase.co/functions/v1/mcp";

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "naitive": {
      "url": "${MCP_URL}"
    }
  }
}`;

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-start gap-2">
        <pre className={`flex-1 rounded-md border bg-muted/40 px-3 py-2 text-xs ${mono ? "font-mono" : ""} overflow-x-auto whitespace-pre-wrap break-all`}>{value}</pre>
        <Button type="button" size="icon" variant="ghost" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function NaitiveApiAccessCard() {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          naitive API (internal preview)
        </h2>
        <span className="text-[11px] text-muted-foreground/70">Visible to you only</span>
      </div>
      <div className="rounded-lg border bg-card p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-semibold">Connect ChatGPT, Claude, Cursor, or any MCP client</h3>
            <p className="text-xs text-muted-foreground">
              naitive exposes a signed-in API over the Model Context Protocol. Each caller signs in with their
              own naitive account via OAuth 2.1 — every tool runs as that user, respecting the same permissions
              and row-level security as the app. No static API key is issued; the client obtains a short-lived
              token during the OAuth handshake.
            </p>
          </div>
        </div>

        <CopyRow label="MCP endpoint" value={MCP_URL} />

        <CopyRow label="Claude Desktop / Cursor config" value={CLAUDE_CONFIG} />

        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground text-[13px]">Available tools (v1)</div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
            <li>list_deals</li>
            <li>get_deal</li>
            <li>update_deal</li>
            <li>list_tasks</li>
            <li>create_task</li>
            <li>complete_task</li>
            <li>search_contacts</li>
            <li>search_companies</li>
            <li>create_contact</li>
            <li>create_company</li>
            <li>search_lenders</li>
            <li>add_lender_to_deal</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <a href="https://modelcontextprotocol.io/clients" target="_blank" rel="noreferrer" className="gap-1.5">
              MCP client list <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => {
              // Open in a top-level tab so the Lovable preview iframe's
              // sandbox doesn't get an X-Frame-Options refusal from claude.ai.
              window.open(
                "https://claude.ai/settings/connectors",
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            Add to Claude <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </section>
  );
}
