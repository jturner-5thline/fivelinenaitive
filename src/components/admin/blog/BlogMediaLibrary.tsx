import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";

type MediaItem = { name: string; url: string };

export function BlogMediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all: MediaItem[] = [];
    for (const folder of ["covers", "inline"]) {
      const { data, error } = await supabase.storage.from("blog-media").list(folder, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (!error && data) {
        data.forEach((f) => {
          if (f.name === ".emptyFolderPlaceholder") return;
          const { data: pub } = supabase.storage.from("blog-media").getPublicUrl(`${folder}/${f.name}`);
          all.push({ name: `${folder}/${f.name}`, url: pub.publicUrl });
        });
      }
    }
    setItems(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">All cover and inline images uploaded for blog posts.</p>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No media uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((m) => (
            <div key={m.name} className="group relative rounded-md border border-border overflow-hidden bg-muted/20">
              <img src={m.url} alt={m.name} className="w-full h-32 object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] px-2 py-1 flex items-center justify-between">
                <span className="truncate">{m.name}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(m.url); toast.success("URL copied"); }}
                  className="ml-2 opacity-80 hover:opacity-100"
                  title="Copy URL"
                ><Copy className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}