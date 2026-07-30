/* @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

let claapEnabled = false;
const fetchRecordings = vi.fn();
const getRecording = vi.fn();
const linkRecording = vi.fn();
const unlinkRecording = vi.fn();

vi.mock('@/hooks/useClaapIntegration', () => ({
  useClaapIntegration: () => ({ isEnabled: claapEnabled }),
}));

vi.mock('@/hooks/useClaapRecordings', () => ({
  useClaapRecordings: () => ({
    recordings: [],
    loading: false,
    fetchRecordings,
    getRecording,
  }),
}));

vi.mock('@/hooks/useDealClaapRecordings', () => ({
  useDealClaapRecordings: () => ({
    linkedRecordings: [],
    linkedRecordingIds: [],
    linkRecording,
    unlinkRecording,
  }),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MeetingsSection } from '../MeetingsSection';

describe('MeetingsSection', () => {
  beforeEach(() => {
    claapEnabled = false;
    fetchRecordings.mockReset();
    getRecording.mockReset().mockResolvedValue(null);
    linkRecording.mockReset().mockResolvedValue(true);
    unlinkRecording.mockReset();
  });

  it('always renders the Meetings section with an add action', () => {
    const { rerender } = render(<MeetingsSection dealId="deal-1" />);
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add meeting/i })).toBeInTheDocument();

    claapEnabled = true;
    expect(() => rerender(<MeetingsSection dealId="deal-1" />)).not.toThrow();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
  });

  it('links a pasted Claap share URL with the recording id fallback', async () => {
    claapEnabled = true;
    render(<MeetingsSection dealId="deal-1" />);

    fireEvent.change(screen.getByPlaceholderText('https://app.claap.io/…'), {
      target: { value: 'https://app.claap.io/5th-line/odk-5th-line-kick-off-call-c-Ep7dCCCqK8-zYZ1frBaISQu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(() => {
      expect(linkRecording).toHaveBeenCalledWith(expect.objectContaining({
        id: 'zYZ1frBaISQu',
        title: 'Odk 5th Line Kick Off Call',
        url: 'https://app.claap.io/5th-line/odk-5th-line-kick-off-call-c-Ep7dCCCqK8-zYZ1frBaISQu',
      }));
    });
  });
});