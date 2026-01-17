import { Helmet } from 'react-helmet-async';
import { NewsFeedWidget } from '@/components/deals/NewsFeedWidget';

export default function NewsFeed() {
  return (
    <>
      <Helmet>
        <title>News Feed - nAItive</title>
        <meta name="description" content="Stay updated with the latest news from the lending and finance industry." />
      </Helmet>

      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-serif text-foreground">News Feed</h1>
            <p className="text-muted-foreground mt-1">
              Stay updated with the latest news from the lending and finance industry
            </p>
          </div>

          <NewsFeedWidget defaultOpen={true} />
        </div>
      </div>
    </>
  );
}
