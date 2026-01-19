import { Helmet } from 'react-helmet-async';
import { Newspaper } from 'lucide-react';
import { NewsGrid } from '@/components/news/NewsGrid';

export default function NewsFeed() {
  return (
    <>
      <Helmet>
        <title>News Feed - nAItive</title>
        <meta name="description" content="Stay updated with the latest news from the lending and finance industry." />
      </Helmet>

      <div className="bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Newspaper className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Discover</h1>
              <p className="text-sm text-muted-foreground">
                Latest news from the lending and finance industry
              </p>
            </div>
          </div>

          {/* News Grid */}
          <NewsGrid />
        </div>
      </div>
    </>
  );
}
