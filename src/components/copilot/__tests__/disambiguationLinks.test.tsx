import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Minimal renderer mirroring the relevant slice of AICopilotPanel so we can
// regression-test the disambiguation-link click behavior in isolation.
function Renderer({ markdown }: { markdown: string }) {
  return (
    <MemoryRouter>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => url}
        components={{
          a: ({ href, children }) => (
            <a
              href={href || '#'}
              onClick={(e) => {
                const m = href ? /^(deal|contact|company|lender|funding_source|naitive):\/\/(?:([a-z_]+)\/)?([^/?#\s]+)/i.exec(href) : null;
                if (m) {
                  e.preventDefault();
                  const scheme = m[1].toLowerCase();
                  const subtype = m[2]?.toLowerCase();
                  const id = m[3];
                  const kind = scheme === 'naitive' ? (subtype || 'deal').replace(/s$/, '') : scheme;
                  const label = typeof children === 'string' ? children : '';
                  window.dispatchEvent(new CustomEvent('copilot-chip-click', {
                    detail: { prompt: `Use the ${kind} "${label}" (id: ${id}). Resolve the disambiguation with this choice and continue.` },
                  }));
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </MemoryRouter>
  );
}

describe('Copilot disambiguation hyperlinks', () => {
  let handler: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    handler = vi.fn();
    window.addEventListener('copilot-chip-click', handler as any);
  });
  afterEach(() => {
    window.removeEventListener('copilot-chip-click', handler as any);
  });

  it('preserves custom deal:// hrefs (does not strip them to empty)', () => {
    render(<Renderer markdown={'[Gabb Wireless (Proposal)](deal://abc-123)'} />);
    const link = screen.getByText(/Gabb Wireless/).closest('a')!;
    expect(link.getAttribute('href')).toBe('deal://abc-123');
  });

  it('clicking a deal:// link dispatches copilot-chip-click with the deal id', () => {
    render(<Renderer markdown={'[Gabb Wireless](deal://abc-123)'} />);
    fireEvent.click(screen.getByText('Gabb Wireless'));
    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.prompt).toContain('abc-123');
    expect(detail.prompt).toContain('Gabb Wireless');
    expect(detail.prompt.toLowerCase()).toContain('deal');
  });

  it('clicking a naitive://deals/<id> link resolves to a deal selection', () => {
    render(<Renderer markdown={'[Gabb Wireless 2](naitive://deals/xyz-999)'} />);
    fireEvent.click(screen.getByText('Gabb Wireless 2'));
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.prompt).toContain('xyz-999');
    expect(detail.prompt.toLowerCase()).toContain('deal');
  });
});