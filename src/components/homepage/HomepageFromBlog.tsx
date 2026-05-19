import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

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
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("blog_posts" as any)
        .select("id, title, slug, excerpt, cover_image_url, cover_image_alt, tags, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(12);
      if (!cancelled) {
        if (error) setPosts([]);
        else setPosts(((data ?? []) as unknown) as BlogPostLite[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!api) return;
    setScrollSnaps(api.scrollSnapList());
    setSelectedIndex(api.selectedScrollSnap());
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", () => {
      setScrollSnaps(api.scrollSnapList());
      setSelectedIndex(api.selectedScrollSnap());
    });
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (!posts || posts.length === 0) return null;

  return (
    <section className="py-16 md:py-24 bg-transparent">
      <div
        ref={ref}
        className={`container mx-auto px-6 transition-all duration-700 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="max-w-3xl mb-10 md:mb-12">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-[hsl(270,65%,75%)] mb-3">
            From the blog
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.1] mb-4">
            Insights for deal teams
          </h2>
          <p className="text-base md:text-lg text-white/65 leading-relaxed">
            The latest thinking on deal execution, lender management, diligence, and AI workflows.
          </p>
        </div>

        <Carousel
          setApi={setApi}
          opts={{ align: "start", loop: false }}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {posts.map((post) => (
              <CarouselItem
                key={post.id}
                className="pl-4 basis-full md:basis-1/2 lg:basis-1/3"
              >
                <BlogCard post={post} />
              </CarouselItem>
            ))}
          </CarouselContent>

          {posts.length > 1 && (
            <div className="flex items-center justify-between mt-8 gap-4">
              <div className="flex items-center gap-2">
                {scrollSnaps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => api?.scrollTo(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === selectedIndex
                        ? "w-8 bg-[hsl(270,75%,80%)]"
                        : "w-1.5 bg-white/25 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
              <div className="relative flex items-center gap-2">
                <CarouselPrevious className="static translate-y-0 h-10 w-10 border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white" />
                <CarouselNext className="static translate-y-0 h-10 w-10 border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white" />
              </div>
            </div>
          )}
        </Carousel>
      </div>
    </section>
  );
};

function BlogCard({ post }: { post: BlogPostLite }) {
  const category = post.tags?.[0];
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group relative h-full flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-all duration-300 hover:border-[hsl(270,55%,65%,0.4)] hover:bg-white/[0.05] hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_hsl(265,60%,3%,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(270,75%,80%)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
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
      <div className="p-6 md:p-7 flex-1 flex flex-col">
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
        <h3 className="text-lg md:text-xl font-bold text-white leading-snug mb-2 group-hover:text-[hsl(270,75%,85%)] transition-colors line-clamp-2">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-sm text-white/60 leading-relaxed mb-5 line-clamp-3">
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