import { Flag, Check, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useFlagNotes } from '@/hooks/useFlagNotes';
import { useFlagAuthors } from '@/hooks/useFlagAuthors';

interface DealFlagLogProps {
  dealId: string;
}

export function DealFlagLog({ dealId }: DealFlagLogProps) {
  const { flagNotes, activeFlags, resolvedFlags, isLoading } = useFlagNotes(dealId);
  const authorIds = flagNotes.map(f => f.user_id).filter(Boolean) as string[];
  const authors = useFlagAuthors(authorIds, true);

  if (isLoading) return null;

  if (flagNotes.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Flag Log
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">No flags yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flag className="h-4 w-4" />
          Flag Log
          {activeFlags.length > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
              {activeFlags.length} active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {flagNotes.map((flag) => {
            const author = flag.user_id ? authors[flag.user_id] : null;
            return (
              <div
                key={flag.id}
                className={`flex items-start gap-3 p-2 rounded-lg border text-sm ${
                  flag.resolved
                    ? 'bg-muted/30 border-border/50'
                    : 'bg-muted/50 border-border'
                }`}
              >
                <div className={`mt-0.5 shrink-0 ${flag.resolved ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {flag.resolved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Flag className="h-4 w-4 fill-current" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className={`break-words ${flag.resolved ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {flag.note}
                  </p>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    {author && (
                      <div className="flex items-center gap-1">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={author.avatarUrl || undefined} />
                          <AvatarFallback className="text-[7px]">
                            {author.displayName?.[0]?.toUpperCase() || <User className="h-2.5 w-2.5" />}
                          </AvatarFallback>
                        </Avatar>
                        <span>{author.displayName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{format(new Date(flag.created_at), 'MMM d, yyyy')}</span>
                    </div>
                    {flag.resolved && flag.resolved_at && (
                      <div className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        <span>Resolved {format(new Date(flag.resolved_at), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
