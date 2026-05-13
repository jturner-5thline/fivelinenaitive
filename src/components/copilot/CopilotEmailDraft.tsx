import { useState } from 'react';
import { Mail, Copy, Check, Edit3 } from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

interface EmailDraft {
  to_name: string;
  to_email?: string;
  subject: string;
  body: string;
}

interface Props {
  draft: EmailDraft;
}

export function CopilotEmailDraft({ draft }: Props) {
  const [copied, setCopied] = useState(false);

  const plainText = `To: ${draft.to_name}${draft.to_email ? ` <${draft.to_email}>` : ''}\nSubject: ${draft.subject}\n\n${draft.body.replace(/<[^>]*>/g, '')}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div
      style={{
        background: 'rgba(126,184,247,0.06)',
        border: '1px solid rgba(126,184,247,0.22)',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 8,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(126,184,247,0.15)',
          background: 'rgba(126,184,247,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Mail size={14} style={{ color: 'hsl(var(--primary))' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>Email Draft</span>
        </div>
        <button
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'transparent',
            border: '1px solid var(--glass-border)',
            color: 'hsl(var(--muted-foreground))',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {copied ? <Check size={12} style={{ color: 'rgb(34,197,94)' }} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Meta */}
      <div style={{ padding: '6px 12px', fontSize: 12, borderBottom: '1px solid rgba(126,184,247,0.1)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: 'hsl(var(--muted-foreground))', width: 32, flexShrink: 0 }}>To:</span>
          <span style={{ color: 'var(--foreground)' }}>{draft.to_name}{draft.to_email ? ` <${draft.to_email}>` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ color: 'hsl(var(--muted-foreground))', width: 32, flexShrink: 0 }}>Subj:</span>
          <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{draft.subject}</span>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 13,
          lineHeight: 1.6,
          color: 'hsl(var(--muted-foreground))',
          maxHeight: 180,
          overflowY: 'auto',
        }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.body.includes('<') ? draft.body : `<p>${draft.body}</p>`, { USE_PROFILES: { html: true } }) }}
      />
    </div>
  );
}
