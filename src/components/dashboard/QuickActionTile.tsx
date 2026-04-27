import { forwardRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface QuickActionTileTheme {
  /** CSS gradient applied as the icon container background. */
  gradient: string;
  /** Stroke / text color applied to the icon. */
  iconColor: string;
}

interface QuickActionTileProps {
  label: ReactNode;
  theme: QuickActionTileTheme;
  /** The lucide icon (or any node). It will inherit `color` from the icon wrapper. */
  icon: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Glassy color-tinted quick-action tile used on the Dashboard hero row.
 * Renders a 72×72 rounded icon container with a per-tile gradient and a
 * soft glassy highlight overlay (via the `.qa-tile-icon::before` utility
 * defined in `index.css`), with a small label beneath.
 */
export const QuickActionTile = forwardRef<HTMLButtonElement, QuickActionTileProps>(
  function QuickActionTile(
    { label, theme, icon, onClick, onKeyDown, ariaLabel, className },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        className={cn(
          'qa-tile group flex flex-col items-center gap-2 cursor-pointer',
          'min-w-[72px] max-w-[90px] flex-1 outline-none',
          'focus-visible:outline-none',
          className,
        )}
      >
        <div
          className="qa-tile-icon w-[72px] h-[72px] rounded-2xl flex items-center justify-center"
          style={{ background: theme.gradient, color: theme.iconColor }}
        >
          {/* Icon inherits stroke/text color from its wrapper. */}
          <span className="relative z-10 inline-flex" aria-hidden="true">
            {icon}
          </span>
        </div>
        <span
          className="text-center"
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: '#c8ccd8',
            lineHeight: 1.3,
          }}
        >
          {label}
        </span>
      </button>
    );
  },
);