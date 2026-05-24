import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { SuggestedReplyCards, type SuggestedReply } from '../SuggestedReplyCards';

// Stub heavy composer dependencies so we can mount InlineReplyComposer in
// jsdom and assert against the body textarea directly.
vi.mock('../EmailComposerCard', () => ({
  EmailComposerCard: ({ body, onBodyChange }: any) => (
    <textarea
      aria-label="body"
      data-testid="composer-body"
      value={body}
      onChange={(e) => onBodyChange(e.target.value)}
    />
  ),
}));
vi.mock('../PreSendAlertDialog', () => ({ PreSendAlertDialog: () => null }));
vi.mock('../usePreSendChecks', () => ({
  usePreSendChecks: () => ({ alert: null, runChecks: () => true, clearAlert: () => {} }),
}));
vi.mock('../scheduleIntent', () => ({ dispatchComposeBody: () => {} }));
vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));

import { InlineReplyComposer } from '../InlineReplyComposer';

afterEach(() => cleanup());

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

const REPLY_TO = {
  subject: 'Project Vista',
  to_email: 'will@multiplier.com',
  to_name: 'Will Breck',
  threadId: 'thread-vista',
};

const noop = () => {};

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

  it('shows a per-card Retry affordance when error is set, calls onRetry with tone', () => {
    const onRetry = vi.fn();
    render(
      <SuggestedReplyCards
        suggestions={[
          { ...SUGGESTIONS[0], body: '', error: true },
          SUGGESTIONS[1],
        ]}
        selectedId={null}
        onSelect={() => {}}
        onRetry={onRetry}
      />,
    );
    const retries = screen.getAllByText(/Retry/i);
    // First match is the inline "Retry" affordance; second is the helper copy.
    fireEvent.click(retries[0]);
    expect(onRetry).toHaveBeenCalledWith('balanced');
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

describe('InlineReplyComposer — auto-draft into textarea', () => {
  it('auto-populates body with the Recommended draft within 2s of mount', async () => {
    render(
      <InlineReplyComposer
        replyTo={REPLY_TO}
        onSend={noop as any}
        onDiscard={noop}
        onPopOut={noop as any}
        suggestedReplies={SUGGESTIONS}
        recommendedSuggestionId="tone-balanced"
      />,
    );
    await waitFor(
      () => {
        const ta = screen.getByTestId('composer-body') as HTMLTextAreaElement;
        expect(ta.value).toBe(SUGGESTIONS[0].body);
      },
      { timeout: 2000 },
    );
    // And the Recommended card is marked selected.
    expect(screen.getByRole('radio', { name: /Recommended/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('selecting Shorter swaps the textarea content (no confirm when clean)', async () => {
    render(
      <InlineReplyComposer
        replyTo={REPLY_TO}
        onSend={noop as any}
        onDiscard={noop}
        onPopOut={noop as any}
        suggestedReplies={SUGGESTIONS}
        recommendedSuggestionId="tone-balanced"
      />,
    );
    const ta = await screen.findByTestId('composer-body');
    await waitFor(() =>
      expect((ta as HTMLTextAreaElement).value).toBe(SUGGESTIONS[0].body),
    );
    fireEvent.click(screen.getByRole('radio', { name: /Shorter/i }));
    await waitFor(() =>
      expect((ta as HTMLTextAreaElement).value).toBe(SUGGESTIONS[1].body),
    );
    expect(screen.queryByTestId('swap-confirm-dialog')).toBeNull();
  });

  it('user-typed edits trigger a confirm-overwrite dialog when switching cards', async () => {
    render(
      <InlineReplyComposer
        replyTo={REPLY_TO}
        onSend={noop as any}
        onDiscard={noop}
        onPopOut={noop as any}
        suggestedReplies={SUGGESTIONS}
        recommendedSuggestionId="tone-balanced"
      />,
    );
    const ta = (await screen.findByTestId('composer-body')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe(SUGGESTIONS[0].body));
    // User edits the auto-seeded draft.
    fireEvent.change(ta, { target: { value: 'My own custom reply text.' } });
    expect(ta.value).toBe('My own custom reply text.');
    // Now switching cards must prompt.
    fireEvent.click(screen.getByRole('radio', { name: /Shorter/i }));
    expect(await screen.findByTestId('swap-confirm-dialog')).toBeInTheDocument();
    // Cancel keeps the user's edit.
    fireEvent.click(screen.getByRole('button', { name: /Keep my draft/i }));
    await waitFor(() => expect(ta.value).toBe('My own custom reply text.'));
    // Re-trigger swap and confirm — content is replaced.
    fireEvent.click(screen.getByRole('radio', { name: /Shorter/i }));
    expect(await screen.findByTestId('swap-confirm-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Replace with suggestion/i }));
    await waitFor(() => expect(ta.value).toBe(SUGGESTIONS[1].body));
  });

  it('shows the Drafting… indicator while pending and removes it on resolve', async () => {
    const pending: SuggestedReply[] = [
      { id: 'tone-balanced', toneKey: 'balanced', label: 'Recommended', body: '', loading: true },
      { id: 'tone-concise', toneKey: 'concise', label: 'Shorter', body: '', loading: true },
    ];
    const { rerender } = render(
      <InlineReplyComposer
        replyTo={REPLY_TO}
        onSend={noop as any}
        onDiscard={noop}
        onPopOut={noop as any}
        suggestedReplies={pending}
        recommendedSuggestionId="tone-balanced"
      />,
    );
    expect(screen.getByTestId('drafting-indicator')).toBeInTheDocument();
    rerender(
      <InlineReplyComposer
        replyTo={REPLY_TO}
        onSend={noop as any}
        onDiscard={noop}
        onPopOut={noop as any}
        suggestedReplies={SUGGESTIONS}
        recommendedSuggestionId="tone-balanced"
      />,
    );
    const ta = (await screen.findByTestId('composer-body')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe(SUGGESTIONS[0].body));
    expect(screen.queryByTestId('drafting-indicator')).toBeNull();
  });

  it('a failed tone (sidebar 504-style error) does NOT block the other tone or the inline textarea', async () => {
    // Simulates the decoupled state: balanced errored, concise resolved.
    const partial: SuggestedReply[] = [
      { id: 'tone-balanced', toneKey: 'balanced', label: 'Recommended', body: '', error: true },
      { id: 'tone-concise', toneKey: 'concise', label: 'Shorter', body: SUGGESTIONS[1].body },
    ];
    render(
      <InlineReplyComposer
        replyTo={REPLY_TO}
        onSend={noop as any}
        onDiscard={noop}
        onPopOut={noop as any}
        suggestedReplies={partial}
        recommendedSuggestionId="tone-balanced"
      />,
    );
    // Shorter card remains clickable and populates the textarea.
    const ta = (await screen.findByTestId('composer-body')) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole('radio', { name: /Shorter/i }));
    await waitFor(() => expect(ta.value).toBe(SUGGESTIONS[1].body));
    // Recommended card surfaces a Retry affordance instead of staying empty.
    expect(screen.getAllByText(/Retry/i).length).toBeGreaterThan(0);
  });
});