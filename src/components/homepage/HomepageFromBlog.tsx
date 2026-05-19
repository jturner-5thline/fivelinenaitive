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
        .limit(3);
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

  const [featured, ...rest] = posts;

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div
        ref={ref}
        className={`container mx-auto px-6 transition-all duration-700 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="flex items-end justify-between mb-10 md:mb-12 gap-6 flex-wrap">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-[hsl(270,65%,75%)] mb-3">
              From the blog
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.1]">
              Insights for modern deal teams
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FeaturedCard post={featured} />
          <div className="grid grid-cols-1 gap-6">
            {rest.map((p) => (
              <SupportingCard key={p.id} post={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const cardBase =
  "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all duration-300 hover:border-[hsl(270,55%,65%,0.4)] hover:bg-white/[0.05] hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_hsl(265,60%,3%,0.7)]";

function CategoryDate({ post }: { post: BlogPostLite }) {
  const category = post.tags?.[0];
  return (
    <div className="flex items-center gap-3 text-xs text-white/55 mb-3">
      {category && (
        <span className="px-2.5 py-1 rounded-full bg-[hsl(270,55%,65%,0.12)] text-[hsl(270,75%,80%)] font-medium uppercase tracking-wider text-[10px]">
          {category}
        </span>
      )}
      {post.published_at && (
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {formatDate(post.published_at)}
        </span>
      )}
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPostLite }) {
  return (
    <Link to={`/blog/${post.slug}`} className={`${cardBase} flex flex-col`}>
      <div className="relative aspect-[16/10] overflow-hidden bg-[hsl(270,30%,12%)]">
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
      <div className="p-7 md:p-8 flex-1 flex flex-col">
        <CategoryDate post={post} />
        <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-3 group-hover:text-[hsl(270,75%,85%)] transition-colors">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-base text-white/65 leading-relaxed mb-6 line-clamp-3">
            {post.excerpt}
          </p>
        )}
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-[hsl(270,75%,80%)]">
          Read article
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

function SupportingCard({ post }: { post: BlogPostLite }) {
  return (
    <Link to={`/blog/${post.slug}`} className={`${cardBase} flex flex-col sm:flex-row`}>
      <div className="relative sm:w-2/5 aspect-[16/10] sm:aspect-auto overflow-hidden bg-[hsl(270,30%,12%)] flex-shrink-0">
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
      <div className="p-5 md:p-6 flex-1 flex flex-col min-w-0">
        <CategoryDate post={post} />
        <h3 className="text-lg md:text-xl font-bold text-white leading-snug mb-2 group-hover:text-[hsl(270,75%,85%)] transition-colors line-clamp-2">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-sm text-white/60 leading-relaxed mb-4 line-clamp-2">
            {post.excerpt}
          </p>
        )}
        <span className="mt-auto inline-flex items-center gap-2 text-xs font-semibold text-[hsl(270,75%,80%)]">
          Read article
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}