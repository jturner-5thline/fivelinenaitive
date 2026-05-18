import { useEffect, useMemo, useState } from "react";
import { useBlogPost, useCreateBlogPost, useUpdateBlogPost, type BlogPostStatus } from "@/hooks/useBlogPosts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Upload, X, Eye, Save, Send, EyeOff } from "lucide-react";
import { toast } from "sonner";
import slugify from "slugify";
import DOMPurify from "dompurify";
import { BlogRichTextEditor } from "./BlogRichTextEditor";

type Props = {
  postId: string | null; // null = new
  onClose: () => void;
};

export function BlogPostEditor({ postId, onClose }: Props) {
  const { user } = useAuth();
  const { data: existing, isLoading } = useBlogPost(postId);
  const create = useCreateBlogPost();
  const update = useUpdateBlogPost();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverAlt, setCoverAlt] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [status, setStatus] = useState<BlogPostStatus>("draft");
  const [publishedAt, setPublishedAt] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setSlug(existing.slug);
      setSlugTouched(true);
      setExcerpt(existing.excerpt ?? "");
      setBodyHtml(existing.body_html ?? "");
      setCoverUrl(existing.cover_image_url);
      setCoverAlt(existing.cover_image_alt ?? "");
      setTags(existing.tags ?? []);
      setSeoTitle(existing.seo_title ?? "");
      setSeoDescription(existing.seo_description ?? "");
      setStatus(existing.status);
      setPublishedAt(existing.published_at ? existing.published_at.slice(0, 16) : "");
    }
  }, [existing]);

  // Auto-slug
  useEffect(() => {
    if (!slugTouched && title) {
      setSlug(slugify(title, { lower: true, strict: true }));
    }
  }, [title, slugTouched]);

  const handleCoverUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("blog-media").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("blog-media").getPublicUrl(path);
      setCoverUrl(data.publicUrl);
    } catch (e: any) {
      toast.error(`Cover upload failed: ${e.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const validate = () => {
    if (!title.trim()) { toast.error("Title is required"); return false; }
    if (!slug.trim()) { toast.error("Slug is required"); return false; }
    if (!bodyHtml || bodyHtml === "<p></p>") { toast.error("Body is required"); return false; }
    return true;
  };

  const buildPayload = (nextStatus: BlogPostStatus) => {
    const now = new Date().toISOString();
    return {
      title: title.trim(),
      slug: slugify(slug, { lower: true, strict: true }),
      excerpt: excerpt.trim() || null,
      body_html: bodyHtml,
      cover_image_url: coverUrl,
      cover_image_alt: coverAlt.trim() || null,
      author_id: existing?.author_id ?? user?.id ?? null,
      status: nextStatus,
      seo_title: seoTitle.trim() || null,
      seo_description: seoDescription.trim() || null,
      tags,
      published_at:
        nextStatus === "published"
          ? (publishedAt ? new Date(publishedAt).toISOString() : (existing?.published_at ?? now))
          : (publishedAt ? new Date(publishedAt).toISOString() : null),
      disabled_at: nextStatus === "disabled" ? now : null,
    };
  };

  const save = async (nextStatus: BlogPostStatus) => {
    if (!validate()) return;
    const payload = buildPayload(nextStatus);
    if (postId) {
      await update.mutateAsync({ id: postId, patch: payload });
    } else {
      const created = await create.mutateAsync(payload);
      if (created) onClose();
    }
  };

  const safeHtml = useMemo(() => DOMPurify.sanitize(bodyHtml || ""), [bodyHtml]);

  if (postId && isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading post…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1" /> Back to posts</Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? <><EyeOff className="h-4 w-4 mr-1" /> Edit</> : <><Eye className="h-4 w-4 mr-1" /> Preview</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => save("draft")} disabled={create.isPending || update.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          {status === "published" ? (
            <Button size="sm" onClick={() => save("published")} disabled={create.isPending || update.isPending}>
              <Save className="h-4 w-4 mr-1" /> Update
            </Button>
          ) : (
            <Button size="sm" onClick={() => save("published")} disabled={create.isPending || update.isPending}>
              <Send className="h-4 w-4 mr-1" /> Publish
            </Button>
          )}
        </div>
      </div>

      {preview ? (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          {coverUrl && <img src={coverUrl} alt={coverAlt} className="w-full max-h-72 object-cover rounded-md" />}
          <h1 className="text-3xl font-bold">{title || "Untitled"}</h1>
          {excerpt && <p className="text-muted-foreground">{excerpt}</p>}
          <article className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <Label htmlFor="b-title">Title *</Label>
              <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" className="text-lg" />
            </div>
            <div>
              <Label htmlFor="b-slug">Slug *</Label>
              <Input id="b-slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="post-url-slug" className="font-mono text-sm" />
            </div>
            <div>
              <Label htmlFor="b-excerpt">Excerpt</Label>
              <Textarea id="b-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="Short summary shown on cards…" />
            </div>
            <div>
              <Label>Body *</Label>
              <BlogRichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Write the post body…" />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as BlogPostStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
              <Label htmlFor="b-pub">Publish date</Label>
              <Input id="b-pub" type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <Label>Cover image</Label>
              {coverUrl ? (
                <div className="relative">
                  <img src={coverUrl} alt={coverAlt} className="w-full h-32 object-cover rounded-md" />
                  <Button variant="secondary" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => setCoverUrl(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-32 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/30 transition">
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">{uploading ? "Uploading…" : "Click to upload"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }} />
                </label>
              )}
              <Input placeholder="Alt text" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} />
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))} className="ml-1"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag and press Enter"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <Label>SEO</Label>
              <div className="space-y-1">
                <Label htmlFor="b-seo-t" className="text-xs text-muted-foreground">SEO title</Label>
                <Input id="b-seo-t" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={70} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="b-seo-d" className="text-xs text-muted-foreground">SEO description</Label>
                <Textarea id="b-seo-d" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={3} maxLength={160} />
              </div>
            </div>
          </div>
        </div>
      )}

      <Separator />
      <div className="text-xs text-muted-foreground">
        {existing
          ? `Last updated ${new Date(existing.updated_at).toLocaleString()}`
          : "New post — unsaved"}
      </div>
    </div>
  );
}