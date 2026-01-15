import { useCopyProtection } from '@/hooks/useCopyProtection';

interface CopyProtectionProps {
  children: React.ReactNode;
  enabled?: boolean;
}

export const CopyProtection = ({ children, enabled = true }: CopyProtectionProps) => {
  useCopyProtection(enabled);

  return (
    <div
      className={enabled ? 'select-none' : ''}
      style={enabled ? { 
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      } : {}}
    >
      {children}
    </div>
  );
};
