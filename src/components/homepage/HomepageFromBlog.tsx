import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface BlogPostLite {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  tags: string[] | null;
  published_at: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export const HomepageFromBlog = () => {
  const { ref, isVisible } = useScrollReveal();
  const [posts, setPosts] = useState<BlogPostLite[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .select("id, title, slug, excerpt, cover_image_url, cover_image_alt, tags, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(6);
      if (!cancelled) {
        if (error) setPosts([]);
        else setPosts(((data ?? []) as unknown) as BlogPostLite[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!posts || posts.length === 0) return null;

  return (
    <section className="relative py-10 md:py-14">
      {/* Distinct surface */}
      <div
        aria-hidden
        className="absolute inset-x-0 inset-y-3 md:inset-y-4 bg-gradient-to-b from-[hsl(268,45%,12%,0.55)] via-[hsl(265,50%,8%,0.55)] to-[hsl(220,55%,10%,0.5)] border-y border-white/10 backdrop-blur-xl"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 inset-y-3 md:inset-y-4 bg-[radial-gradient(ellipse_at_top,hsl(270,70%,40%,0.18),transparent_60%)] pointer-events-none"
      />

      <div
        ref={ref}
        className="relative z-10 container mx-auto px-6"
      >
        <p className="text-base md:text-lg font-bold uppercase tracking-[0.25em] text-white mb-10 md:mb-12">
          Latest insights
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.slice(0, 6).map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
};

function BlogCard({ post }: { post: BlogPostLite }) {
  const category = post.tags?.[0];
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group relative h-full flex flex-col overflow-hidden rounded-2xl border border-[hsl(220,15%,22%,0.9)] bg-gradient-to-b from-[hsl(268,40%,16%,0.55)] to-[hsl(262,38%,9%,0.6)] backdrop-blur-2xl shadow-[inset_0_1px_0_hsl(220,15%,40%,0.12),0_1px_0_hsl(220,15%,8%,0.6),0_8px_24px_-12px_hsl(220,30%,2%,0.6)] transition-all duration-300 hover:border-[hsl(270,55%,55%,0.5)] hover:-translate-y-1 hover:shadow-[inset_0_1px_0_hsl(220,15%,40%,0.18),0_1px_0_hsl(220,15%,8%,0.6),0_18px_40px_-16px_hsl(265,60%,4%,0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(270,75%,80%)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      <div className="relative aspect-[16/9] lg:aspect-[3/2] overflow-hidden bg-[hsl(270,30%,12%)]">
        {post.cover_image_url ? (
          <img
            src={post.cover_image_url}
            alt={post.cover_image_alt || post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[hsl(270,40%,20%)] via-[hsl(265,50%,12%)] to-[hsl(220,60%,15%)]" />
        )}
      </div>
      <div className="p-5 lg:p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2 text-[11px] text-white/55 mb-2">
          {category && (
            <span className="px-2 py-0.5 rounded-full bg-[hsl(270,55%,65%,0.12)] text-[hsl(270,75%,80%)] font-medium uppercase tracking-wider text-[9px]">
              {category}
            </span>
          )}
          {post.published_at && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              {formatDate(post.published_at)}
            </span>
          )}
        </div>
        <h3 className="text-base lg:text-[15px] font-bold text-white leading-snug mb-2 group-hover:text-[hsl(270,75%,85%)] transition-colors line-clamp-2 min-h-[2.6rem]">
          {post.title}
        </h3>
        <p className="text-[13px] text-white/60 leading-relaxed mb-3 line-clamp-2 lg:line-clamp-2 min-h-[2.4rem]">
          {post.excerpt || ""}
        </p>
        <span className="mt-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-[hsl(270,75%,80%)] pt-2 border-t border-white/5 group-hover:border-white/10 transition-colors">
          Read article
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}