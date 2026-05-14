import { forwardRef } from 'react';
import naitiveFavicon from '@/assets/naitive-favicon.png';
import { cn } from '@/lib/utils';

interface NaitiveIconProps extends React.HTMLAttributes<HTMLImageElement> {
  className?: string;
  size?: number;
}

export const NaitiveIcon = forwardRef<HTMLImageElement, NaitiveIconProps>(
  ({ className, size, ...props }, ref) => {
    return (
      <img
        ref={ref}
        src={naitiveFavicon}
        alt=""
        aria-hidden="true"
        className={cn('inline-block shrink-0', className)}
        {...props}
      />
    );
  }
);

NaitiveIcon.displayName = 'NaitiveIcon';
