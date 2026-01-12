import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveIndicatorProps {
  isSaving: boolean;
  showSuccess?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Subtle save indicator that shows a spinner when saving
 * and optionally a checkmark when complete
 */
export function SaveIndicator({ 
  isSaving, 
  showSuccess = false, 
  className,
  size = 'sm' 
}: SaveIndicatorProps) {
  const sizeClasses = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  
  if (isSaving) {
    return (
      <Loader2 
        className={cn(
          sizeClasses, 
          'animate-spin text-muted-foreground',
          className
        )} 
      />
    );
  }
  
  if (showSuccess) {
    return (
      <Check 
        className={cn(
          sizeClasses, 
          'text-success animate-in fade-in zoom-in duration-200',
          className
        )} 
      />
    );
  }
  
  return null;
}

interface GlobalSaveBarProps {
  isAnySaving: boolean;
}

/**
 * Subtle progress bar at the top of a container
 */
export function GlobalSaveBar({ isAnySaving }: GlobalSaveBarProps) {
  if (!isAnySaving) return null;
  
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden z-50">
      <div className="h-full w-1/3 bg-primary animate-pulse" 
        style={{ 
          animation: 'slideRight 1s ease-in-out infinite'
        }} 
      />
      <style>{`
        @keyframes slideRight {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
