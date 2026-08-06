import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, Pencil, Play, ExternalLink } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** When true, default to View mode (rendered markdown). */
  defaultRendered?: boolean;
  /** Claap recording URL for deep-links / Watch button. */
  recordingUrl?: string | null;
}

/**
 * Transform Claap inline timestamp citations `%[mm:ss]()` (or hh:mm:ss)
 * into markdown links pointing at the recording deep-link, rendered as
 * a small playable pill via the custom link renderer below.
 */
export function transformTimestamps(raw: string, recordingUrl: string | null | undefined): string {
  if (!raw) return raw;
  return raw.replace(/\s*%\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\(\)\s*/g, (_m, a, b, c) => {
    let secs: number;
    let label: string;
    if (c !== undefined) {
      secs = parseInt(a, 10) * 3600 + parseInt(b, 10) * 60 + parseInt(c, 10);
      label = `${a}:${b}:${c}`;
    } else {
      secs = parseInt(a, 10) * 60 + parseInt(b, 10);
      label = `${a}:${b}`;
    }
    const url = recordingUrl ? `${recordingUrl}${recordingUrl.includes('?') ? '&' : '?'}t=${secs}` : '#';
    // Use a unique marker class via the link text so we can style it.
    return ` [⏵\u00A0${label}](${url} "claap-ts") `;
  });
}

export function ClaapNoteEditor({
  value,
  onChange,
  placeholder,
  defaultRendered = false,
  recordingUrl,
}: Props) {
  // Default mode: 'view' when we have rendered-worthy content, else 'edit'.
  const initialMode: 'view' | 'edit' = defaultRendered && value.trim().length > 0 ? 'view' : 'edit';
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // If a fresh AI pre-fill arrives, snap back to view mode so the user sees
  // the rich rendering without having to toggle.
  const lastSeenRef = useRef<string>(value);
  useEffect(() => {
    if (defaultRendered && value !== lastSeenRef.current) {
      lastSeenRef.current = value;
      if (value.trim().length > 0) setMode('view');
    }
  }, [value, defaultRendered]);

  const renderedSource = useMemo(
    () => transformTimestamps(value, recordingUrl),
    [value, recordingUrl],
  );

  const enterEdit = () => {
    setMode('edit');
    // Defer focus until the textarea mounts.
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className="relative rounded-md border border-white/[0.08] bg-white/[0.02]">
      {/* Top-right controls */}
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1">
        {recordingUrl && (
          <a
            href={recordingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[10px] border border-emerald-500/30 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/15"
            title="Open in Claap"
          >
            <Play className="h-2.5 w-2.5" /> Watch in Claap <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-white"
          onClick={() => (mode === 'view' ? enterEdit() : setMode('view'))}
        >
          {mode === 'view' ? <><Pencil className="h-2.5 w-2.5" /> Edit</> : <><Eye className="h-2.5 w-2.5" /> Preview</>}
        </Button>
      </div>

      {mode === 'view' ? (
        <div
          role="textbox"
          tabIndex={0}
          onClick={enterEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') enterEdit(); }}
          // Click anywhere in the rendered area to enter edit mode.
          className={cn(
            'block w-full text-left',
            'min-h-[360px] max-h-[720px] overflow-y-auto',
            'px-3 py-2.5 pr-24 cursor-text',
            'prose prose-sm prose-invert max-w-none',
            // Custom typography
            '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5',
            '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-white/95',
            '[&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-white/95 [&_h3]:tracking-wide',
            '[&_h4]:text-xs [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-white/90',
            '[&_p]:text-xs [&_p]:leading-relaxed [&_p]:my-1.5 [&_p]:text-white/85',
            '[&_strong]:text-white [&_strong]:font-semibold',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ul]:space-y-1 [&_ul]:text-xs [&_ul]:text-white/85',
            '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_ol]:space-y-1 [&_ol]:text-xs [&_ol]:text-white/85',
            '[&_li]:leading-snug',
            '[&_a]:text-sky-300 [&_a]:underline-offset-2',
          )}
          aria-label="Edit note"
        >
          {value.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, title, children }) => {
                  if (title === 'claap-ts') {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center align-baseline gap-0.5 h-4 px-1 mx-0.5 rounded text-[9px] border border-emerald-500/30 text-emerald-200 bg-emerald-500/10 no-underline hover:bg-emerald-500/15"
                      >
                        {children}
                      </a>
                    );
                  }
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {renderedSource}
            </ReactMarkdown>
          ) : (
            <span className="text-xs italic text-muted-foreground">{placeholder || 'Add a note…'}</span>
          )}
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[360px] max-h-[720px] text-xs resize-y bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 pr-24"
        />
      )}
    </div>
  );
}