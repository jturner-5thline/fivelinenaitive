import { useState } from 'react';
import { Send, Plus, MessageSquare, Clock, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useSupportTickets, useCreateSupportTicket, useTicketComments, useAddTicketComment } from '@/hooks/useHelpCenter';
import { useCompany } from '@/hooks/useCompany';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const statusConfig: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  open: { icon: AlertCircle, color: 'text-blue-500', label: 'Open' },
  pending: { icon: Clock, color: 'text-amber-500', label: 'Pending' },
  resolved: { icon: CheckCircle, color: 'text-green-500', label: 'Resolved' },
  closed: { icon: CheckCircle, color: 'text-muted-foreground', label: 'Closed' },
};

function TicketDetail({ ticketId }: { ticketId: string }) {
  const { data: comments = [], isLoading } = useTicketComments(ticketId);
  const addComment = useAddTicketComment();
  const [newComment, setNewComment] = useState('');

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate({ ticket_id: ticketId, body: newComment }, {
      onSuccess: () => setNewComment(''),
    });
  };

  return (
    <div className="space-y-3 mt-3 border-t border-border/50 pt-3">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className={cn(
              'p-2 rounded text-xs',
              c.author_type === 'support_agent' ? 'bg-primary/5 border border-primary/10' : 'bg-muted/50'
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-[10px] uppercase">
                  {c.author_type === 'support_agent' ? 'Support' : 'You'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(c.created_at), 'MMM d, h:mm a')}
                </span>
              </div>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="text-xs h-8"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <Button size="sm" className="h-8 gap-1" onClick={handleSubmit} disabled={!newComment.trim() || addComment.isPending}>
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function SupportTicketsSection() {
  const { data: tickets = [], isLoading } = useSupportTickets();
  const createTicket = useCreateSupportTicket();
  const { company } = useCompany();
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const handleCreate = () => {
    if (!subject.trim() || !company?.id) return;
    createTicket.mutate({
      subject,
      description,
      priority,
      company_id: company.id,
    }, {
      onSuccess: () => {
        setSubject('');
        setDescription('');
        setPriority('normal');
        setShowNew(false);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4 text-primary" />
          Your Tickets ({tickets.length})
        </h3>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
              <Plus className="h-3 w-3" /> New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium mb-1 block">Subject</label>
                <Input
                  placeholder="Brief summary of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Description</label>
                <Textarea
                  placeholder="Describe the issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={!subject.trim() || createTicket.isPending} className="w-full gap-1.5">
                {createTicket.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Ticket
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Loading tickets...</p>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No support tickets yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a ticket if you need help</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const config = statusConfig[ticket.status] || statusConfig.open;
            const Icon = config.icon;
            const isExpanded = expandedTicket === ticket.id;

            return (
              <Card key={ticket.id}>
                <CardContent className="py-3 px-4">
                  <div
                    className="flex items-center justify-between gap-2 cursor-pointer"
                    onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ticket.subject}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(ticket.created_at), 'MMM d, yyyy')} · {config.label}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[9px]">{ticket.priority}</Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                  {ticket.description && (
                    <p className="text-xs text-muted-foreground mt-2">{ticket.description}</p>
                  )}
                  {isExpanded && <TicketDetail ticketId={ticket.id} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
