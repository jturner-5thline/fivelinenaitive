import { cn } from '@/lib/utils';

interface FlexChangedFieldWrapperProps {
  fieldKey: string;
  changedFields?: Set<string>;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a field with a gentle highlight ring when it has changed since the last FLEx sync.
 */
export function FlexChangedFieldWrapper({ fieldKey, changedFields, children, className }: FlexChangedFieldWrapperProps) {
  const isChanged = changedFields?.has(fieldKey) ?? false;

  if (!isChanged) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn(
        "relative rounded-md ring-1 ring-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10 p-0.5 -m-0.5 transition-all",
        className
      )}
    >
      {children}
    </div>
  );
}
