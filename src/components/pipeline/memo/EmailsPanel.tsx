interface RawEmail {
  id: string;
  subject: string | null;
  snippet: string | null;
  from_name: string | null;
  from_email: string | null;
}

interface EmailsPanelProps {
  emails: RawEmail[];
  isLoading?: boolean;
}

function senderOrg(e: RawEmail): string | null {
  const dom = (e.from_email || '').split('@')[1];
  if (!dom) return null;
  const root = dom.split('.').slice(-2, -1)[0];
  if (!root) return null;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

/**
 * Compact list of recent email previews for a single deal — shown as the
 * middle column of the 24h digest card.
 */
export function EmailsPanel({ emails, isLoading }: EmailsPanelProps) {
  if (isLoading) {
    return (
      <div className="p-5 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-12 w-full rounded bg-muted animate-pulse" />
        <div className="h-12 w-full rounded bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-5 min-w-0 self-start">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 mb-3">
        Emails
      </div>
      {emails.length === 0 ? (
        <p className="text-xs italic text-white/55">No recent emails.</p>
      ) : (
        <div className="space-y-2">
          {emails.slice(0, 4).map((e) => {
            const sender = e.from_name || e.from_email || 'Unknown';
            const org = senderOrg(e);
            const preview = (e.snippet || e.subject || '').slice(0, 140);
            return (
              <div
                key={e.id}
                className="rounded-md bg-white/[0.04] border-l-2 border-primary/60 pl-2.5 pr-2 py-1.5"
              >
                <div className="text-[11px] font-semibold text-white truncate">
                  {sender}
                  {org && <span className="text-white/60 font-normal"> · {org}</span>}
                </div>
                <div className="text-[11px] text-white/70 line-clamp-2 leading-snug">
                  {preview}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}