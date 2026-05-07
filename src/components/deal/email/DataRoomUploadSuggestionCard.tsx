import { useMemo, useState } from 'react';
import { Loader2, Check, FolderOpen, Paperclip, FileText } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { EmailAttachment } from './mockEmailData';
import {
  DEAL_ATTACHMENT_CATEGORIES,
  type DealAttachmentCategory,
} from '@/hooks/useDealAttachments';

/**
 * The "Interna" section is the default internal landing zone for deal-space
 * attachments. It is a UI-level concept layered on top of the existing
 * `materials` storage category — every internal upload defaults here unless
 * the filename classifier is highly confident the file belongs elsewhere.
 */
export type SectionKey = DealAttachmentCategory;

interface ClassificationResult {
  category: DealAttachmentCategory;
  /** 0..1 — only override the default when > 0.8. */
  confidence: number;
  /** The matched keyword, for transparency. */
  matched?: string;
}

/**
 * Lightweight filename/keyword classifier. Returns "materials" (Interna) by
 * default. Only returns a non-default category when confidence > 0.8.
 */
function classifyFilename(filename: string): ClassificationResult {
  const name = (filename || '').toLowerCase();
  if (!name) return { category: 'materials', confidence: 0 };

  // High-confidence signals (>0.8) — the keyword is unambiguous in a deal context.
  const HIGH_CONFIDENCE: Array<{
    re: RegExp;
    category: DealAttachmentCategory;
    confidence: number;
    matched: string;
  }> = [
    { re: /\bloan\s*agreement\b/, category: 'agreements', confidence: 0.95, matched: 'loan agreement' },
    { re: /\bcredit\s*agreement\b/, category: 'agreements', confidence: 0.95, matched: 'credit agreement' },
    { re: /\bterm\s*sheet\b/, category: 'agreements', confidence: 0.9, matched: 'term sheet' },
    { re: /\bnda\b/, category: 'agreements', confidence: 0.9, matched: 'NDA' },
    { re: /\bmsa\b/, category: 'agreements', confidence: 0.9, matched: 'MSA' },
    { re: /\bloi\b/, category: 'agreements', confidence: 0.9, matched: 'LOI' },
    { re: /\b(income\s*statement|balance\s*sheet|cash\s*flow|p&l|pnl)\b/, category: 'financials', confidence: 0.9, matched: 'financial statement' },
    { re: /\b(audited\s*financials?|tax\s*return)\b/, category: 'financials', confidence: 0.9, matched: 'audited financials' },
  ];

  for (const rule of HIGH_CONFIDENCE) {
    if (rule.re.test(name)) {
      return { category: rule.category, confidence: rule.confidence, matched: rule.matched };
    }
  }
  // Default: route to Interna (materials) with low confidence so caller keeps default.
  return { category: 'materials', confidence: 0 };
}

function formatBytes(b?: number): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function shortType(contentType?: string): string {
  if (!contentType) return '';
  const sub = contentType.split('/').pop() || '';
  if (sub.length > 8) return sub.slice(0, 8).toUpperCase();
  return sub.toUpperCase();
}

/** UI label for a category — surfaces "Interna" for the default materials bucket. */
const CATEGORY_LABEL: Record<DealAttachmentCategory, string> = {
  materials: 'Interna',
  financials: 'Financials',
  agreements: 'Legal',
  other: 'Other',
};

interface FileSelectionState {
  attachmentId: string;
  filename: string;
  size: number;
  contentType: string;
  selected: boolean;
}

export interface DataRoomUploadConfirmPayload {
  action: 'add_to_data_room';
  deal: string;
  section: string;
  files: Array<{ name: string; size: number; mime: string }>;
}

interface Props {
  dealName: string;
  attachments: EmailAttachment[];
  committing?: boolean;
  onConfirm: (
    section: DealAttachmentCategory,
    selectedAttachmentIds: string[],
    payload: DataRoomUploadConfirmPayload,
  ) => void;
  /** "Change section" link → opens the full picker dialog. */
  onChangeSection?: () => void;
  /** Optional count badge rendered in the card header (right side). */
  headerCount?: number;
}

/**
 * DataRoomUploadSuggestionCard
 * ----------------------------
 * Renders inside the AI Assist "Suggested Update" panel as the actionable
 * fallback when:
 *   • the thread carries one or more attachments, AND
 *   • the thread is linked (or strongly likely-matched) to an active deal.
 *
 * Replaces the "No workflow update suggested for this thread." empty state.
 * Designed to mirror the WorkflowIntelligenceCard sibling above it — same
 * border, padding, typography, button layout — for visual consistency.
 */
export function DataRoomUploadSuggestionCard({
  dealName,
  attachments,
  committing = false,
  onConfirm,
  onChangeSection,
  headerCount,
}: Props) {
  // Per-file classification — used to decide if the section dropdown should
  // jump off the "Interna" default (only when >0.8 confidence on majority).
  const classifications = useMemo(
    () =>
      attachments.map((a) => ({
        attachment: a,
        classification: classifyFilename(a.filename || ''),
      })),
    [attachments],
  );

  // Determine the recommended default section. Override "Interna" only when
  // a strict majority of files classify into the same non-default bucket
  // with confidence > 0.8.
  const recommendedSection: DealAttachmentCategory = useMemo(() => {
    const overrides = classifications.filter(
      (c) => c.classification.confidence > 0.8 && c.classification.category !== 'materials',
    );
    if (overrides.length === 0) return 'materials';
    const counts = new Map<DealAttachmentCategory, number>();
    overrides.forEach((o) => {
      counts.set(
        o.classification.category,
        (counts.get(o.classification.category) || 0) + 1,
      );
    });
    let best: DealAttachmentCategory = 'materials';
    let bestN = 0;
    counts.forEach((n, k) => {
      if (n > bestN) {
        bestN = n;
        best = k;
      }
    });
    // Strict majority of all files, not just overrides.
    return bestN > attachments.length / 2 ? best : 'materials';
  }, [classifications, attachments.length]);

  const [section, setSection] = useState<DealAttachmentCategory>(recommendedSection);
  const [files, setFiles] = useState<FileSelectionState[]>(() =>
    attachments.map((a) => ({
      attachmentId: a.id || `${a.filename}-${a.size}`,
      filename: a.filename || 'attachment',
      size: a.size || 0,
      contentType: a.content_type || 'application/octet-stream',
      selected: true,
    })),
  );

  const toggle = (id: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.attachmentId === id ? { ...f, selected: !f.selected } : f)),
    );
  };

  const selectedCount = files.filter((f) => f.selected).length;
  const sectionLabel = CATEGORY_LABEL[section];
  const dealLabel = dealName || 'this deal';

  const handleConfirm = () => {
    const selected = files.filter((f) => f.selected);
    onConfirm(
      section,
      selected.map((f) => f.attachmentId),
      {
        action: 'add_to_data_room',
        deal: dealLabel,
        section: sectionLabel,
        files: selected.map((f) => ({
          name: f.filename,
          size: f.size,
          mime: f.contentType,
        })),
      },
    );
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-2 overflow-hidden max-w-full">
      {/* Header — matches the WorkflowIntelligenceCard sibling */}
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/90">
          Suggested Update
        </span>
        <Paperclip className="h-2.5 w-2.5 text-primary/70 ml-auto shrink-0" />
      </div>

      <p className="text-[13px] text-foreground font-semibold leading-snug">
        Add {selectedCount} attachment{selectedCount === 1 ? '' : 's'} to {dealLabel} Data Room → {sectionLabel}
      </p>

      {/* Section dropdown — defaults to "Interna" (materials) */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          Section
        </label>
        <Select value={section} onValueChange={(v) => setSection(v as DealAttachmentCategory)}>
          <SelectTrigger className="h-7 text-[11px] flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="materials" className="text-[11px]">Interna</SelectItem>
            {DEAL_ATTACHMENT_CATEGORIES.filter((c) => c.value !== 'materials').map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-[11px]">
                {CATEGORY_LABEL[c.value as DealAttachmentCategory]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* File checklist — pre-checked */}
      <div className="space-y-1 rounded border border-input bg-background/40 p-1.5 max-h-40 overflow-y-auto">
        {files.map((f) => (
          <label
            key={f.attachmentId}
            className={cn(
              'flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] cursor-pointer hover:bg-primary/[0.04]',
              !f.selected && 'opacity-60',
            )}
          >
            <Checkbox
              checked={f.selected}
              onCheckedChange={() => toggle(f.attachmentId)}
              className="h-3 w-3"
            />
            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-foreground/90">{f.filename}</span>
            <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
              {formatBytes(f.size)}
            </span>
            {shortType(f.contentType) && (
              <span className="text-[9px] text-muted-foreground/70 uppercase shrink-0">
                {shortType(f.contentType)}
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          className="h-7 px-2 text-[11px] gap-1 flex-1"
          disabled={committing || selectedCount === 0}
          onClick={handleConfirm}
        >
          {committing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FolderOpen className="h-3 w-3" />
          )}
          Add to Data Room
        </Button>
        {onChangeSection && (
          <button
            type="button"
            onClick={onChangeSection}
            className="h-7 px-2 text-[11px] text-primary/80 hover:text-primary underline-offset-2 hover:underline"
          >
            Change section
          </button>
        )}
      </div>
    </div>
  );
}