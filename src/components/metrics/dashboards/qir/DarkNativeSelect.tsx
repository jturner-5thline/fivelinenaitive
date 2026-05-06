import React from 'react';

/**
 * DarkNativeSelect — shared dark-themed native <select> for Insights filters.
 *
 * Use this everywhere on the Insights page instead of styling individual
 * <select> elements. It guarantees the trigger, border, radius, padding, hover
 * state, and the native option panel all match across the platform.
 *
 * Renders a real <select> (no Radix popover) so it stays lightweight and
 * keyboard-accessible with zero portal cost.
 */

export type DarkNativeSelectSize = 'sm' | 'md';

export interface DarkNativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: DarkNativeSelectSize;
}

const SIZES: Record<DarkNativeSelectSize, { fontSize: number; padding: string; paddingRight: number; borderRadius: number }> = {
  sm: { fontSize: 10, padding: '3px 6px', paddingRight: 18, borderRadius: 5 },
  md: { fontSize: 11, padding: '4px 8px', paddingRight: 22, borderRadius: 6 },
};

const CARET =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%23d0eaff' d='M0 0l5 6 5-6z'/></svg>\")";

export const DARK_SELECT_OPTION_STYLE: React.CSSProperties = {
  background: '#0f1c34',
  color: '#d0eaff',
};

export const DarkNativeSelect = React.forwardRef<HTMLSelectElement, DarkNativeSelectProps>(
  function DarkNativeSelect({ size = 'sm', style, className, disabled, ...rest }, ref) {
    const sz = SIZES[size];
    const merged: React.CSSProperties = {
      fontSize: sz.fontSize,
      padding: sz.padding,
      paddingRight: sz.paddingRight,
      borderRadius: sz.borderRadius,
      background: 'rgba(20,80,160,0.35)',
      color: '#d0eaff',
      border: '1px solid rgba(40,120,200,0.4)',
      outline: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      colorScheme: 'dark',
      appearance: 'none',
      WebkitAppearance: 'none',
      MozAppearance: 'none',
      backgroundImage: CARET,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 6px center',
      transition: 'background-color 120ms ease, border-color 120ms ease',
      opacity: disabled ? 0.5 : 1,
      ...style,
    };
    return (
      <select
        ref={ref}
        disabled={disabled}
        className={className ? `dark-native-select ${className}` : 'dark-native-select'}
        style={merged}
        {...rest}
      />
    );
  },
);

/** Convenience wrapper so call sites don't need to import the option style. */
export function DarkOption(props: React.OptionHTMLAttributes<HTMLOptionElement>) {
  const { style, ...rest } = props;
  return <option style={{ ...DARK_SELECT_OPTION_STYLE, ...style }} {...rest} />;
}