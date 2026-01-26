import { useCopyProtection } from '@/hooks/useCopyProtection';
import { useAuth } from '@/contexts/AuthContext';

interface CopyProtectionProps {
  children: React.ReactNode;
}

export const CopyProtection = ({ children }: CopyProtectionProps) => {
  const { user } = useAuth();
  
  // Only enable copy protection when user is NOT signed in
  const isProtectionEnabled = !user;
  
  useCopyProtection(isProtectionEnabled);

  return (
    <div
      className={isProtectionEnabled ? 'select-none' : ''}
      style={isProtectionEnabled ? { 
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
