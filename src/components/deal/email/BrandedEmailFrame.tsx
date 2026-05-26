import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface Props {
  html: string;
  className?: string;
  maxHeight?: number;
  onError?: (err: unknown) => void;
}

/**
 * Renders a branded/notification HTML email (LinkedIn, HubSpot, Stripe,
 * newsletters, etc.) inside a sandboxed iframe so the email's own CSS,
 * tables, colors, buttons and images render with full fidelity — the way
 * Outlook / Gmail show them in the reading pane — without leaking into
 * the app's styles or executing untrusted code.
 *
 * Security: body is DOMPurify-sanitized first; the iframe sandbox
 * intentionally omits `allow-same-origin` so even a bypass cannot reach
 * the parent document, cookies, or storage. `allow-scripts` is granted
 * solely to run our trusted height-postMessage shim.
 */
export function BrandedEmailFrame({ html, className, maxHeight = 4000, onError }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(320);
  const frameId = useRef<string>(`bef-${Math.random().toString(36).slice(2)}`);

  // Resolve themed surface colors from the parent document so the sandboxed
  // iframe (which can't read our CSS vars) matches the Naitive email reader
  // instead of painting a raw white background behind every branded email.
  const theme = useMemo(() => {
    try {
      const cs = getComputedStyle(document.documentElement);
      const hsl = (name: string, fallback: string) => {
        const v = cs.getPropertyValue(name).trim();
        return v ? `hsl(${v})` : fallback;
      };
      return {
        bg: hsl('--email-reading-bg', '#1b1f2a'),
        text: hsl('--email-text-primary', '#f5f5f5'),
        link: hsl('--primary', '#7aa7ff'),
      };
    } catch {
      return { bg: '#1b1f2a', text: '#f5f5f5', link: '#7aa7ff' };
    }
  }, [html]);

  const srcDoc = useMemo(() => {
    try {
      const clean = DOMPurify.sanitize(html, {
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'link'],
        FORBID_ATTR: [
          'onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur',
          'onchange', 'onsubmit', 'onmouseenter', 'onmouseleave',
        ],
        ALLOW_DATA_ATTR: true,
        ADD_ATTR: ['target', 'rel', 'srcset', 'sizes', 'loading', 'decoding', 'bgcolor', 'background', 'align', 'valign'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });

      const fid = JSON.stringify(frameId.current);
      const closeScript = '<' + '/script>';
      return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>
html,body{margin:0;padding:0;background:transparent !important;color:${theme.text};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased;}
body{padding:8px 0;box-sizing:border-box;word-wrap:break-word;overflow-wrap:anywhere;background:transparent !important;}
/* Neutralize hardcoded white/light backgrounds the email author set on
   outer wrapper elements so the message blends into the Naitive reading
   surface. We target only the outermost wrappers + any element whose
   bgcolor attribute is explicitly white — intentional inner fills on
   buttons, pills, hero blocks, branded sections, etc. are preserved. */
html, body { background-color: transparent !important; }
body > table, body > div, body > center,
body > center > table, body > center > div,
body > table > tbody > tr > td,
body > div > table, body > div > div { background: transparent !important; background-color: transparent !important; }
[bgcolor="#ffffff" i], [bgcolor="#fff" i], [bgcolor="white" i],
[bgcolor="#FFFFFF"], [bgcolor="#FFF"] { background-color: transparent !important; }
img{max-width:100% !important;height:auto !important;border:0;}
table{max-width:100% !important;}
a{color:${theme.link};}
a[role="button"],.cta,.button,.btn{display:inline-block;}
</style></head><body>${clean}<script>(function(){
var fid=${fid};
function post(){try{var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);parent.postMessage({__bef:true,id:fid,height:h},"*");}catch(e){}}
window.addEventListener("load",function(){post();setTimeout(post,200);setTimeout(post,800);});
try{var ro=new ResizeObserver(post);ro.observe(document.body);}catch(e){}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a");if(a&&!a.target)a.target="_blank";});
})();${closeScript}</body></html>`;
    } catch (err) {
      onError?.(err);
      return null;
    }
  }, [html, onError, theme]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data as { __bef?: boolean; id?: string; height?: number } | null;
      if (!data || typeof data !== 'object' || !data.__bef) return;
      if (data.id !== frameId.current) return;
      const next = Math.min(Math.max(120, Number(data.height) || 0), maxHeight);
      setHeight(prev => (Math.abs(prev - next) < 4 ? prev : next));
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [maxHeight]);

  if (!srcDoc) return null;

  return (
    <div
      className={cn('w-full min-w-0 overflow-hidden bg-transparent', className)}
    >
      <iframe
        ref={iframeRef}
        title="Email content"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        style={{ width: '100%', height, border: 0, display: 'block', background: 'transparent' }}
        allowTransparency
        onError={(e) => onError?.(e)}
      />
    </div>
  );
}

const NOTIFICATION_DOMAINS = [
  'linkedin.com', 'e.linkedin.com', 'el.linkedin.com',
  'hubspot.com', 'hubspotemail.net', 'hs-sites.com',
  'github.com', 'noreply.github.com',
  'stripe.com', 'notifications.stripe.com',
  'mailchimp.com', 'mcsv.net', 'mcdlv.net',
  'sendgrid.net', 'intercom-mail.com', 'intercom.io',
  'notion.so', 'slack.com', 'zoom.us', 'eventbrite.com',
  'substack.com', 'medium.com', 'twitter.com', 'x.com',
  'instagram.com', 'facebookmail.com', 'googlegroups.com',
  'youtube.com', 'amazon.com', 'amazonses.com',
  'docusign.net', 'pandadoc.com', 'calendly.com',
  'asana.com', 'atlassian.com', 'figma.com', 'loom.com',
  'producthunt.com', 'netflix.com',
];

const NOTIFICATION_LOCAL_PARTS = /^(no-?reply|notifications?|updates?|news(letter)?|digest|alerts?|noreply|do-?not-?reply|hello|team|product|messages?)$/i;

/**
 * Heuristic: should we render this message in branded (iframe) mode?
 * Marketing/notification templates render with full fidelity; person-to-person
 * email keeps the simplified renderer that fits the dark reading surface.
 */
export function shouldRenderAsBranded(html: string | undefined, fromEmail: string | undefined): boolean {
  if (!html || html.length < 200) return false;
  const lowered = (fromEmail || '').toLowerCase();
  const domain = lowered.split('@')[1] || '';
  const local = lowered.split('@')[0] || '';

  if (domain && NOTIFICATION_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true;
  if (local && NOTIFICATION_LOCAL_PARTS.test(local)) return true;

  const h = html;
  const tableCount = (h.match(/<table[\s>]/gi) || []).length;
  const imgCount = (h.match(/<img[\s>]/gi) || []).length;
  const hasMso = /mso-|<!--\[if|VML/i.test(h);
  const hasBg = /bgcolor=|background-color\s*:/i.test(h);
  const big = h.length > 8000;

  if (hasMso) return true;
  if (tableCount >= 3 && (hasBg || imgCount >= 2)) return true;
  if (big && tableCount >= 2) return true;

  return false;
}
