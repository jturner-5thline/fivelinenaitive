import { memo } from 'react';
import type { ActivityLogEntry } from './types';

interface ActivityLogDialogProps {
  open: boolean;
  entries: ActivityLogEntry[];
  onClose: () => void;
}

export const ActivityLogDialog = memo(function ActivityLogDialog({ open, entries, onClose }: ActivityLogDialogProps) {
  if (!open) return null;

  const safeEntries = entries || [];

  return (
    <div className="cf-overlay" onClick={onClose}>
      <div className="cf-dialog" onClick={e => e.stopPropagation()}>
        <div className="cf-dialog-title">Activity Log</div>
        <div className="cf-log-list">
          {safeEntries.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-faint)', padding: '2rem 0', fontSize: 'var(--text-sm)' }}>
              No changes recorded yet
            </div>
          ) : (
            [...safeEntries].reverse().map((entry, i) => (
              <div key={i} className="cf-log-entry">
                <span className="cf-log-time">
                  {new Date(entry.timestamp).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
                <span className="cf-log-user">{entry.user}</span>
                <span className="cf-log-action">{entry.action}</span>
              </div>
            ))
          )}
        </div>
        <div className="cf-dialog-actions">
          <button className="cf-btn cf-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
});
