import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Upload, Globe, Palette, Save, FileDown, Trash2, FileText, Link2, Cloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useBrandedDocStudio,
  DOCUMENT_TYPES,
  SECTIONS,
  DEFAULT_STYLE,
  type StyleSpec,
  type StyledDocument,
  type PaletteColor,
} from "@/hooks/useBrandedDocStudio";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  companyName: string;
  onSavedToDataRoom?: () => void;
}

type Step = "configure" | "edit";

export function BrandedDocStudioDialog({ open, onOpenChange, dealId, companyName, onSavedToDataRoom }: Props) {
  const studio = useBrandedDocStudio(dealId);
  const [step, setStep] = useState<Step>("configure");

  // Configuration state
  const [docType, setDocType] = useState<string>("deal_summary_memo");
  const [title, setTitle] = useState<string>("");
  const [selectedSections, setSelectedSections] = useState<string[]>([
    "executive_summary", "company_overview", "financial_highlights", "use_of_proceeds", "next_steps",
  ]);
  const [style, setStyle] = useState<StyleSpec>(DEFAULT_STYLE);
  const [styleSourceTab, setStyleSourceTab] = useState<"image" | "url" | "template" | "manual">("manual");
  const [styleUrl, setStyleUrl] = useState("");
  const [extractingStyle, setExtractingStyle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generation/edit state
  const [generating, setGenerating] = useState(false);
  const [html, setHtml] = useState<string>("");
  const [followUp, setFollowUp] = useState<string>("");
  const [revising, setRevising] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);
  const [pushToDrive, setPushToDrive] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setStep("configure");
      setHtml("");
      setDocId(null);
      setFollowUp("");
      const dt = DOCUMENT_TYPES.find((d) => d.value === docType);
      setTitle(`${dt?.label || "Document"} — ${companyName}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const dt = DOCUMENT_TYPES.find((d) => d.value === docType);
    setTitle((prev) => prev && !prev.startsWith(dt?.label || "") ? prev : `${dt?.label || "Document"} — ${companyName}`);
    if (docType === "deal_teaser") {
      // deal teaser → swap company name in title
      setTitle(`${dt?.label} — Project [Codename]`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);

  const toggleSection = (key: string) => {
    setSelectedSections((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);
  };

  const updatePaletteColor = (idx: number, hex: string) => {
    setStyle((s) => ({ ...s, palette: s.palette.map((c, i) => (i === idx ? { ...c, hex } : c)) }));
  };

  const handleImageUpload = async (file: File) => {
    setExtractingStyle(true);
    try {
      const path = await studio.uploadStyleRefImage(file);
      if (!path) return;
      const result = await studio.extractStyle({ source_type: "image", image_storage_path: path });
      setStyle(result);
      toast.success("Style extracted from image");
    } finally {
      setExtractingStyle(false);
    }
  };

  const handleUrlExtract = async () => {
    if (!styleUrl.trim()) {
      toast.error("Enter a URL");
      return;
    }
    setExtractingStyle(true);
    try {
      const result = await studio.extractStyle({ source_type: "url", url: styleUrl.trim() });
      setStyle(result);
      toast.success("Style derived from URL");
    } finally {
      setExtractingStyle(false);
    }
  };

  const applyTemplate = (tplId: string) => {
    const tpl = studio.templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setStyle({
      palette: tpl.palette,
      fonts: tpl.fonts,
      layout_notes: tpl.layout_notes || undefined,
    });
    toast.success(`Applied "${tpl.name}"`);
  };

  const handleSaveTemplate = async () => {
    const name = window.prompt("Template name?");
    if (!name?.trim()) return;
    await studio.saveTemplate({
      name: name.trim(),
      source_type: styleSourceTab === "url" ? "url" : styleSourceTab === "image" ? "image" : "manual",
      source_value: styleSourceTab === "url" ? styleUrl : null,
      palette: style.palette,
      fonts: style.fonts || {},
      layout_notes: style.layout_notes || null,
      preview_image_path: null,
    });
  };

  const handleGenerate = async () => {
    if (!selectedSections.length) {
      toast.error("Select at least one section");
      return;
    }
    setGenerating(true);
    try {
      const result = await studio.generateDocument({
        deal_id: dealId,
        document_type: docType,
        document_title: title,
        sections: selectedSections,
        style,
        anonymize: docType === "deal_teaser",
      });
      if (!result) return;
      setHtml(result.html);
      // Auto-create draft record
      const saved = await studio.saveDocument({
        deal_id: dealId,
        document_type: docType,
        title,
        sections: selectedSections,
        style,
        html: result.html,
      });
      if (saved) setDocId(saved.id);
      setStep("edit");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevise = async () => {
    if (!followUp.trim()) {
      toast.error("Describe the revision");
      return;
    }
    setRevising(true);
    try {
      const result = await studio.generateDocument({
        deal_id: dealId,
        document_type: docType,
        document_title: title,
        sections: selectedSections,
        style,
        user_prompt: followUp.trim(),
        current_html: html,
        anonymize: docType === "deal_teaser",
      });
      if (!result) return;
      setHtml(result.html);
      if (docId) {
        await studio.saveDocument({
          id: docId,
          deal_id: dealId,
          document_type: docType,
          title,
          sections: selectedSections,
          style,
          html: result.html,
          prompt: followUp,
        } as any);
      }
      setFollowUp("");
      toast.success("Revision applied");
    } finally {
      setRevising(false);
    }
  };

  const handleSyncEdits = async () => {
    // Capture inline edits from the contentEditable preview
    if (!previewRef.current) return;
    const editedHtml = previewRef.current.innerHTML;
    setHtml(editedHtml);
    if (docId) {
      await studio.saveDocument({
        id: docId,
        deal_id: dealId,
        document_type: docType,
        title,
        sections: selectedSections,
        style,
        html: editedHtml,
      } as any);
      toast.success("Saved");
    }
  };

  const handleExport = async () => {
    if (!docId || !html) return;
    await handleSyncEdits();
    setExporting(true);
    try {
      // Render to PDF on client using html2pdf.js for fidelity, then upload via edge function
      const html2pdf = (await import("html2pdf.js")).default;
      // Build a print-safe wrapper with the latest HTML (in case user edited inline)
      const latestHtml = previewRef.current?.innerHTML ?? html;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = latestHtml;
      // Move into off-DOM container (visible offscreen)
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.width = "880px";
      container.appendChild(wrapper);
      document.body.appendChild(container);

      const blob: Blob = await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `${title}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        } as any)
        .from(wrapper)
        .outputPdf("blob");
      document.body.removeChild(container);

      // Convert blob to base64
      const arr = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
      const b64 = btoa(bin);

      const result = await studio.exportPdf({
        deal_id: dealId,
        document_id: docId,
        filename: `${title}.pdf`,
        pdf_base64: b64,
        push_to_drive: pushToDrive,
      });

      if (result?.ok) {
        // Trigger client download too
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title}.pdf`;
        a.click();
        URL.revokeObjectURL(url);

        if (pushToDrive) {
          if (result.drive?.ok) {
            toast.success("Exported to Data Room and Google Drive");
          } else {
            toast.success("Exported to Data Room");
            toast.warning(`Drive push failed: ${result.drive?.error || "not connected"}`);
          }
        } else {
          toast.success("Exported to Data Room");
        }
        onSavedToDataRoom?.();
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`Export failed: ${e?.message || e}`);
    } finally {
      setExporting(false);
    }
  };

  const palettePreview = useMemo(() => style.palette || [], [style]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Branded Document Studio
          </DialogTitle>
        </DialogHeader>

        {step === "configure" && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Document type + title */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>

            {/* Sections */}
            <div>
              <Label className="mb-2 block">Sections to include</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {SECTIONS.map((s) => {
                  const checked = selectedSections.includes(s.value);
                  return (
                    <label key={s.value} className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm",
                      checked ? "border-primary bg-primary/5" : "border-border",
                    )}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleSection(s.value)} />
                      {s.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Style reference */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2"><Palette className="h-4 w-4" /> Style Reference</Label>
                <Button size="sm" variant="ghost" onClick={handleSaveTemplate}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save as template
                </Button>
              </div>
              <Tabs value={styleSourceTab} onValueChange={(v) => setStyleSourceTab(v as any)}>
                <TabsList>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                  <TabsTrigger value="image"><Upload className="h-3.5 w-3.5 mr-1" /> Image</TabsTrigger>
                  <TabsTrigger value="url"><Globe className="h-3.5 w-3.5 mr-1" /> URL</TabsTrigger>
                  <TabsTrigger value="template">Templates ({studio.templates.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="manual" className="pt-3">
                  <p className="text-xs text-muted-foreground mb-3">Edit the palette and fonts directly.</p>
                </TabsContent>
                <TabsContent value="image" className="pt-3 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={extractingStyle}>
                    {extractingStyle ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload reference image
                  </Button>
                  <p className="text-xs text-muted-foreground">PNG/JPG. AI vision extracts palette + layout (with lightweight fallback).</p>
                </TabsContent>
                <TabsContent value="url" className="pt-3 space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="https://lender.com" value={styleUrl} onChange={(e) => setStyleUrl(e.target.value)} />
                    <Button onClick={handleUrlExtract} disabled={extractingStyle}>
                      {extractingStyle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Pulls brand colors from the URL via AI inference + theme-color scrape.</p>
                </TabsContent>
                <TabsContent value="template" className="pt-3 space-y-2">
                  {studio.templates.length === 0 && <p className="text-sm text-muted-foreground">No saved templates yet.</p>}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {studio.templates.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-md border p-2">
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {t.palette.slice(0, 4).map((c, i) => <div key={i} className="w-4 h-4 rounded-sm border border-white/20" style={{ background: c.hex }} />)}
                          </div>
                          <span className="text-sm">{t.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => applyTemplate(t.id)}>Apply</Button>
                          <Button size="sm" variant="ghost" onClick={() => studio.deleteTemplate(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Palette editor */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                {palettePreview.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                    <input type="color" value={c.hex} onChange={(e) => updatePaletteColor(i, e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none bg-transparent" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{c.role} · {c.hex}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <Label className="text-xs">Heading font</Label>
                  <Input value={style.fonts?.heading || ""} onChange={(e) => setStyle((s) => ({ ...s, fonts: { ...s.fonts, heading: e.target.value } }))} />
                </div>
                <div>
                  <Label className="text-xs">Body font</Label>
                  <Input value={style.fonts?.body || ""} onChange={(e) => setStyle((s) => ({ ...s, fonts: { ...s.fonts, body: e.target.value } }))} />
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-xs">Layout notes (used in AI prompt)</Label>
                <Textarea rows={2} value={style.layout_notes || ""} onChange={(e) => setStyle((s) => ({ ...s, layout_notes: e.target.value }))} />
              </div>
            </div>

            {studio.documents.length > 0 && (
              <>
                <Separator />
                <div>
                  <Label className="mb-2 block">Existing documents for this deal</Label>
                  <div className="space-y-1.5">
                    {studio.documents.slice(0, 5).map((d) => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setDocId(d.id);
                          setDocType(d.document_type);
                          setTitle(d.title);
                          setSelectedSections(d.sections);
                          setStyle(d.style);
                          setHtml(d.html);
                          setStep("edit");
                        }}
                        className="w-full text-left flex items-center justify-between rounded-md border p-2 hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm truncate">{d.title}</span>
                          {d.status === "exported" && <Badge variant="secondary" className="text-[10px]">Exported</Badge>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{new Date(d.updated_at).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === "edit" && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr] overflow-hidden">
            {/* Left: revision panel */}
            <div className="border-r flex flex-col">
              <div className="p-4 border-b">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{DOCUMENT_TYPES.find((d) => d.value === docType)?.label}</div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {selectedSections.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{SECTIONS.find((x) => x.value === s)?.label || s}</Badge>
                  ))}
                </div>
              </div>
              <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                <div>
                  <Label className="text-xs">Follow-up revision</Label>
                  <Textarea
                    rows={4}
                    placeholder="e.g. 'Add a risk factor about customer concentration. Tighten the executive summary to 3 bullets.'"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                  <Button onClick={handleRevise} disabled={revising || !followUp.trim()} className="w-full mt-2">
                    {revising ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Revise
                  </Button>
                </div>
                <Separator />
                <div className="text-xs text-muted-foreground">
                  You can also click into the preview to edit text directly.
                </div>
                <Button variant="outline" size="sm" onClick={handleSyncEdits} className="w-full">
                  <Save className="h-3.5 w-3.5 mr-1.5" /> Save inline edits
                </Button>
                <Separator />
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={pushToDrive} onCheckedChange={(v) => setPushToDrive(!!v)} />
                    <Cloud className="h-3.5 w-3.5" /> Also push to Google Drive
                  </label>
                  <Button onClick={handleExport} disabled={exporting} className="w-full">
                    {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                    Export PDF & save to Data Room
                  </Button>
                </div>
              </div>
              <div className="p-3 border-t">
                <Button variant="ghost" size="sm" onClick={() => setStep("configure")} className="w-full">
                  ← Back to configuration
                </Button>
              </div>
            </div>

            {/* Right: editable preview */}
            <ScrollArea className="bg-muted/30">
              <div className="p-6">
                <div
                  ref={previewRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="bg-white rounded-md shadow-sm text-black"
                  style={{ minHeight: "60vh", outline: "none" }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </ScrollArea>
          </div>
        )}

        {step === "configure" && (
          <DialogFooter className="px-6 py-3 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate document
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
