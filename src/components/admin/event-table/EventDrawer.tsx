import { ReactNode } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface EventDrawerBadge {
  label: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
  icon?: ReactNode;
}

export interface EventDrawerField {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export interface EventDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  timestamp?: string | Date | null;
  badges?: EventDrawerBadge[];
  fields?: EventDrawerField[];
  raw?: unknown;
  rawLabel?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Universal right-side drawer used by every admin event/list table.
 * Keeps the same visual chrome across Activity, Delivery Audit, Audit Log, Errors,
 * Users and Companies so admins always know where to look for "details".
 */
export function EventDrawer({
  open,
  onOpenChange,
  icon,
  title,
  subtitle,
  timestamp,
  badges,
  fields,
  raw,
  rawLabel = "Raw payload",
  children,
  footer,
}: EventDrawerProps) {
  const ts = timestamp ? new Date(timestamp) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="mt-0.5 h-9 w-9 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base leading-tight break-words">
                {title}
              </SheetTitle>
              {subtitle && (
                <SheetDescription className="text-xs mt-1 break-words">
                  {subtitle}
                </SheetDescription>
              )}
              {(badges && badges.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {badges.map((b, i) => (
                    <Badge
                      key={i}
                      variant={b.variant ?? "outline"}
                      className={cn("text-[10px] flex items-center gap-1", b.className)}
                    >
                      {b.icon}
                      {b.label}
                    </Badge>
                  ))}
                </div>
              )}
              {ts && (
                <p
                  className="text-[11px] text-muted-foreground mt-2"
                  title={format(ts, "PPpp")}
                >
                  {format(ts, "PPpp")} · {formatDistanceToNow(ts, { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {fields && fields.length > 0 && (
              <dl className="grid grid-cols-1 gap-3">
                {fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-[120px_1fr] gap-3 items-start">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground pt-0.5">
                      {f.label}
                    </dt>
                    <dd
                      className={cn(
                        "text-sm break-words min-w-0",
                        f.mono && "font-mono text-xs"
                      )}
                    >
                      {f.value ?? <span className="text-muted-foreground">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {children}

            {raw !== undefined && raw !== null && (
              <div className="space-y-2">
                <Separator />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {rawLabel}
                </p>
                <pre className="text-[11px] font-mono bg-muted/40 border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </ScrollArea>

        {footer && (
          <div className="border-t px-6 py-3 bg-muted/20">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Row classes that signal a clickable row that opens the drawer. */
export const eventRowClass =
  "cursor-pointer hover:bg-muted/40 transition-colors";