import { memo } from 'react';
import { Clock } from 'lucide-react';
import type { RoleMode, ThemeMode, ActiveTab } from './types';
import { fmtShort } from './formatters';

interface HeaderProps {
  role: RoleMode;
  theme: ThemeMode;
  activeTab: ActiveTab;
  cashIn: number;
  cashOut: number;
  netChange: number;
  kpiRangeLabel?: string;
  peakCash?: { value: number; weekEnding: string; weekKey: string } | null;
  lowCash?: { value: number; weekEnding: string; weekKey: string } | null;
  cautionThreshold?: number;
  approachingThreshold?: number;
  undoCount: number;
  activityCount: number;
  onRoleChange: (role: RoleMode) => void;
  onThemeToggle: () => void;
  onTabChange: (tab: ActiveTab) => void;
  onUndo: () => void;
  onOpenActivityLog: () => void;
  onConfigureScheduled?: () => void;
}

function LogoSVG() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="7" fill="var(--color-primary)" fillOpacity="0.15" />
      <text x="7" y="24" fill="var(--color-primary)" fontWeight="700" fontSize="16" fontFamily="Inter, sans-serif">FL</text>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.69 3L3 13" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export const CashFlowHeader = memo(function CashFlowHeader({
  role, theme, activeTab, cashIn, cashOut, netChange, kpiRangeLabel,
  peakCash, lowCash,
  cautionThreshold = 100_000, approachingThreshold = 150_000,
  undoCount, activityCount, onRoleChange, onThemeToggle,
  onTabChange, onUndo, onOpenActivityLog, onConfigureScheduled,
}: HeaderProps) {
  const fmtWeekOf = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return '';
    return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };
  const lowColor = lowCash
    ? (lowCash.value < cautionThreshold
        ? 'var(--color-negative)'
        : lowCash.value < approachingThreshold
          ? 'var(--color-warning)'
          : 'var(--color-positive)')
    : 'var(--color-text-muted)';
  return (
    <>
      <div className="cf-header">
        <div className="cf-kpi-row">
          <div className="cf-kpi">
            <div className="cf-kpi-label">Cash In</div>
            <div className="cf-kpi-value" style={{ color: 'var(--color-positive)' }} title={kpiRangeLabel}>{fmtShort(cashIn)}</div>
            {kpiRangeLabel && <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 2 }}>{kpiRangeLabel}</div>}
          </div>
          <div className="cf-kpi">
            <div className="cf-kpi-label">Cash Out</div>
            <div className="cf-kpi-value" style={{ color: 'var(--color-negative)' }} title={kpiRangeLabel}>-{fmtShort(Math.abs(cashOut))}</div>
            {kpiRangeLabel && <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 2 }}>{kpiRangeLabel}</div>}
          </div>
          <div className="cf-kpi">
            <div className="cf-kpi-label">Net Change</div>
            <div className="cf-kpi-value" style={{ color: netChange >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }} title={kpiRangeLabel}>
              {fmtShort(netChange)}
            </div>
            {kpiRangeLabel && <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 2 }}>{kpiRangeLabel}</div>}
          </div>
          <div className="cf-kpi" title="Highest Ending Cash in the visible window (Weeks Past + Weeks Future)">
            <div className="cf-kpi-label">Peak Cash</div>
            <div className="cf-kpi-value" style={{ color: 'var(--color-positive)' }}>
              {peakCash ? fmtShort(peakCash.value) : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 2 }}>
              {peakCash ? fmtWeekOf(peakCash.weekEnding) : '\u00A0'}
            </div>
          </div>
          <div
            className={`cf-kpi${lowCash && lowCash.value < cautionThreshold ? ' cf-kpi-pulse' : ''}`}
            title="Lowest Ending Cash in the visible window (Weeks Past + Weeks Future)"
          >
            <div className="cf-kpi-label">Low Cash</div>
            <div className="cf-kpi-value" style={{ color: lowColor }}>
              {lowCash ? fmtShort(lowCash.value) : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-faint)', marginTop: 2 }}>
              {lowCash ? fmtWeekOf(lowCash.weekEnding) : '\u00A0'}
            </div>
          </div>
        </div>

        <div className="cf-actions">
          <div className="cf-role-toggle">
            <button className={`cf-role-btn ${role === 'admin' ? 'active' : ''}`} onClick={() => onRoleChange('admin')}>
              <ShieldIcon /> Admin
            </button>
            <button className={`cf-role-btn ${role === 'viewer' ? 'active' : ''}`} onClick={() => onRoleChange('viewer')}>
              <EyeIcon /> My View
            </button>
          </div>

          <button className="cf-icon-btn" onClick={onUndo} disabled={undoCount === 0} title={`Undo (${undoCount})`}>
            <UndoIcon />
          </button>

          <button className="cf-icon-btn" onClick={onOpenActivityLog} title="Activity Log">
            <Clock size={16} />
          </button>

          <span className="cf-timestamp">Updated: Mar 8, 2026, 10:31 AM</span>
        </div>
      </div>

    </>
  );
});
