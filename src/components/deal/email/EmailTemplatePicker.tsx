import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Plus, Settings, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEmailSnippets, type EmailSnippetInsert } from '@/hooks/useEmailSnippets';
import { cn } from '@/lib/utils';

interface EmailTemplatePickerProps {
  onInsert: (subject: string, body: string) => void;
  triggerClassName?: string;
}

// Pre-built templates for when user has none
const DEFAULT_TEMPLATES = [
  {
    name: 'Lender Outreach',
    category: 'outreach',
    subject: 'Introduction – {{deal_name}} Financing Opportunity',
    body: `Dear {{recipient_name}},

I hope this message finds you well. I'm reaching out regarding a financing opportunity that aligns well with your lending criteria.

{{deal_name}} is seeking a facility and I believe your platform would be an excellent fit. I'd welcome the opportunity to share more details.

Would you have time for a brief call this week?

Best regards,
{{my_name}}`,
  },
  {
    name: 'Follow Up',
    category: 'follow-up',
    subject: 'Re: Following Up – {{deal_name}}',
    body: `Hi {{recipient_name}},

I wanted to follow up on our previous conversation regarding {{deal_name}}. Have you had a chance to review the materials I shared?

I'm happy to provide any additional information or schedule a call at your convenience.

Best,
{{my_name}}`,
  },
  {
    name: 'Deal Introduction',
    category: 'outreach',
    subject: 'New Opportunity: {{deal_name}} – {{company_name}}',
    body: `Hi {{recipient_name}},

I'm pleased to introduce a new financing opportunity that I think would be of interest to your team.

Company: {{company_name}}
Deal: {{deal_name}}

I've attached the preliminary overview for your review. Please let me know if you'd like to schedule a management call.

Looking forward to your thoughts.

Best regards,
{{my_name}}`,
  },
  {
    name: 'Due Diligence Request',
    category: 'process',
    subject: 'DD Checklist – {{deal_name}}',
    body: `Hi {{recipient_name}},

Thank you for your interest in {{deal_name}}. As we move forward, I'd like to share the due diligence checklist for your review.

Please find the outstanding items below. Let me know if you need any clarification or additional materials.

Best,
{{my_name}}`,
  },
  {
    name: 'Term Sheet Follow-Up',
    category: 'process',
    subject: 'Term Sheet Review – {{deal_name}}',
    body: `Hi {{recipient_name}},

Thank you for sending over the term sheet for {{deal_name}}. I've had a chance to review the key terms and have a few comments I'd like to discuss.

Could we schedule a call this week to walk through the details?

Best regards,
{{my_name}}`,
  },
];

// Render merge field tokens as styled chips
function renderBodyPreview(text: string, maxLen = 100) {
  const truncated = text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  return truncated.replace(/\{\{([^}]+)\}\}/g, '[$1]');
}

export function EmailTemplatePicker({ onInsert, triggerClassName }: EmailTemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { snippets, createSnippet } = useEmailSnippets();

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Merge default templates with user snippets (user snippets take priority by name)
  const userSnippetNames = new Set(snippets.map(s => s.name.toLowerCase()));
  const allTemplates = [
    ...snippets.map(s => ({
      name: s.name,
      category: s.category || 'custom',
      subject: '', // snippets don't have subject
      body: s.body,
      isUserTemplate: true,
      id: s.id,
    })),
    ...DEFAULT_TEMPLATES
      .filter(t => !userSnippetNames.has(t.name.toLowerCase()))
      .map(t => ({ ...t, isUserTemplate: false, id: t.name })),
  ];

  const filtered = allTemplates.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q);
  });

  const handleSelect = (template: typeof allTemplates[0]) => {
    onInsert(template.subject, template.body);
    setOpen(false);
  };

  const handleCreateTemplate = () => {
    if (!newName.trim() || !newBody.trim()) return;
    createSnippet.mutate({
      name: newName.trim(),
      body: newBody.trim(),
      category: 'custom',
    });
    setCreateOpen(false);
    setNewName('');
    setNewSubject('');
    setNewBody('');
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'outreach': return 'bg-primary/10 text-primary border-primary/20';
      case 'follow-up': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'process': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('gap-1.5 text-muted-foreground h-7 text-xs', triggerClassName)}
              >
                <FileText className="h-3 w-3" />
                Templates
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Insert email template</TooltipContent>
        </Tooltip>

        <PopoverContent
          side="top"
          align="start"
          className="w-[360px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="h-8 text-xs pl-7 bg-transparent"
              />
            </div>
          </div>

          <ScrollArea className="max-h-[300px]">
            {filtered.length === 0 ? (
              <div className="p-4 text-center">
                <FileText className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No matching templates</p>
              </div>
            ) : (
              <div className="p-1">
                {filtered.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template)}
                    className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {template.name}
                      </span>
                      <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5', getCategoryColor(template.category))}>
                        {template.category}
                      </Badge>
                      {template.isUserTemplate && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                          custom
                        </Badge>
                      )}
                      <ChevronRight className="h-3 w-3 text-muted-foreground/30 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {template.subject && (
                      <p className="text-[10px] text-muted-foreground/80 truncate mb-0.5">
                        Subject: {renderBodyPreview(template.subject, 60)}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                      {renderBodyPreview(template.body)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <Separator />
          <div className="p-1.5 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 gap-1.5 text-xs h-8 justify-start"
              onClick={() => { setOpen(false); setCreateOpen(true); }}
            >
              <Plus className="h-3 w-3" />
              Create Template
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Create Template Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Create Email Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Template Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Lender Outreach"
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Message Body</Label>
              <div className="mt-1">
                <Textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Write your template... Use {{recipient_name}}, {{company_name}}, {{deal_name}}, {{my_name}} as merge fields."
                  className="min-h-[160px] text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {['{{recipient_name}}', '{{company_name}}', '{{deal_name}}', '{{my_name}}'].map(token => (
                  <button
                    key={token}
                    onClick={() => setNewBody(prev => prev + token)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    {token.replace(/\{\{|\}\}/g, '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateTemplate} disabled={!newName.trim() || !newBody.trim()}>
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
