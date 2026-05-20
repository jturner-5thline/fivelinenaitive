import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { InlineEditField } from '../inline-edit-field';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('InlineEditField — autosave + race safety', () => {
  it('coalesces rapid typing into a single persisted final value', async () => {
    const seen: string[] = [];
    // Simulate a slow Supabase write so multiple keystrokes can pile up
    // while the first save is still in flight.
    const onSave = vi.fn(async (v: string) => {
      seen.push(v);
      await new Promise((r) => setTimeout(r, 30));
    });

    render(<InlineEditField value="" onSave={onSave} debounceMs={50} />);

    // Click into edit mode
    fireEvent.click(screen.getByText('Click to edit'));
    const input = screen.getByRole('textbox') as HTMLInputElement;

    // Type 50 characters as fast as possible (well under 1s)
    const text = 'a'.repeat(50);
    for (let i = 1; i <= text.length; i++) {
      fireEvent.change(input, { target: { value: text.slice(0, i) } });
    }
    expect(input.value).toBe(text);

    // Blur flushes pending debounce immediately
    await act(async () => {
      fireEvent.blur(input);
    });

    // Wait for the in-flight write + any queued follow-up to settle
    await waitFor(() => {
      expect(seen[seen.length - 1]).toBe(text);
    });

    // Should never have fired one call per keystroke — coalesced
    expect(onSave.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('reverts to the last saved value on Escape', async () => {
    const onSave = vi.fn();
    render(<InlineEditField value="hello" onSave={onSave} debounceMs={50} />);

    fireEvent.click(screen.getByText('hello'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByText('hello')).toBeInTheDocument();
    // No save fired because debounce was canceled
    await new Promise((r) => setTimeout(r, 120));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('commits on Enter without waiting for the debounce', async () => {
    const onSave = vi.fn();
    render(<InlineEditField value="" onSave={onSave} debounceMs={5000} />);

    fireEvent.click(screen.getByText('Click to edit'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'quick' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('quick'));
  });
});