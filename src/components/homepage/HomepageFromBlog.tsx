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

  // Re-measure embla once posts arrive so slide widths apply
  useEffect(() => {
    if (!api || !posts) return;
    requestAnimationFrame(() => api.reInit());
  }, [api, posts]);

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
        <Carousel
          setApi={setApi}
          opts={{ align: "start", loop: false, slidesToScroll: 1, containScroll: "trimSnaps" }}
          className="w-full"
        >
          <CarouselContent className="-ml-4 md:-ml-5">
            {posts.map((post) => (
              <CarouselItem
                key={post.id}
                className="pl-4 md:pl-5 !basis-full sm:!basis-1/2 min-[720px]:!basis-1/3 !min-w-0 !shrink-0 !grow-0"
              >
                <BlogCard post={post} />
              </CarouselItem>
            ))}
          </CarouselContent>

          {posts.length > 1 && (
            <div className="flex items-center justify-between mt-10 gap-4">
              <div className="flex items-center gap-1.5">
                {scrollSnaps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => api?.scrollTo(i)}
                    className={`h-1 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(270,75%,80%)] ${
                      i === selectedIndex
                        ? "w-6 bg-white/55"
                        : "w-1 bg-white/15 hover:bg-white/30"
                    }`}
                  />
                ))}
              </div>
              <div className="relative flex items-center gap-3">
                <CarouselPrevious
                  aria-label="Previous post"
                  className="static translate-y-0 h-14 w-14 rounded-full border-2 border-[hsl(270,75%,80%,0.6)] bg-gradient-to-br from-[hsl(270,65%,45%,0.55)] to-[hsl(220,70%,40%,0.45)] text-white hover:from-[hsl(270,75%,55%,0.75)] hover:to-[hsl(220,80%,50%,0.65)] hover:border-[hsl(270,85%,88%)] hover:text-white hover:scale-105 active:scale-95 shadow-[0_12px_32px_-8px_hsl(270,90%,35%,0.7)] transition-all [&_svg]:h-5 [&_svg]:w-5 disabled:opacity-30"
                />
                <CarouselNext
                  aria-label="Next post"
                  className="static translate-y-0 h-14 w-14 rounded-full border-2 border-[hsl(270,75%,80%,0.6)] bg-gradient-to-br from-[hsl(270,65%,45%,0.55)] to-[hsl(220,70%,40%,0.45)] text-white hover:from-[hsl(270,75%,55%,0.75)] hover:to-[hsl(220,80%,50%,0.65)] hover:border-[hsl(270,85%,88%)] hover:text-white hover:scale-105 active:scale-95 shadow-[0_12px_32px_-8px_hsl(270,90%,35%,0.7)] transition-all [&_svg]:h-5 [&_svg]:w-5 disabled:opacity-30"
                />
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