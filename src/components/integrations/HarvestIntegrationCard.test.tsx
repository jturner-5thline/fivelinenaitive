import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { HarvestIntegrationCard } from './HarvestIntegrationCard';
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), canSync: true }));
vi.mock('@/hooks/useHarvest', () => ({
  useHarvestStatus: () => ({ data: { connected: true, canSync: mocks.canSync, state: { total_entries: 11746, last_synced_at: '2026-11-16T00:00:00Z' } } }),
  useHarvestSync: () => ({ mutate: mocks.mutate, isPending: false }),
}));
it('runs sync only after an explicit button click', () => {
  mocks.canSync = true;
  render(<HarvestIntegrationCard />);
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }));
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
});
it('disables syncing for readers', () => {
  mocks.canSync = false;
  render(<HarvestIntegrationCard />);
  expect(screen.getByRole('button', { name: 'Sync Now' })).toBeDisabled();
});