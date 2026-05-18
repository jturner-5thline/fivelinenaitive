import { useMemo, useState } from "react";
import { useBlogPosts, useUpdateBlogPost, useDeleteBlogPost, useCreateBlogPost, type BlogPost, type BlogPostStatus } from "@/hooks/useBlogPosts";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MoreHorizontal, Pencil, Copy, Eye, EyeOff, Trash2, ImageOff, Plus } from "lucide-react";
import { format } from "date-fns";
import slugify from "slugify";

const statusVariant: Record<BlogPostStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  published: { label: "Published", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  disabled:  { label: "Disabled",  className: "bg-muted text-muted-foreground border-border" },
};

type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
};

export function BlogPostsTable({ onEdit, onNew }: Props) {
  const { data: posts, isLoading } = useBlogPosts();
  const update = useUpdateBlogPost();
  const create = useCreateBlogPost();
  const del = useDeleteBlogPost();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | BlogPostStatus>("all");
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (posts ?? []).filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
    });
  }, [posts, search, status]);

  const handleTogglePublish = (p: BlogPost) => {
    if (p.status === "published") {
      update.mutate({ id: p.id, patch: { status: "draft", published_at: null } });
    } else {
      update.mutate({ id: p.id, patch: { status: "published", published_at: new Date().toISOString(), disabled_at: null } });
    }
  };

  const handleToggleDisable = (p: BlogPost) => {
    if (p.status === "disabled") {
      update.mutate({ id: p.id, patch: { status: "draft", disabled_at: null } });
    } else {
      update.mutate({ id: p.id, patch: { status: "disabled", disabled_at: new Date().toISOString() } });
    }
  };

  const handleDuplicate = async (p: BlogPost) => {
    const base = `${p.slug}-copy`;
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    create.mutate({
      title: `${p.title} (Copy)`,
      slug: slugify(slug, { lower: true, strict: true }),
      excerpt: p.excerpt,
      body_html: p.body_html,
      cover_image_url: p.cover_image_url,
      cover_image_alt: p.cover_image_alt,
      author_id: p.author_id,
      status: "draft",
      seo_title: p.seo_title,
      seo_description: p.seo_description,
      tags: p.tags,
      published_at: null,
      disabled_at: null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search title or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={onNew} size="sm"><Plus className="h-4 w-4 mr-1" /> New Post</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Cover</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  {posts?.length === 0 ? "No posts yet. Click New Post to create your first one." : "No posts match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const sv = statusVariant[p.status];
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => onEdit(p.id)}>
                    <TableCell>
                      {p.cover_image_url ? (
                        <img src={p.cover_image_url} alt="" className="h-10 w-14 object-cover rounded-md border border-border" />
                      ) : (
                        <div className="h-10 w-14 rounded-md border border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
                          <ImageOff className="h-4 w-4" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{p.slug}</TableCell>
                    <TableCell><Badge variant="outline" className={sv.className}>{sv.label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(p.updated_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.published_at ? format(new Date(p.published_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(p.id)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(p)}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleTogglePublish(p)}>
                            {p.status === "published" ? (<><EyeOff className="h-4 w-4 mr-2" /> Unpublish</>) : (<><Eye className="h-4 w-4 mr-2" /> Publish</>)}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleDisable(p)}>
                            {p.status === "disabled" ? "Enable" : "Disable"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(p)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes "{confirmDelete?.title}". To hide a post without deleting, use Disable instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) del.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}