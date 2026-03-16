import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserEditedFieldWrapperProps {
  isEdited: boolean;
  children: ReactNode;
  className?: string;
}

export function UserEditedFieldWrapper({ isEdited, children, className }: UserEditedFieldWrapperProps) {
  if (!isEdited) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative', className)}>
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary/40" />
      <div className="pl-2">
        {children}
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute -left-1 top-0 h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Pencil className="h-2.5 w-2.5 text-primary/60" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            Manually edited
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
