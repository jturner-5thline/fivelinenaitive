import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HomepageHeader, HomepageFooter } from "@/components/homepage";

interface BlogPostFull {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body_html: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  tags: string[] | null;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("blog_posts" as any)
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (!cancelled) {
        setPost((data as unknown) as BlogPostFull | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <>
      <Helmet>
        <title>{post?.seo_title || post?.title || "Blog"} | naitive</title>
        {post?.seo_description && <meta name="description" content={post.seo_description} />}
      </Helmet>
      <div
        className="dark min-h-screen relative"
        style={{
          colorScheme: "dark",
          background:
            "linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)",
          backgroundAttachment: "fixed",
        }}
      >
        <HomepageHeader />

        <main className="container mx-auto px-6 py-16 md:py-24 max-w-3xl">
          <Link
            to="/homepage"
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-white/60" />
            </div>
          ) : !post ? (
            <div className="text-center py-20">
              <h1 className="text-3xl font-bold text-white mb-3">Post not found</h1>
              <p className="text-white/60">This article may have been moved or unpublished.</p>
            </div>
          ) : (
            <article>
              <div className="flex items-center gap-3 text-sm text-white/55 mb-5">
                {post.tags?.[0] && (
                  <span className="px-2.5 py-1 rounded-full bg-[hsl(270,55%,65%,0.12)] text-[hsl(270,75%,80%)] font-medium uppercase tracking-wider text-[10px]">
                    {post.tags[0]}
                  </span>
                )}
                {post.published_at && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(post.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white leading-[1.1] mb-6">{post.title}</h1>
              {post.excerpt && (
                <p className="text-lg text-white/70 leading-relaxed mb-10">{post.excerpt}</p>
              )}
              {post.cover_image_url && (
                <img
                  src={post.cover_image_url}
                  alt={post.cover_image_alt || post.title}
                  className="w-full rounded-2xl border border-white/10 mb-10"
                />
              )}
              <div
                className="prose prose-invert prose-lg max-w-none prose-headings:text-white prose-p:text-white/75 prose-a:text-[hsl(270,75%,80%)] prose-strong:text-white prose-li:text-white/75"
                dangerouslySetInnerHTML={{ __html: post.body_html || "" }}
              />
            </article>
          )}
        </main>

        <HomepageFooter />
      </div>
    </>
  );
}