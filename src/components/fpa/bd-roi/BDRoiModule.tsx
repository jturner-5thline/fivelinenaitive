import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardList, MessageSquare, Download, User, Trash2, CheckSquare, Square } from 'lucide-react';
import { useBDRoiStore } from './useBDRoiStore';
import { BDDashboardTab } from './BDDashboardTab';
import { BDPartnerTab } from './BDPartnerTab';
import { BDBankTab } from './BDBankTab';
import { BDCMCompTab } from './BDCMCompTab';
import { BDEventsTab } from './BDEventsTab';
import { BDAmexTab } from './BDAmexTab';
import { QuarterFilter } from './QuarterFilter';
import { QUARTERS_16 } from './bdRoiData';

export function BDRoiModule() {
  const [auditOpen, setAuditOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [userEditOpen, setUserEditOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const { auditLog, comments, userName, clearAuditLog, addComment, toggleComment, setUserName } = useBDRoiStore();
  const [tempUser, setTempUser] = useState(userName);

  const exportAuditCSV = () => {
    const csv = ['User,Timestamp,Field,Quarter,Tab,Old Value,New Value',
      ...auditLog.map(e => `${e.user},${e.timestamp},${e.field},${e.quarter},${e.tab},${e.oldValue},${e.newValue}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-log.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setAuditOpen(true)}>
            <ClipboardList className="h-3.5 w-3.5" />
            Audit Log
            {auditLog.length > 0 && <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">{auditLog.length}</Badge>}
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setCommentsOpen(true)}>
            <MessageSquare className="h-3.5 w-3.5" />
            Comments
            {comments.length > 0 && <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">{comments.length}</Badge>}
          </Button>
        </div>
        <button
          className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
          onClick={() => { setTempUser(userName); setUserEditOpen(true); }}
        >
          <User className="h-3.5 w-3.5" /> {userName}
        </button>
      </div>

      {/* Internal Tabs */}
      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard" className="text-xs">Dashboard</TabsTrigger>
          <TabsTrigger value="partner" className="text-xs">Partner Channel</TabsTrigger>
          <TabsTrigger value="bank" className="text-xs">Bank Channel</TabsTrigger>
          <TabsTrigger value="cmcomp" className="text-xs">CM Comp</TabsTrigger>
          <TabsTrigger value="events" className="text-xs">Events & T+E</TabsTrigger>
          <TabsTrigger value="amex" className="text-xs">AMEX CC</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><BDDashboardTab /></TabsContent>
        <TabsContent value="partner"><BDPartnerTab /></TabsContent>
        <TabsContent value="bank"><BDBankTab /></TabsContent>
        <TabsContent value="cmcomp"><BDCMCompTab /></TabsContent>
        <TabsContent value="events"><BDEventsTab /></TabsContent>
        <TabsContent value="amex"><BDAmexTab /></TabsContent>
      </Tabs>

      {/* Audit Log Sheet */}
      <Sheet open={auditOpen} onOpenChange={setAuditOpen}>
        <SheetContent className="w-[400px] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              Audit Log
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={exportAuditCSV}>
                  <Download className="h-3 w-3" /> Export CSV
                </Button>
                <Button variant="destructive" size="sm" className="h-7 text-[10px] gap-1" onClick={clearAuditLog}>
                  <Trash2 className="h-3 w-3" /> Clear
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {auditLog.length === 0 && <p className="text-[12px] text-muted-foreground">No changes recorded yet.</p>}
            {auditLog.map(entry => (
              <div key={entry.id} className="border border-border/50 rounded p-2 text-[11px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-primary">{entry.user}</span>
                  <span className="text-muted-foreground/60">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-foreground">
                  <span className="font-medium">{entry.field}</span> ({entry.quarter}, {entry.tab})
                </div>
                <div className="text-muted-foreground">
                  {entry.oldValue} → <span className="text-foreground font-medium">{entry.newValue}</span>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Comments Dialog */}
      <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Comments / Agenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {comments.length === 0 && <p className="text-[12px] text-muted-foreground">No comments yet.</p>}
            {comments.map(c => (
              <div key={c.id} className="flex items-start gap-2 p-2 border border-border/50 rounded">
                <button onClick={() => toggleComment(c.id)} className="mt-0.5">
                  {c.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-muted-foreground/40" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] ${c.completed ? 'line-through text-muted-foreground/60' : 'text-foreground'}`}>{c.text}</p>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    <span className="text-primary">{c.author}</span> · {new Date(c.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="text-[12px] min-h-[60px]"
            />
            <Button
              size="sm"
              className="self-end"
              disabled={!newComment.trim()}
              onClick={() => { addComment(newComment.trim()); setNewComment(''); }}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Name Dialog */}
      <Dialog open={userEditOpen} onOpenChange={setUserEditOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Change User Name</DialogTitle></DialogHeader>
          <Input value={tempUser} onChange={e => setTempUser(e.target.value)} className="text-sm" />
          <Button size="sm" onClick={() => { setUserName(tempUser); setUserEditOpen(false); }}>Save</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
