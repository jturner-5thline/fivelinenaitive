import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DealTasksPanel } from '../DealTasksPanel';
import { OutstandingItems } from '../OutstandingItems';
import type { OutstandingItem } from '@/hooks/useOutstandingItems';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useDealTasks', () => ({ useDealTasks: () => ({ tasks: [{ id: 'task-1', title: 'Review finances', status: 'pending' }], isLoading: false, createTask: vi.fn(), updateTaskStatus: vi.fn(), deleteTask: vi.fn() }) }));
vi.mock('@/hooks/useTeamMembers', () => ({ useTeamMembers: () => [] }));
vi.mock('@/hooks/useDealManagerId', () => ({ useDealManagerId: () => 'user-1' }));
vi.mock('@/components/tasks/SharedTaskDrawer', () => ({ SharedTaskDrawer: () => null }));
vi.mock('@/hooks/useOutstandingItemComments', () => ({ useOutstandingItemComments: () => ({ comments: [], isLoading: false, addComment: vi.fn(), deleteComment: vi.fn() }) }));
vi.mock('@/components/tasks/MentionTextarea', () => ({ MentionText: ({ text }: { text: string }) => <span>{text}</span>, MentionTextarea: () => null }));
vi.mock('@/components/ui/naitive-date-picker', () => ({ NaitiveDatePicker: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) => <input aria-label="ETA" value={value || ''} disabled={disabled} onChange={event => onChange(event.target.value)} /> }));

const base: OutstandingItem = { id: 'item-1', text: 'Tax returns', received: false, approved: false, completed: false, requestedBy: ['Sample Lender'], deliveredToLenders: [], createdAt: '2026-10-01', position: 0, priority: 'normal' };
afterEach(cleanup);
function setup(readOnly = false, empty = false) {
  const update = vi.fn(); const remove = vi.fn(); const bulk = vi.fn(); const checklist = vi.fn(); const move = vi.fn(); const toggle = vi.fn();
  function Harness() {
    const [items, setItems] = useState(empty ? [] : [base, { ...base, id: 'item-2', text: 'Debt schedule', position: 1 }]);
    const onUpdate = (id: string, updates: Partial<OutstandingItem>) => { update(id, updates); setItems(previous => previous.map(item => item.id === id ? { ...item, ...updates } : item)); };
    return <DealTasksPanel dealId="deal-1" openItems={items} openItemsReadOnly={readOnly} openItemsReadOnlyReason="Closed Won" onToggleOpenItem={toggle} onUpdateOpenItem={onUpdate} onDeleteOpenItem={remove} onMoveOpenItem={move} onAddOpenItem={vi.fn()} renderOpenItemsManager={id => <OutstandingItems collapsed={false} initialItemId={id || undefined} items={items} lenderNames={['Sample Lender']} onAdd={vi.fn()} onUpdate={onUpdate} onDelete={remove} onBulkAdd={bulk} onApplyDefaultChecklist={checklist} readOnly={readOnly} />} />;
  }
  render(<Harness />);
  return { update, remove, bulk, checklist, move, toggle };
}
describe('merged Open Items controls', () => {
  it('preserves All, Tasks, Open Items and search', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /^Tasks$/ }));
    expect(screen.queryByText('Tax returns')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Open Items/ }));
    expect(screen.queryByText('Review finances')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search open items...'), { target: { value: 'Tax' } });
    expect(screen.getByText('Tax returns')).toBeTruthy(); expect(screen.queryByText('Debt schedule')).toBeNull();
  });
  it('calls actual status, completion, delete and reorder callbacks', () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Received: Tax returns' }));
    expect(callbacks.update).toHaveBeenCalledWith('item-1', { received: true });
    fireEvent.click(screen.getByRole('button', { name: 'Submitted: Tax returns' }));
    expect(callbacks.update).toHaveBeenCalledWith('item-1', { approved: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete open item: Tax returns' }));
    expect(callbacks.toggle).toHaveBeenCalledWith('item-1', true);
    fireEvent.click(screen.getByRole('button', { name: 'Move down: Tax returns' }));
    expect(callbacks.move).toHaveBeenCalledWith('item-1', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete open item: Tax returns' }));
    expect(callbacks.remove).toHaveBeenCalledWith('item-1');
  });
  it('opens the real editor and updates ETA', () => {
    const { update } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit open item: Tax returns' }));
    expect(screen.getByRole('heading', { name: 'Tax returns' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ETA'), { target: { value: '2026-11-01' } });
    expect(update).toHaveBeenCalledWith('item-1', { eta: '2026-11-01' });
  });
  it('reuses bulk addition with actual texts and requesters', () => {
    const { bulk } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Open Items' }));
    fireEvent.click(screen.getByRole('button', { name: /^Bulk Add$/ }));
    const textarea = document.querySelector('textarea');
    if (!textarea) throw new Error('Missing bulk input');
    fireEvent.change(textarea, { target: { value: 'One\nTwo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import Items' }));
    expect(bulk).toHaveBeenCalledWith(['One', 'Two'], []);
  });
  it('keeps management and default checklist available on empty lists', () => {
    const { checklist } = setup(false, true);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Open Items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Checklist' }));
    expect(checklist).toHaveBeenCalledOnce();
  });
  it('prevents writes and disables the real editor on locked deals', () => {
    const { update, remove, move, toggle } = setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Received: Tax returns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete open item: Tax returns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move down: Tax returns' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete open item: Tax returns' }));
    expect(update).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled(); expect(toggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit open item: Tax returns' }));
    expect(screen.getByLabelText('ETA')).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Received$/ })).toBeDisabled();
  });
});