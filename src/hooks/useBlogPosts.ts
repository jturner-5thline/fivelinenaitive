import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BlogPostStatus = "draft" | "published" | "disabled";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body_html: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  author_id: string | null;
  status: BlogPostStatus;
  seo_title: string | null;
  seo_description: string | null;
  tags: string[];
  published_at: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogPostInput = Omit<BlogPost, "id" | "created_at" | "updated_at">;

const QK = ["admin", "blog-posts"] as const;

export function useBlogPosts() {
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BlogPost[];
    },
    staleTime: 30_000,
  });
}

export function useBlogPost(id?: string | null) {
  return useQuery({
    queryKey: ["admin", "blog-post", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BlogPost | null;
    },
    enabled: !!id,
  });
}

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<BlogPostInput>) => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .insert(input as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as BlogPost;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Post created");
    },
    onError: (e: any) => toast.error(`Create failed: ${e?.message ?? e}`),
  });
}

export function useUpdateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BlogPostInput> }) => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .update(patch as any)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as BlogPost;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["admin", "blog-post", vars.id] });
      toast.success("Post saved");
    },
    onError: (e: any) => toast.error(`Save failed: ${e?.message ?? e}`),
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success("Post deleted");
    },
    onError: (e: any) => toast.error(`Delete failed: ${e?.message ?? e}`),
  });
}