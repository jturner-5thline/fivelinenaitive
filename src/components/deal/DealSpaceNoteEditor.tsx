import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Mention from '@tiptap/extension-mention';
import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Download, Undo, Redo, Save,
  Table as TableIcon, Image as ImageIcon, Link as LinkIcon,
  CheckSquare, Quote, Minus, IndentIncrease, IndentDecrease,
  Search, Highlighter, Type, X, Replace,
  Plus, Trash2, Keyboard, ChevronDown,
  Printer, FileDown, Maximize2, Minimize2, MessageSquare, History,
  LinkIcon as LenderLink, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DealSpaceNote, NoteVersion } from '@/hooks/useDealSpaceNotes';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { NoteTOC } from './notes/NoteTOC';
import { NoteVersionHistory } from './notes/NoteVersionHistory';
import { MentionTaskDialog } from './notes/MentionTaskDialog';
import mentionSuggestion from './notes/mentionSuggestion';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';

// ─── Ribbon helpers ───
function RibbonBtn({ onClick, isActive, icon: Icon, label, disabled, className }: {
  onClick: () => void; isActive?: boolean; icon: React.ElementType; label: string; disabled?: boolean; className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center h-7 w-7 rounded-sm transition-colors",
            "hover:bg-accent/80 active:bg-accent",
            isActive && "bg-accent text-accent-foreground",
            disabled && "opacity-40 pointer-events-none",
            className,
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
];

function ColorSwatchPicker({ currentColor, onColorChange, icon: Icon, label, underlineColor }: {
  currentColor?: string; onColorChange: (color: string) => void; icon: React.ElementType; label: string; underlineColor?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center justify-center h-7 px-1 rounded-sm hover:bg-accent/80 transition-colors relative" onMouseDown={(e) => e.preventDefault()}>
          <Icon className="h-3.5 w-3.5" />
          <ChevronDown className="h-2.5 w-2.5 ml-0.5 opacity-60" />
          <div className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-full" style={{ backgroundColor: underlineColor || currentColor || 'transparent' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" sideOffset={4}>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
        <div className="grid grid-cols-10 gap-0.5">
          {COLORS.map(color => (
            <button key={color} className={cn("h-[18px] w-[18px] rounded-sm border border-border/50 hover:scale-125 transition-transform", currentColor === color && "ring-1.5 ring-primary ring-offset-1")} style={{ backgroundColor: color }} onMouseDown={(e) => e.preventDefault()} onClick={() => onColorChange(color)} />
          ))}
        </div>
        <button className="w-full text-xs text-muted-foreground hover:text-foreground mt-1.5 py-1 rounded hover:bg-accent/50 transition-colors" onMouseDown={(e) => e.preventDefault()} onClick={() => onColorChange('')}>Reset</button>
      </PopoverContent>
    </Popover>
  );
}

function RibbonDivider() {
  return <div className="w-px h-5 bg-border/60 mx-0.5" />;
}

// ─── Main Editor ───
interface DealSpaceNoteEditorProps {
  note: DealSpaceNote;
  onUpdate: (noteId: string, updates: any) => Promise<void>;
  onDownload: (note: DealSpaceNote) => void;
  dealId: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showComments: boolean;
  onToggleComments: () => void;
  fetchVersions: (noteId: string) => Promise<NoteVersion[]>;
  restoreVersion: (noteId: string, version: NoteVersion) => Promise<void>;
  onRequestComment?: (quoteText: string) => void;
}

export function DealSpaceNoteEditor({
  note, onUpdate, onDownload, dealId,
  isFullscreen, onToggleFullscreen,
  showComments, onToggleComments,
  fetchVersions, restoreVersion,
  onRequestComment,
}: DealSpaceNoteEditorProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(note.title);
  const [isSaving, setIsSaving] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [dealData, setDealData] = useState<any>(null);
  const [lenders, setLenders] = useState<any[]>([]);
  const [mentionDialogOpen, setMentionDialogOpen] = useState(false);
  const [pendingMention, setPendingMention] = useState<{ userId: string; userName: string } | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef(note.content);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seenMentionIdsRef = useRef<Set<string>>(new Set());
  const [selectionToolbar, setSelectionToolbar] = useState<{ top: number; left: number; text: string } | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Initialize seen mentions from existing content
  useEffect(() => {
    const existing = note.content?.match(/data-id="([^"]+)"/g) || [];
    existing.forEach((m) => {
      const id = m.match(/data-id="([^"]+)"/)?.[1];
      if (id) seenMentionIdsRef.current.add(id);
    });
  }, [note.id]);

  // Fetch deal data for slash commands
  useEffect(() => {
    const fetchDealData = async () => {
      const [{ data: deal }, { data: dealLenders }] = await Promise.all([
        supabase.from('deals').select('company, value, stage, contact, deal_type, manager').eq('id', dealId).single(),
        supabase.from('deal_lenders').select('name, stage, quote_amount, quote_rate').eq('deal_id', dealId),
      ]);
      setDealData(deal);
      setLenders(dealLenders || []);
    };
    fetchDealData();
  }, [dealId]);

  // Memoize mention extension to avoid re-render loops
  const mentionExtension = useMemo(() => 
    Mention.configure({
      HTMLAttributes: {
        class: 'mention text-primary font-medium bg-primary/10 rounded px-1 py-0.5 cursor-pointer',
      },
      suggestion: mentionSuggestion,
    }),
  []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline cursor-pointer' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle, Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start typing… Use "@" to mention a team member' }),
      CharacterCount,
      mentionExtension,
    ],
    content: note.content || '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-10 py-6',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
          '[&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/50 [&_th]:font-semibold',
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0',
          '[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2',
          '[&_ul[data-type=taskList]_li_label]:mt-0.5 [&_ul[data-type=taskList]_li_div]:flex-1',
          '[&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
          '[&_hr]:my-6 [&_hr]:border-border',
          '[&_img]:max-w-full [&_img]:rounded-md [&_img]:my-2',
          '[&_a]:text-primary [&_a]:underline',
          '[&_.mention]:text-primary [&_.mention]:font-medium [&_.mention]:bg-primary/10 [&_.mention]:rounded [&_.mention]:px-1 [&_.mention]:py-0.5',
        ),
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files?.length) { event.preventDefault(); Array.from(files).forEach(file => { if (file.type.startsWith('image/')) handleImageUpload(file); }); return true; }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) { for (const item of Array.from(items)) { if (item.type.startsWith('image/')) { event.preventDefault(); const file = item.getAsFile(); if (file) handleImageUpload(file); return true; } } }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Check for newly added mentions
      const html = ed.getHTML();
      const mentionRegex = /data-id="([^"]+)"[^>]*>@([^<]+)</g;
      let match;
      while ((match = mentionRegex.exec(html)) !== null) {
        const mentionId = match[1];
        const mentionName = match[2];
        if (!seenMentionIdsRef.current.has(mentionId)) {
          seenMentionIdsRef.current.add(mentionId);
          setPendingMention({ userId: mentionId, userName: mentionName });
          setMentionDialogOpen(true);
          break; // Only handle one new mention at a time
        }
      }
    },
  }, [note.id, mentionExtension]);

  // Handle mention notification
  const handleMentionNotify = async () => {
    if (!pendingMention || !user || !dealData) return;
    try {
      await supabase.from('flex_notifications').insert({
        user_id: pendingMention.userId,
        deal_id: dealId,
        alert_type: 'mention',
        title: `${dealData.company}: You were mentioned in a note`,
        message: `${user.email} mentioned you in "${note.title}" on the ${dealData.company} deal.`,
      } as any);
      toast({ title: `${pendingMention.userName} has been notified` });
    } catch (err) {
      console.error('Error sending notification:', err);
    }
    setMentionDialogOpen(false);
    setPendingMention(null);
  };

  // Handle mention + task creation
  const handleMentionTask = async (task: { title: string; description: string; due_date?: string }) => {
    if (!pendingMention || !user) return;
    try {
      // Look up the user's company_id
      const { data: memberData } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      const companyId = memberData?.company_id || null;

      // Create task
      const { data: createdTask } = await supabase.from('tasks').insert({
        deal_id: dealId,
        assigned_to: pendingMention.userId,
        assigned_by: user.id,
        title: task.title,
        description: task.description || null,
        due_date: task.due_date || null,
        company_id: companyId,
      } as any).select().single();

      // Also send notification
      await supabase.from('flex_notifications').insert({
        user_id: pendingMention.userId,
        deal_id: dealId,
        alert_type: 'task_assigned',
        title: `${dealData?.company}: Task assigned to you`,
        message: `${user.email} assigned you a task: "${task.title}" on the ${dealData?.company} deal.`,
      } as any);
      toast({ title: `Task assigned to ${pendingMention.userName}` });

      // Asana sync (fire-and-forget)
      if (createdTask) {
        (async () => {
          try {
            const ctx = await getAsanaSyncContext(companyId);
            if (ctx) {
              const { data: assigneeProfile } = await supabase
                .from('profiles')
                .select('email')
                .eq('user_id', pendingMention.userId)
                .maybeSingle();

              const gid = await syncTaskToAsana(ctx, {
                id: (createdTask as any).id,
                title: (createdTask as any).title,
                description: (createdTask as any).description,
                due_date: (createdTask as any).due_date,
                assignee_email: assigneeProfile?.email || null,
              });
              console.log('[AsanaSync] DealSpace mention task pushed to Asana, gid:', gid);
            }
          } catch (e) {
            console.error('[AsanaSync] DealSpace mention task sync failed:', e);
          }
        })();
      }
    } catch (err) {
      console.error('Error creating task:', err);
      toast({ title: 'Failed to create task', variant: 'destructive' });
    }
    setMentionDialogOpen(false);
    setPendingMention(null);
  };

  const handleImageUpload = async (file: File) => {
    if (!editor) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `${note.deal_id}/notes/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('deal-space').upload(path, file);
      if (error) throw error;
      const { data } = await supabase.storage.from('deal-space').createSignedUrl(path, 31536000);
      if (data?.signedUrl) editor.chain().focus().setImage({ src: data.signedUrl }).run();
    } catch (err) { console.error('Image upload error:', err); }
  };

  const debouncedSave = useCallback((content: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setIsSaving(true);
      await onUpdate(note.id, { content });
      lastSavedContentRef.current = content;
      setIsSaving(false);
    }, 1000);
  }, [note.id, onUpdate]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => { const html = editor.getHTML(); if (html !== lastSavedContentRef.current) debouncedSave(html); };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, debouncedSave]);

  const handleTitleBlur = useCallback(() => { if (title !== note.title) onUpdate(note.id, { title }); }, [title, note.id, note.title, onUpdate]);
  useEffect(() => { setTitle(note.title); }, [note.id, note.title]);
  useEffect(() => { return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }; }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setShowFindReplace(true); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Floating "Add comment" toolbar on text selection
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) { setSelectionToolbar(null); return; }
      const text = editor.state.doc.textBetween(from, to, ' ').trim();
      if (!text) { setSelectionToolbar(null); return; }
      try {
        const start = editor.view.coordsAtPos(from);
        const end = editor.view.coordsAtPos(to);
        const containerRect = editorContainerRef.current?.getBoundingClientRect();
        if (!containerRect) return;
        const top = Math.min(start.top, end.top) - containerRect.top - 38;
        const left = (start.left + end.right) / 2 - containerRect.left;
        setSelectionToolbar({ top: Math.max(top, 4), left, text });
      } catch { setSelectionToolbar(null); }
    };
    editor.on('selectionUpdate', update);
    editor.on('blur', () => setTimeout(() => setSelectionToolbar(null), 150));
    return () => { editor.off('selectionUpdate', update); };
  }, [editor]);

  const handleFind = () => { if (findText) try { (window as any).find(findText); } catch {} };
  const handleReplace = () => { if (!editor || !findText) return; editor.commands.setContent(editor.getHTML().replace(findText, replaceText)); };
  const handleReplaceAll = () => { if (!editor || !findText) return; const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); editor.commands.setContent(editor.getHTML().replace(regex, replaceText)); };

  const handleInsertLink = () => {
    if (!editor) return;
    if (linkUrl) editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setShowLinkDialog(false); setLinkUrl('');
  };

  // Insert deal data
  const insertDealSnippet = (type: string) => {
    if (!editor || !dealData) return;
    let text = '';
    switch (type) {
      case 'company': text = dealData.company || ''; break;
      case 'value': text = dealData.value ? `$${Number(dealData.value).toLocaleString()}` : ''; break;
      case 'stage': text = dealData.stage || ''; break;
      case 'contact': text = dealData.contact || ''; break;
      case 'deal_type': text = dealData.deal_type || ''; break;
      case 'manager': text = dealData.manager || ''; break;
      case 'lender_list': {
        const rows = lenders.map(l => `<tr><td>${l.name}</td><td>${l.stage}</td><td>${l.quote_amount ? '$' + Number(l.quote_amount).toLocaleString() : ''}</td><td>${l.quote_rate ? l.quote_rate + '%' : ''}</td></tr>`).join('');
        const table = `<table><tr><th>Funding Source</th><th>Stage</th><th>Amount</th><th>Rate</th></tr>${rows}</table>`;
        editor.chain().focus().insertContent(table).run();
        return;
      }
    }
    if (text) editor.chain().focus().insertContent(text).run();
  };

  const handleSharePdf = async () => {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');
      
      const editorEl = document.querySelector('.ProseMirror');
      if (!editorEl) return;
      
      const canvas = await html2canvas(editorEl as HTMLElement);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 10, width, height);
      pdf.save(`${note.title || 'note'}.pdf`);
      toast({ title: 'PDF downloaded' });
    } catch (err) {
      console.error(err);
      toast({ title: 'PDF export failed', variant: 'destructive' });
    }
  };

  if (!editor) return null;

  const wordCount = editor.storage.characterCount?.words() ?? 0;
  const charCount = editor.storage.characterCount?.characters() ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ═══ Menu Bar ═══ */}
      <div className="flex items-center gap-1 px-2 py-0.5 text-xs border-b border-border/40">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground">File</button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => onDownload(note)}><FileDown className="h-3.5 w-3.5 mr-2" /> Download as .docx</DropdownMenuItem>
            <DropdownMenuItem onClick={handleSharePdf}><FileDown className="h-3.5 w-3.5 mr-2" /> Export as PDF</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-2" /> Print</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground">Edit</button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => editor.chain().focus().undo().run()}><Undo className="h-3.5 w-3.5 mr-2" /> Undo <span className="ml-auto text-muted-foreground text-[10px]">⌘Z</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().redo().run()}><Redo className="h-3.5 w-3.5 mr-2" /> Redo <span className="ml-auto text-muted-foreground text-[10px]">⌘Y</span></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowFindReplace(true)}><Search className="h-3.5 w-3.5 mr-2" /> Find and replace <span className="ml-auto text-muted-foreground text-[10px]">⌘F</span></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground">Insert</button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}><ImageIcon className="h-3.5 w-3.5 mr-2" /> Image</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-3.5 w-3.5 mr-2" /> Table</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setLinkUrl(editor.getAttributes('link').href || ''); setShowLinkDialog(true); }}><LinkIcon className="h-3.5 w-3.5 mr-2" /> Link</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-3.5 w-3.5 mr-2" /> Horizontal line</DropdownMenuItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-[10px] text-muted-foreground font-medium">DEAL DATA</p>
            <DropdownMenuItem onClick={() => insertDealSnippet('company')}><Hash className="h-3.5 w-3.5 mr-2" /> Company name</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDealSnippet('value')}><Hash className="h-3.5 w-3.5 mr-2" /> Capital ask</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDealSnippet('stage')}><Hash className="h-3.5 w-3.5 mr-2" /> Deal stage</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDealSnippet('contact')}><Hash className="h-3.5 w-3.5 mr-2" /> Contact</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDealSnippet('manager')}><Hash className="h-3.5 w-3.5 mr-2" /> Deal manager</DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertDealSnippet('lender_list')}><TableIcon className="h-3.5 w-3.5 mr-2" /> Lender summary table</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground">Format</button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5 mr-2" /> Bold <span className="ml-auto text-muted-foreground text-[10px]">⌘B</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5 mr-2" /> Italic <span className="ml-auto text-muted-foreground text-[10px]">⌘I</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5 mr-2" /> Underline <span className="ml-auto text-muted-foreground text-[10px]">⌘U</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5 mr-2" /> Strikethrough</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5 mr-2" /> Block quote</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground">Tools</button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => setShowShortcuts(true)}><Keyboard className="h-3.5 w-3.5 mr-2" /> Keyboard shortcuts</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowFindReplace(true)}><Search className="h-3.5 w-3.5 mr-2" /> Find and replace</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowVersionHistory(true)}><History className="h-3.5 w-3.5 mr-2" /> Version history</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Right side buttons */}
        <button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground" onClick={onToggleComments} title="Toggle comments">
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button className="px-2 py-1 rounded hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground" onClick={onToggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        <span className="text-muted-foreground text-[11px] mr-1">
          {isSaving ? <span className="flex items-center gap-1"><Save className="h-3 w-3 animate-pulse" /> Saving…</span> : 'All changes saved'}
        </span>
      </div>

      {/* ═══ Toolbar Ribbon ═══ */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/40 bg-muted/20 flex-wrap">
        <RibbonBtn onClick={() => editor.chain().focus().undo().run()} icon={Undo} label="Undo (Ctrl+Z)" />
        <RibbonBtn onClick={() => editor.chain().focus().redo().run()} icon={Redo} label="Redo (Ctrl+Y)" />
        <RibbonDivider />

        {/* Paragraph style */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1 h-7 px-2 rounded-sm text-xs hover:bg-accent/80 transition-colors min-w-[100px] justify-between border border-border/40" onMouseDown={(e) => e.preventDefault()}>
              <span className="truncate">
                {editor.isActive('heading', { level: 1 }) ? 'Heading 1' : editor.isActive('heading', { level: 2 }) ? 'Heading 2' : editor.isActive('heading', { level: 3 }) ? 'Heading 3' : 'Normal text'}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}><span className="text-sm">Normal text</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><span className="text-lg font-bold">Heading 1</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><span className="text-base font-bold">Heading 2</span></DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><span className="text-sm font-bold">Heading 3</span></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RibbonDivider />

        <RibbonBtn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon={Bold} label="Bold (Ctrl+B)" />
        <RibbonBtn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon={Italic} label="Italic (Ctrl+I)" />
        <RibbonBtn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} icon={UnderlineIcon} label="Underline (Ctrl+U)" />
        <RibbonBtn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} icon={Strikethrough} label="Strikethrough" />
        <RibbonDivider />

        <ColorSwatchPicker currentColor={editor.getAttributes('textStyle').color} onColorChange={(c) => c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run()} icon={Type} label="Text color" underlineColor={editor.getAttributes('textStyle').color || '#000000'} />
        <ColorSwatchPicker currentColor={editor.getAttributes('highlight').color} onColorChange={(c) => c ? editor.chain().focus().toggleHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run()} icon={Highlighter} label="Highlight color" underlineColor={editor.getAttributes('highlight').color || '#ffff00'} />
        <RibbonDivider />

        <RibbonBtn onClick={() => { setLinkUrl(editor.getAttributes('link').href || ''); setShowLinkDialog(true); }} isActive={editor.isActive('link')} icon={LinkIcon} label="Insert link" />
        <RibbonBtn onClick={() => fileInputRef.current?.click()} icon={ImageIcon} label="Insert image" />
        <RibbonDivider />

        <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} icon={AlignLeft} label="Align left" />
        <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} icon={AlignCenter} label="Center" />
        <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} icon={AlignRight} label="Align right" />
        <RibbonBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} icon={AlignJustify} label="Justify" />
        <RibbonDivider />

        <RibbonBtn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} icon={List} label="Bullet list" />
        <RibbonBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} icon={ListOrdered} label="Numbered list" />
        <RibbonBtn onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} icon={CheckSquare} label="Checklist" />
        <RibbonDivider />

        <RibbonBtn onClick={() => editor.chain().focus().sinkListItem('listItem').run()} disabled={!editor.can().sinkListItem('listItem')} icon={IndentIncrease} label="Increase indent" />
        <RibbonBtn onClick={() => editor.chain().focus().liftListItem('listItem').run()} disabled={!editor.can().liftListItem('listItem')} icon={IndentDecrease} label="Decrease indent" />
        <RibbonDivider />

        <Popover>
          <PopoverTrigger asChild>
            <button className={cn("inline-flex items-center justify-center h-7 w-7 rounded-sm transition-colors hover:bg-accent/80", editor.isActive('table') && "bg-accent text-accent-foreground")} onMouseDown={(e) => e.preventDefault()}>
              <TableIcon className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start" sideOffset={4}>
            <p className="text-xs font-medium text-muted-foreground mb-2">Table</p>
            <div className="flex flex-col gap-0.5">
              <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Plus className="h-3 w-3" /> Insert 3×3 table</button>
              {editor.isActive('table') && (
                <>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Add column right</button>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Add row below</button>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</button>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</button>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().mergeCells().run()}>Merge cells</button>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().splitCell().run()}>Split cell</button>
                  <button className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-accent/60 text-left text-destructive" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 className="h-3 w-3" /> Delete table</button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <RibbonBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} icon={Quote} label="Block quote" />
        <RibbonBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} icon={Minus} label="Horizontal line" />
        <RibbonDivider />
        <NoteTOC editor={editor} />
      </div>

      {/* ═══ Find & Replace ═══ */}
      {showFindReplace && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/30">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Find…" className="h-7 text-xs w-36" onKeyDown={(e) => e.key === 'Enter' && handleFind()} />
          <Replace className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="Replace with…" className="h-7 text-xs w-36" />
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleFind}>Next</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleReplace}>Replace</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleReplaceAll}>Replace all</Button>
          <button className="h-7 w-7 inline-flex items-center justify-center rounded-sm hover:bg-accent/80" onClick={() => setShowFindReplace(false)}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); if (fileInputRef.current) fileInputRef.current.value = ''; }} />

      {/* ═══ Title ═══ */}
      <div className="px-10 pt-5">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }}
          placeholder="Untitled document"
          className="border-none text-2xl font-semibold px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
        />
      </div>

      {/* ═══ Editor ═══ */}
      <div ref={editorContainerRef} className="flex-1 overflow-auto relative">
        <EditorContent editor={editor} className="h-full" />
        {selectionToolbar && (
          <div
            className="absolute z-30 bg-popover border border-border shadow-lg rounded-md flex items-center"
            style={{ top: selectionToolbar.top, left: selectionToolbar.left, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="px-2.5 py-1.5 text-xs flex items-center gap-1.5 hover:bg-accent/60 rounded-md transition-colors"
              onClick={() => {
                if (onRequestComment && selectionToolbar) {
                  onRequestComment(selectionToolbar.text);
                  setSelectionToolbar(null);
                }
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" /> Add comment
            </button>
          </div>
        )}
      </div>

      {/* ═══ Status Bar ═══ */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-border/40 text-[11px] text-muted-foreground bg-muted/20">
        <span>{wordCount} words · {charCount} characters</span>
        {note.linked_lender_id && <span className="flex items-center gap-1"><LenderLink className="h-3 w-3" /> Linked to lender</span>}
      </div>

      {/* ═══ Dialogs ═══ */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Insert link</DialogTitle></DialogHeader>
          <div><Label>URL</Label><Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" /></div>
          <DialogFooter className="gap-2">
            {editor.isActive('link') && <Button variant="destructive" size="sm" onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkDialog(false); }}>Remove</Button>}
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
            <Button onClick={handleInsertLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            {[['⌘+B', 'Bold'], ['⌘+I', 'Italic'], ['⌘+U', 'Underline'], ['⌘+Z', 'Undo'], ['⌘+Y', 'Redo'], ['⌘+F', 'Find & Replace'], ['⌘+Shift+7', 'Numbered list'], ['⌘+Shift+8', 'Bullet list'], ['⌘+Shift+9', 'Checklist'], ['Tab', 'Indent'], ['Shift+Tab', 'Outdent'], ['Enter', 'New paragraph'], ['---', 'Horizontal rule']].map(([key, desc]) => (
              <div key={key} className="contents">
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono w-fit">{key}</kbd>
                <span className="text-muted-foreground text-xs">{desc}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <NoteVersionHistory
        open={showVersionHistory}
        onOpenChange={setShowVersionHistory}
        noteId={note.id}
        fetchVersions={fetchVersions}
        onRestore={restoreVersion}
      />

      <MentionTaskDialog
        open={mentionDialogOpen}
        onOpenChange={(open) => {
          setMentionDialogOpen(open);
          if (!open) setPendingMention(null);
        }}
        mentionedUserName={pendingMention?.userName || ''}
        mentionedUserId={pendingMention?.userId || ''}
        dealName={dealData?.company}
        onNotifyOnly={handleMentionNotify}
        onCreateTask={handleMentionTask}
      />
    </div>
  );
}
