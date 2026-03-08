import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Video, Search, Play, Clock, CheckCircle, Filter } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useVideoResources, useVideoCategories, useMyVideoViews, useTrackVideoView, formatDuration } from '@/hooks/useVideoLibrary';

const levelColors: Record<string, string> = {
  intro: 'bg-primary/10 text-primary',
  intermediate: 'bg-warning/10 text-warning',
  advanced: 'bg-destructive/10 text-destructive',
};

export default function VideoLibrary() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedVideo, setSelectedVideo] = useState<any>(null);

  const { data: videos = [], isLoading } = useVideoResources(category);
  const { data: categories = [] } = useVideoCategories();
  const { data: views = [] } = useMyVideoViews();
  const trackView = useTrackVideoView();

  const viewedIds = new Set(views.map(v => v.video_resource_id));
  const completedIds = new Set(views.filter(v => v.completed_at).map(v => v.video_resource_id));

  const filtered = videos.filter(v =>
    v.title.toLowerCase().includes(search.toLowerCase()) ||
    v.description?.toLowerCase().includes(search.toLowerCase()) ||
    v.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handlePlay = (video: any) => {
    setSelectedVideo(video);
    trackView.mutate({ videoId: video.id });
  };

  const completedCount = filtered.filter(v => completedIds.has(v.id)).length;
  const progress = filtered.length ? Math.round((completedCount / filtered.length) * 100) : 0;

  return (
    <>
      <Helmet><title>Video Library | Naitive</title></Helmet>
      <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
        <DealsHeader title="Video Library" subtitle="Learn at your own pace with curated video resources" />

        {/* Progress bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{completedCount} of {filtered.length} completed</span>
              <span className="text-xs text-muted-foreground">{progress}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search videos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {categories.map(c => (
                <TabsTrigger key={c} value={c} className="capitalize">{c}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Video className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No videos found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(video => (
              <Card key={video.id} className="group cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={() => handlePlay(video)}>
                <div className="relative aspect-video bg-muted">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center">
                    <Play className="h-12 w-12 text-background opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {completedIds.has(video.id) && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle className="h-5 w-5 text-success" />
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 bg-foreground/70 text-background text-xs px-1.5 py-0.5 rounded">
                    {formatDuration(video.duration_seconds)}
                  </div>
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <h3 className="font-medium text-sm line-clamp-2">{video.title}</h3>
                  {video.description && <p className="text-xs text-muted-foreground line-clamp-2">{video.description}</p>}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${levelColors[video.level] || ''}`}>
                      {video.level}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] capitalize">{video.category}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Video Player Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={open => !open && setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>{selectedVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="aspect-video">
            {selectedVideo && (
              <iframe
                src={selectedVideo.video_url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
          {selectedVideo?.description && (
            <div className="p-4 pt-2 text-sm text-muted-foreground">{selectedVideo.description}</div>
          )}
          <div className="p-4 pt-0 flex gap-2">
            {selectedVideo?.tags?.map((t: string) => (
              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
