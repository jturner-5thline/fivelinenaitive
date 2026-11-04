import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntitySearchModal } from './EntitySearchModal';

afterEach(cleanup);
const base = { open: true, onClose: vi.fn(), title: 'Link company', onConfirm: vi.fn() };
describe('Company picker interactions', () => {
  it('uses server results even when the match is an alternate domain', () => {
    const onSearchChange = vi.fn();
    render(<EntitySearchModal {...base} onSearchChange={onSearchChange} options={[{ id: 'boa', label: 'Bank of America Corporation', sublabel: 'bofaml.com' }]} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bofa.com' } });
    expect(onSearchChange).toHaveBeenLastCalledWith('bofa.com');
    fireEvent.click(screen.getByRole('button', { name: /Bank of America Corporation/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Link (1)' }));
    expect(base.onConfirm).toHaveBeenCalledWith(['boa']);
  });
  it('retains local filtering for existing non-company consumers', () => {
    render(<EntitySearchModal {...base} options={[{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }]} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Beta' } });
    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });
  it('clears selection when changing pages', () => {
    const onPageChange = vi.fn();
    render(<EntitySearchModal {...base} onPageChange={onPageChange} totalPages={2} options={[{ id: 'a', label: 'Alpha' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next results' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: /^Link$/ })).toBeDisabled();
  });
  it('offers retry and blocks confirmation on errors', () => {
    const onRetry = vi.fn();
    render(<EntitySearchModal {...base} error="Unable to load companies" onRetry={onRetry} options={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /^Link$/ })).toBeDisabled();
  });
});