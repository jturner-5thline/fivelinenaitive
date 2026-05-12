import { forwardRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';

/**
 * AskNaitiveBar — the canonical "Ask naitive AI" search/ask input.
 *
 * This is the single source of truth for the bar's visual treatment
 * (rounded glass pill, gradient logo badge, watermark, search icon,
 * placeholder, ⌘J kbd hint). It is rendered:
 *   • by `CopilotToggleButton` as the floating bottom-pinned bar, and
 *   • inline as a Dashboard widget (replacing the legacy composer).
 *
 * Behavior is delegated via callbacks so the host owns submission, focus,
 * keyboard navigation, and any dropdown/overlay (e.g. suggestions).
 */
export interface AskNaitiveBarProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Custom keydown handler invoked AFTER built-in Enter/Escape handling. */
  onExtraKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: RefObject<HTMLInputElement>;
  placeholder?: string;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  /** Read-only / disabled (e.g. demo mode). */
  readOnly?: boolean;
  disabled?: boolean;
  /** Right-side ⌘J hint. Hidden inline. Defaults to true. */
  showShortcutHint?: boolean;
  /** Optional left-edge resize handle (floating variant only). */
  onResizeStart?: (e: React.PointerEvent) => void;
  onResizeDoubleClick?: () => void;
  /** Click handler for the gradient logo badge on the left. */
  onLogoClick?: (e: React.MouseEvent) => void;
  /** Optional decoration drawn over the logo badge (badge / pulse). */
  logoOverlay?: ReactNode;
  logoAriaLabel?: string;
  /** Inline width override; floating uses pixel width via style. */
  style?: React.CSSProperties;
  className?: string;
  /** Force the focused/full-opacity look (e.g. when the panel is open). */
  forceFocused?: boolean;
  /** Optional data-* attribute hooks. */
  dataTour?: string;
}

export const AskNaitiveBar = forwardRef<HTMLDivElement, AskNaitiveBarProps>(function AskNaitiveBar(
  {
    value,
    onChange,
    onSubmit,
    onFocus,
    onBlur,
    onExtraKeyDown,
    inputRef,
    placeholder = 'Search or ask naitive AI…',
    ariaLabel = 'Search or ask naitive AI',
    ariaExpanded,
    ariaControls,
    readOnly,
    disabled,
    showShortcutHint = true,
    onResizeStart,
    onResizeDoubleClick,
    onLogoClick,
    logoOverlay,
    logoAriaLabel = 'Open naitive AI',
    style,
    className,
    forceFocused,
    dataTour,
  },
  ref,
) {
  return (
    <div
      ref={ref}
      role="search"
      aria-label={ariaLabel}
      data-tour={dataTour}
      className={cn(
        'group relative overflow-hidden',
        'h-11 rounded-full',
        'flex items-center gap-3 pl-1.5 pr-4',
        'text-left flex-none shrink-0',
        'opacity-70 hover:opacity-100 focus-within:opacity-100',
        'transition-[opacity,box-shadow] duration-200 ease-out',
        'hover:shadow-[0_16px_40px_rgba(0,0,0,0.55),0_4px_10px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.10),0_0_0_1px_rgba(0,0,0,0.28)]',
        'animate-in fade-in duration-150',
        className,
      )}
      style={{
        background: 'rgba(14, 16, 24, 0.6)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        boxShadow:
          '0 10px 32px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.25)',
        transition: 'opacity 180ms ease-out',
        opacity: forceFocused ? 1 : undefined,
        ...style,
      }}
      onClick={() => inputRef?.current?.focus()}
    >
      {onResizeStart && (
        <div
          role="separator"
          aria-label="Resize Ask naitive AI bar"
          aria-orientation="vertical"
          onPointerDown={onResizeStart}
          onDoubleClick={onResizeDoubleClick}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity"
          style={{ touchAction: 'none' }}
          title="Drag to resize • Double-click to reset"
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full"
            style={{ background: 'rgba(255,255,255,0.45)' }}
          />
        </div>
      )}

      {/* Centered watermark emblem */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <img
          src={naitiveAiIcon}
          alt=""
          className="h-5 w-5 brightness-0 invert opacity-[0.06] transition-opacity duration-200 group-hover:opacity-[0.09]"
        />
      </span>

      {/* Gradient logo badge (open panel) */}
      <button
        type="button"
        aria-label={logoAriaLabel}
        onClick={(e) => {
          e.stopPropagation();
          onLogoClick?.(e);
        }}
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_10px_hsl(270_65%_55%/0.45)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
        style={{
          background: 'linear-gradient(to right, hsl(270, 65%, 55%), hsl(220, 70%, 62%))',
        }}
      >
        <img src={naitiveAiIcon} alt="" className="h-4 w-4 brightness-0 invert" />
        {logoOverlay}
      </button>

      {/* Search affordance */}
      <SearchIcon className="relative z-10 h-3.5 w-3.5 shrink-0 text-white/40 group-hover:text-white/55 transition-colors" />

      {/* Inline input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (disabled) {
            e.preventDefault();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
            return;
          }
          if (e.key === 'Escape') {
            if (value) onChange('');
            else inputRef?.current?.blur();
            return;
          }
          onExtraKeyDown?.(e);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete={ariaControls ? 'list' : undefined}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        className="relative z-10 flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] font-normal text-white/85 placeholder:text-white/45"
      />

      {showShortcutHint && (
        <kbd className="relative z-10 hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/40 group-hover:text-white/55 transition-colors shrink-0">
          ⌘J
        </kbd>
      )}
    </div>
  );
});