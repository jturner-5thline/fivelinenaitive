import { forwardRef, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import naitiveAiIcon from '@/assets/naitive-ai-icon.png';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  onExtraKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: RefObject<HTMLTextAreaElement>;
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
  /**
   * Optional label for the active agent handling the message. When set,
   * a small chip renders inside the bar (before the ⌘J hint) so the user
   * can see the current routing context at a glance.
   */
  activeAgentLabel?: string;
  activeAgentEmoji?: string;
  /** Optional controls rendered just before the ⌘J hint (e.g. prompt history). */
  trailingSlot?: ReactNode;
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
    activeAgentLabel,
    activeAgentEmoji,
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
        'group relative',
        // Multi-line composer: keep the resting pill height, but allow the
        // bar to grow downward when the textarea wraps. Rounded radius is
        // pinned to the resting half-height so the shape stays consistent
        // when expanded instead of warping into giant semicircles.
        'min-h-11 rounded-[22px]',
        'flex items-center gap-3 pl-1.5 pr-4 py-1',
        'text-left flex-none shrink-0',
        'opacity-70 hover:opacity-100 focus-within:opacity-100',
        'transition-[opacity,box-shadow] duration-200 ease-out',
        'hover:shadow-[0_16px_40px_rgba(8,18,42,0.6),0_4px_12px_rgba(37,99,235,0.18),inset_0_1px_0_rgba(255,255,255,0.10),0_0_0_1px_rgba(59,130,246,0.32)]',
        'animate-in fade-in duration-150',
        className,
      )}
      style={{
        background:
          'linear-gradient(135deg, rgba(12, 22, 48, 0.78) 0%, rgba(14, 18, 32, 0.62) 45%, rgba(18, 36, 72, 0.72) 100%)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        border: '1px solid rgba(120, 165, 245, 0.28)',
        boxShadow:
          '0 10px 32px rgba(8, 18, 42, 0.5), 0 2px 8px rgba(37, 99, 235, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(96, 145, 230, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.25)',
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
          className="h-5 w-5 opacity-[0.14] transition-opacity duration-200 group-hover:opacity-[0.2]"
          style={{ filter: 'brightness(1.16) contrast(1.05)' }}
        />
      </span>

      {/* Gradient logo badge (open panel) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={logoAriaLabel}
            title={logoAriaLabel}
            onClick={(e) => {
              e.stopPropagation();
              onLogoClick?.(e);
            }}
            className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[0_2px_12px_rgba(59,130,246,0.55),0_0_0_1px_rgba(96,165,250,0.35)] cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          >
            <img
              src={naitiveAiIcon}
              alt=""
              className="h-8 w-8"
              style={{ filter: 'brightness(1.16) contrast(1.05)' }}
            />
            {logoOverlay}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{logoAriaLabel}</TooltipContent>
      </Tooltip>

      {/* Search affordance */}
      <SearchIcon className="relative z-10 h-3.5 w-3.5 shrink-0 text-sky-300/55 group-hover:text-sky-200/80 transition-colors" />

      {/* Inline composer — multi-line textarea so Shift+Enter inserts a
          newline, pasted bullet lists keep their breaks, and long prompts
          wrap visually instead of scrolling sideways. Enter (without
          Shift) still submits. Auto-grows up to ~7 lines, then scrolls. */}
      <AskNaitiveBarTextarea
        forwardedRef={inputRef}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onExtraKeyDown={onExtraKeyDown}
        readOnly={readOnly}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        ariaExpanded={ariaExpanded}
        ariaControls={ariaControls}
      />

      {trailingSlot}

      {showShortcutHint && (
        <kbd className="relative z-10 hidden sm:inline-flex items-center gap-0.5 rounded border border-sky-400/20 bg-sky-400/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-sky-200/60 group-hover:text-sky-100/85 transition-colors shrink-0">
          ⌘J
        </kbd>
      )}
    </div>
  );
});

interface AskNaitiveBarTextareaProps {
  forwardedRef?: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onExtraKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
}

/** Auto-resizing single-line-at-rest textarea. */
function AskNaitiveBarTextarea({
  forwardedRef,
  value,
  onChange,
  onSubmit,
  onExtraKeyDown,
  readOnly,
  disabled,
  onFocus,
  onBlur,
  placeholder,
  ariaLabel,
  ariaExpanded,
  ariaControls,
}: AskNaitiveBarTextareaProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);

  const setRef = (el: HTMLTextAreaElement | null) => {
    (internalRef as { current: HTMLTextAreaElement | null }).current = el;
    if (forwardedRef) {
      (forwardedRef as { current: HTMLTextAreaElement | null }).current = el;
    }
  };

  // Resize whenever the controlled value changes (typing, paste, reset).
  useLayoutEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 168; // ~7 lines at 24px line-height
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value]);

  return (
    <textarea
      ref={setRef}
      rows={1}
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
        // Enter submits; Shift+Enter inserts a newline (default behavior).
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onSubmit();
          return;
        }
        if (e.key === 'Escape') {
          if (value) onChange('');
          else internalRef.current?.blur();
          return;
        }
        onExtraKeyDown?.(e);
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-autocomplete={ariaControls ? 'list' : undefined}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className="relative z-10 flex-1 min-w-0 bg-transparent border-0 outline-none resize-none text-[13px] leading-6 font-normal text-white/85 placeholder:text-white/45 py-1"
      style={{ maxHeight: 168 }}
    />
  );
}