import { Helmet } from 'react-helmet-async';
import { NewsFeedPanel } from '@/components/dashboard/NewsFeedPanel';

export default function NewsFeed() {
  return (
    <>
      <Helmet>
        <title>Discover - Deal Intelligence | naitive</title>
        <meta name="description" content="Deal intelligence and market news for private credit professionals." />
      </Helmet>

      <div className="bg-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <NewsFeedPanel />
        </div>
      </div>
    </>
  );
}
