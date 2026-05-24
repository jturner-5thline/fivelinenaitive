import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestedReplyCards, type SuggestedReply } from '../SuggestedReplyCards';

const SUGGESTIONS: SuggestedReply[] = [
  {
    id: 'tone-balanced',
    toneKey: 'balanced',
    label: 'Recommended',
    body: 'Thanks for the update — confirming we are aligned for Wednesday.',
  },
  {
    id: 'tone-concise',
    toneKey: 'concise',
    label: 'Shorter',
    body: 'Confirmed for Wednesday. Thanks.',
  },
];

describe('Draft Reply → Inline composer contract', () => {
  it('renders >= 2 suggested-reply radio cards from generate_draft_options', () => {
    render(
      <SuggestedReplyCards
        suggestions={SUGGESTIONS}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('radio', { name: /Recommended/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Shorter/i })).toBeInTheDocument();
  });

  it('selecting a card invokes onSelect with the card id', () => {
    const onSelect = vi.fn();
    render(
      <SuggestedReplyCards
        suggestions={SUGGESTIONS}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Recommended/i }));
    expect(onSelect).toHaveBeenCalledWith('tone-balanced');
  });

  it('marks the selected card with aria-checked=true', () => {
    render(
      <SuggestedReplyCards
        suggestions={SUGGESTIONS}
        selectedId="tone-concise"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: /Shorter/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /Recommended/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows a Generating… indicator and disables the card while loading', () => {
    render(
      <SuggestedReplyCards
        suggestions={[
          { ...SUGGESTIONS[0], body: '', loading: true },
          SUGGESTIONS[1],
        ]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/Generating…/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Recommended/i })).toBeDisabled();
  });

  it('renders nothing when no suggestions are provided', () => {
    const { container } = render(
      <SuggestedReplyCards suggestions={[]} selectedId={null} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('Draft Reply event contract (no pop-up)', () => {
  it('Draft Reply dispatches the inline-draft event, never the popout-draft event', () => {
    // This guards against a regression where Draft Reply re-routes to
    // PopOutComposer. The legacy popout-draft listener has been removed
    // from EmailListAndDetail; AiAssistSidebar's onOpenDraft now emits
    // `naitive:ai-assist:open-inline-draft` exclusively.
    const popoutSpy = vi.fn();
    const inlineSpy = vi.fn();
    window.addEventListener('naitive:ai-assist:open-popout-draft', popoutSpy);
    window.addEventListener('naitive:ai-assist:open-inline-draft', inlineSpy);

    window.dispatchEvent(
      new CustomEvent('naitive:ai-assist:open-inline-draft', {
        detail: { threadId: 'thread-vista' },
      }),
    );

    expect(inlineSpy).toHaveBeenCalledTimes(1);
    expect(popoutSpy).not.toHaveBeenCalled();

    window.removeEventListener('naitive:ai-assist:open-popout-draft', popoutSpy);
    window.removeEventListener('naitive:ai-assist:open-inline-draft', inlineSpy);
  });
});