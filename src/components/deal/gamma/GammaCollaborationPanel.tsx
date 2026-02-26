import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageSquare, CheckCircle2, AlertCircle, XCircle, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Comment {
  id: string;
  generation_id: string;
  user_id: string;
  content: string;
  review_status: string;
  created_at: string;
  profile?: { display_name: string; avatar_url: string | null };
}

interface GammaCollaborationPanelProps {
  generationId: string;
  generationTitle?: string;
}

const STATUS_CONFIG = {
  comment: { label: 'Comment', icon: MessageSquare, variant: 'secondary' as const },
  approved: { label: 'Approved', icon: CheckCircle2, variant: 'default' as const },
  needs_changes: { label: 'Needs Changes', icon: AlertCircle, variant: 'outline' as const },
  rejected: { label: 'Rejected', icon: XCircle, variant: 'destructive' as const },
};

export function GammaCollaborationPanel({ generationId, generationTitle }: GammaCollaborationPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [reviewStatus, setReviewStatus] = useState<string>('comment');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('gamma_generation_comments')
        .select('*')
        .eq('generation_id', generationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for commenters
      const userIds = [...new Set((data || []).map(c => c.user_id))];
      let profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);

        if (profileData) {
          profiles = Object.fromEntries(profileData.map(p => [p.user_id, p]));
        }
      }

      setComments(
        (data || []).map(c => ({
          ...c,
          profile: profiles[c.user_id],
        }))
      );
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchComments(); }, [generationId]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('gamma_generation_comments').insert({
        generation_id: generationId,
        user_id: user.id,
        content: newComment.trim(),
        review_status: reviewStatus,
      });

      if (error) throw error;

      // Update generation review_status if it's a review action
      if (reviewStatus !== 'comment') {
        await supabase.from('gamma_generations')
          .update({ review_status: reviewStatus, review_count: comments.length + 1 })
          .eq('id', generationId);
      }

      setNewComment('');
      setReviewStatus('comment');
      fetchComments();
      toast.success('Comment added');
    } catch (err) {
      toast.error('Failed to add comment');
    } finally {
      setIsSending(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Team Review
        </p>
        {comments.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {comments.length}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {comments.length > 0 && (
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {comments.map(comment => {
                  const config = STATUS_CONFIG[comment.review_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.comment;
                  const Icon = config.icon;
                  return (
                    <div key={comment.id} className="flex gap-2 py-2 px-3 rounded-lg bg-muted/30">
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(comment.profile?.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">
                            {comment.profile?.display_name || 'Unknown'}
                          </span>
                          {comment.review_status !== 'comment' && (
                            <Badge variant={config.variant} className="text-[9px] h-4 px-1.5 gap-0.5">
                              <Icon className="h-2.5 w-2.5" />
                              {config.label}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {new Date(comment.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-foreground mt-0.5">{comment.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          <div className="space-y-2">
            <Textarea
              placeholder="Add a comment or review..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[60px] text-xs resize-none"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <Button
                    key={key}
                    variant={reviewStatus === key ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => setReviewStatus(key)}
                  >
                    <Icon className="h-3 w-3" />
                    {config.label}
                  </Button>
                );
              })}
              <Button
                size="sm"
                className="h-6 px-3 text-[10px] gap-1 ml-auto"
                onClick={handleSubmit}
                disabled={!newComment.trim() || isSending}
              >
                {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
