import { useMemo, useRef, useState, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Mail, Phone, User, Briefcase, ThumbsDown, CheckCircle, ExternalLink, Globe, Paperclip, Upload, Trash2, FileText, Loader2, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDealsContext } from '@/contexts/DealsContext';
import { useLenderAttachments, LenderAttachment, LENDER_ATTACHMENT_CATEGORIES, LenderAttachmentCategory } from '@/hooks/useLenderAttachments';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface LenderInfo {
  name: string;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  preferences: string[];
  website?: string;
  description?: string;
}

interface LenderDetailDialogProps {
  lender: LenderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LenderDetailDialog({ lender, open, onOpenChange }: LenderDetailDialogProps) {
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LenderAttachmentCategory>('general');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  const { attachments, isLoading: isLoadingAttachments, uploadAttachment, deleteAttachment } = useLenderAttachments(
    open ? lender?.name ?? null : null
  );

  const handleNavigateToDeal = (dealId: string) => {
    onOpenChange(false);
    navigate(`/deals/${dealId}`);
  };

  const handleUpload = async (file: File, category: LenderAttachmentCategory) => {
    setIsUploading(true);
    await uploadAttachment(file, category);
    setIsUploading(false);
    setPendingFile(null);
    setSelectedCategory('general');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmUpload = async () => {
    if (pendingFile) {
      await handleUpload(pendingFile, selectedCategory);
    }
  };

  const handleCancelUpload = () => {
    setPendingFile(null);
    setSelectedCategory('general');
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setPendingFile(files[0]);
    }
  };

  const getCategoryLabel = (value: string) => {
    return LENDER_ATTACHMENT_CATEGORIES.find(c => c.value === value)?.label || value;
  };

  // Group attachments by category
  const groupedAttachments = useMemo(() => {
    const groups: Record<string, LenderAttachment[]> = {};
    attachments.forEach(att => {
      const cat = att.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(att);
    });
    return groups;
  }, [attachments]);

  const handleDeleteAttachment = async (attachment: LenderAttachment) => {
    await deleteAttachment(attachment);
  };

  // Find all deals where this lender is involved
  const lenderDeals = useMemo(() => {
    if (!lender) return { active: [], sent: [], passReasons: [] };

    const active: { dealId: string; dealName: string; company: string; stage: string; status: string }[] = [];
    const sent: { dealId: string; dealName: string; company: string; stage: string; dateSent: string }[] = [];
    const passReasons: { dealId: string; dealName: string; company: string; reason: string }[] = [];

    deals.forEach(deal => {
      const dealLender = deal.lenders?.find(l => l.name === lender.name);
      if (dealLender) {
        // Check if passed
        if (dealLender.trackingStatus === 'passed' && dealLender.passReason) {
          passReasons.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            reason: dealLender.passReason,
          });
        } else if (dealLender.trackingStatus === 'active') {
          active.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            status: dealLender.trackingStatus,
          });
        } else {
          // All other deals sent to this lender
          sent.push({
            dealId: deal.id,
            dealName: deal.name,
            company: deal.company,
            stage: dealLender.stage,
            dateSent: dealLender.updatedAt || deal.createdAt,
          });
        }
      }
    });

    return { active, sent, passReasons };
  }, [lender, deals]);

  if (!lender) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-6 w-6" />
            {lender.name}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)] pr-4">
          <div className="space-y-6">
            {/* Description */}
            {lender.description && (
              <>
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    About
                  </h3>
                  <p className="text-sm leading-relaxed">{lender.description}</p>
                </section>
                <Separator />
              </>
            )}

            {/* Website & Contact Information */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Contact Information
              </h3>
              <div className="grid gap-3">
                {lender.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={lender.website.startsWith('http') ? lender.website : `https://${lender.website}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {lender.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {lender.contact.name && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{lender.contact.name}</span>
                  </div>
                )}
                {lender.contact.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lender.contact.email}`} className="text-primary hover:underline">
                      {lender.contact.email}
                    </a>
                  </div>
                )}
                {lender.contact.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lender.contact.phone}`} className="hover:underline">
                      {lender.contact.phone}
                    </a>
                  </div>
                )}
                {!lender.website && !lender.contact.name && !lender.contact.email && !lender.contact.phone && (
                  <p className="text-muted-foreground text-sm">No contact information available</p>
                )}
              </div>
            </section>

            <Separator />

            {/* Deal Preferences */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Deal Preferences
              </h3>
              {lender.preferences.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {lender.preferences.map((pref, idx) => (
                    <Badge key={idx} variant="secondary">
                      {pref}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No preferences specified</p>
              )}
            </section>

            <Separator />

            {/* Attachments Section */}
            {user && (
              <>
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Attachments ({attachments.length})
                    </h3>
                  </div>
                  
                  {/* Pending File - Category Selection */}
                  {pendingFile ? (
                    <div className="border rounded-lg p-4 mb-3 bg-muted/30">
                      <div className="flex items-center gap-3 mb-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{pendingFile.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(pendingFile.size)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as LenderAttachmentCategory)}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {LENDER_ATTACHMENT_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleConfirmUpload}
                          disabled={isUploading}
                          className="flex-1"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelUpload}
                          disabled={isUploading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Drag and Drop Zone */
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 mb-3 text-center cursor-pointer transition-colors",
                        isDragging 
                          ? "border-primary bg-primary/5" 
                          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center gap-2 py-2">
                        <Upload className={cn(
                          "h-6 w-6 transition-colors",
                          isDragging ? "text-primary" : "text-muted-foreground"
                        )} />
                        <p className="text-sm text-muted-foreground">
                          {isDragging ? "Drop file here" : "Drag & drop or click to upload"}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {isLoadingAttachments ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : attachments.length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(groupedAttachments).map(([category, catAttachments]) => (
                        <div key={category}>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="secondary" className="text-xs">
                              {getCategoryLabel(category)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ({catAttachments.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {catAttachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group"
                              >
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 flex-1 min-w-0 hover:text-primary"
                                >
                                  <FileText className="h-4 w-4 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{attachment.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatFileSize(attachment.size_bytes)}
                                    </p>
                                  </div>
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteAttachment(attachment)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No attachments uploaded</p>
                  )}
                </section>
                <Separator />
              </>
            )}

            {/* Active Deals */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Active Deals ({lenderDeals.active.length})
              </h3>
              {lenderDeals.active.length > 0 ? (
                <div className="space-y-2">
                  {lenderDeals.active.map((deal) => (
                    <div 
                      key={deal.dealId} 
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group"
                      onClick={() => handleNavigateToDeal(deal.dealId)}
                    >
                      <div>
                        <p className="font-medium">{deal.company}</p>
                        <p className="text-sm text-muted-foreground">{deal.dealName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{deal.stage}</Badge>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No active deals with this lender</p>
              )}
            </section>

            <Separator />

            {/* Deals Sent */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Deals Sent ({lenderDeals.sent.length})
              </h3>
              {lenderDeals.sent.length > 0 ? (
                <div className="space-y-2">
                  {lenderDeals.sent.map((deal) => (
                    <div 
                      key={deal.dealId} 
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group"
                      onClick={() => handleNavigateToDeal(deal.dealId)}
                    >
                      <div>
                        <p className="font-medium">{deal.company}</p>
                        <p className="text-sm text-muted-foreground">{deal.dealName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{deal.stage}</Badge>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No deals have been sent to this lender</p>
              )}
            </section>

            <Separator />

            {/* Pass Reasons */}
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <ThumbsDown className="h-4 w-4 text-destructive" />
                Pass Reasons ({lenderDeals.passReasons.length})
              </h3>
              {lenderDeals.passReasons.length > 0 ? (
                <div className="space-y-2">
                  {lenderDeals.passReasons.map((item) => (
                    <div 
                      key={item.dealId} 
                      className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer group"
                      onClick={() => handleNavigateToDeal(item.dealId)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">{item.company}</p>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-sm text-muted-foreground">{item.dealName}</p>
                      <p className="text-sm mt-2 text-destructive/80">Reason: {item.reason}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No pass history with this lender</p>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}