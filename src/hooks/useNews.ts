import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type NewsCategory = 'all' | 'watchlist' | 'active-deals' | 'lenders' | 'borrowers' | 'competitors' | 'market' | 'regulatory' | 'sectors';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: 'lenders' | 'clients';
  summary: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
  lenderName?: string;
  // New fields for enhanced feed
  newsCategory?: NewsCategory;
  sourceTier?: 1 | 2 | 3;
  relevanceReason?: string;
  author?: string;
  whyItMatters?: string;
}

const TIER_1_SOURCES = ['Wall Street Journal', 'Bloomberg', 'Reuters', 'Financial Times'];
const TIER_2_SOURCES = ['Private Debt Investor', 'PitchBook', 'Leveraged Commentary & Data', 'S&P Global', 'Preqin'];

export function getSourceTier(source: string): 1 | 2 | 3 {
  if (TIER_1_SOURCES.some(s => source.toLowerCase().includes(s.toLowerCase()))) return 1;
  if (TIER_2_SOURCES.some(s => source.toLowerCase().includes(s.toLowerCase()))) return 2;
  return 3;
}

// Extended mock data for private credit professionals
const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'fallback-1',
    title: 'Private Credit Market Sees Record Growth in Q4 as Banks Retreat',
    source: 'Wall Street Journal',
    category: 'lenders',
    newsCategory: 'lenders',
    summary: 'Major private credit lenders report unprecedented deal flow as traditional banks pull back from leveraged lending. Direct lenders originated over $180B in new loans.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=300&fit=crop',
    sourceTier: 1,
    author: 'Matt Wirz',
    whyItMatters: 'Signals continued shift of leveraged lending from banks to private credit, expanding deal pipeline for direct lenders.',
    relevanceReason: 'Matches keyword: private credit',
  },
  {
    id: 'fallback-2',
    title: 'Apollo Global Closes $5B Infrastructure Credit Fund, Exceeding Target',
    source: 'Bloomberg',
    category: 'lenders',
    newsCategory: 'lenders',
    summary: 'Apollo Global Management closed its fifth infrastructure credit fund at $5 billion, exceeding its $4B initial target. The fund will focus on digital infrastructure and energy transition.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop',
    sourceTier: 1,
    author: 'Silas Brown',
    whyItMatters: 'Apollo\'s oversubscription indicates strong LP appetite for infrastructure credit strategies.',
    relevanceReason: 'Related to deal: TechFlow Capital',
  },
  {
    id: 'fallback-3',
    title: 'Mid-Market Borrowers Seek Alternative Financing as Bank Standards Tighten',
    source: 'Financial Times',
    category: 'clients',
    newsCategory: 'borrowers',
    summary: 'Growing number of mid-market companies turn to private credit as bank lending standards tighten amid regulatory pressure. Spreads have compressed 50-75bps.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop',
    sourceTier: 1,
    author: 'Harriet Agnew',
    whyItMatters: 'Spread compression could impact returns across existing portfolio and new originations.',
  },
  {
    id: 'fallback-4',
    title: 'Federal Reserve Signals Cautious Approach to Rate Cuts in 2026',
    source: 'Reuters',
    category: 'clients',
    newsCategory: 'market',
    summary: 'Fed Chair Powell indicated that rate cuts will be gradual and data-dependent, citing persistent services inflation. Markets now price in only two cuts this year.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    sourceTier: 1,
    author: 'Howard Schneider',
    whyItMatters: 'Higher-for-longer rates support floating-rate private credit returns but increase borrower stress.',
    relevanceReason: 'Matches keyword: interest rates',
  },
  {
    id: 'fallback-5',
    title: 'Ares Management Launches $3.2B European Direct Lending Vehicle',
    source: 'Private Debt Investor',
    category: 'lenders',
    newsCategory: 'competitors',
    summary: 'Ares Management is raising a new European direct lending fund targeting €3.2 billion, focusing on upper mid-market sponsor-backed transactions.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    sourceTier: 2,
    author: 'John Bakie',
    whyItMatters: 'Ares\' European expansion could increase competition for sponsor-backed deals in your target market.',
    relevanceReason: 'Mentions Ares Management',
  },
  {
    id: 'fallback-6',
    title: 'SEC Proposes New Disclosure Requirements for Private Fund Advisers',
    source: 'S&P Global',
    category: 'lenders',
    newsCategory: 'regulatory',
    summary: 'The SEC has proposed enhanced reporting rules for private credit funds, including quarterly performance statements and fee disclosures to LPs.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    sourceTier: 2,
    author: 'Staff Report',
    whyItMatters: 'New disclosure rules would increase compliance costs and operational burden for fund managers.',
  },
  {
    id: 'fallback-7',
    title: 'Healthcare Lending Surges as Sector Consolidation Accelerates',
    source: 'PitchBook',
    category: 'clients',
    newsCategory: 'sectors',
    summary: 'Private credit deal volume in healthcare reached $28B YTD, driven by physician practice management roll-ups and behavioral health consolidation.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=300&fit=crop',
    sourceTier: 2,
    author: 'Hilary Collins',
    whyItMatters: 'Healthcare remains a top sector for deal flow — relevant to Summit Healthcare Partners.',
    relevanceReason: 'Related to deal: Summit Healthcare Partners',
  },
  {
    id: 'fallback-8',
    title: 'Covenant-Lite Structures Now Dominate 78% of New Direct Lending Deals',
    source: 'Leveraged Commentary & Data',
    category: 'lenders',
    newsCategory: 'market',
    summary: 'Analysis shows covenant-lite terms have expanded from 45% to 78% of new direct lending transactions over the past 18 months, raising credit quality concerns.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    sourceTier: 2,
    whyItMatters: 'Erosion of covenant protections increases downside risk in the current cycle.',
    relevanceReason: 'Matches keyword: covenant-lite',
  },
  {
    id: 'fallback-9',
    title: 'Blue Owl Capital Reports Record Q4 Originations of $12.4B',
    source: 'Bloomberg',
    category: 'lenders',
    newsCategory: 'competitors',
    summary: 'Blue Owl Capital posted record quarterly originations, driven by technology and software lending verticals. AUM surpassed $200B for the first time.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 11).toISOString(),
    sourceTier: 1,
    author: 'Allison McNeely',
    whyItMatters: 'Blue Owl\'s growth in software lending signals competitive pressure in tech-focused direct lending.',
  },
  {
    id: 'fallback-10',
    title: 'European CLO Issuance Hits €45B in First Half, Up 23% YoY',
    source: 'Financial Times',
    category: 'lenders',
    newsCategory: 'market',
    summary: 'European CLO formation has reached record levels, providing additional leverage and liquidity to the direct lending ecosystem.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    sourceTier: 1,
    author: 'Robert Smith',
    whyItMatters: 'Rising CLO issuance signals strong institutional demand for leveraged credit products.',
  },
  {
    id: 'fallback-11',
    title: 'Athyna Announces $150M Series C to Expand Global Talent Platform',
    source: 'PitchBook',
    category: 'clients',
    newsCategory: 'active-deals',
    summary: 'Talent marketplace Athyna has raised $150M in Series C funding led by Insight Partners, with participation from existing investors.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 16).toISOString(),
    sourceTier: 2,
    whyItMatters: 'Direct pipeline impact — Athyna is in your active deal portfolio.',
    relevanceReason: 'Related to deal: Athyna',
  },
  {
    id: 'fallback-12',
    title: 'Default Rates in Private Credit Rise to 2.8% in Q1',
    source: 'S&P Global',
    category: 'lenders',
    newsCategory: 'market',
    summary: 'S&P Global reports trailing 12-month default rates in private credit have risen to 2.8%, up from 1.9% a year ago. Consumer and healthcare sectors lead distress.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    sourceTier: 2,
    whyItMatters: 'Rising defaults warrant portfolio review, especially in consumer and healthcare exposures.',
    relevanceReason: 'Matches keyword: default rates',
  },
  {
    id: 'fallback-13',
    title: 'KKR Targets $10B for Largest-Ever Asset-Based Finance Fund',
    source: 'Wall Street Journal',
    category: 'lenders',
    newsCategory: 'competitors',
    summary: 'KKR is raising what would be the largest asset-based finance fund in private credit history, targeting equipment leasing, trade finance, and specialty lending.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    sourceTier: 1,
    author: 'Laura Cooper',
    whyItMatters: 'KKR\'s push into ABF represents new competition for specialty lending platforms.',
  },
  {
    id: 'fallback-14',
    title: 'Basel III Endgame: Final Rules Expected to Boost Private Credit',
    source: 'Reuters',
    category: 'lenders',
    newsCategory: 'regulatory',
    summary: 'Final Basel III endgame rules expected in Q2 will increase capital requirements for banks, likely pushing more borrowers toward private credit alternatives.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    sourceTier: 1,
    whyItMatters: 'Basel III endgame could be a secular tailwind for private credit origination volumes.',
  },
  {
    id: 'fallback-15',
    title: 'Software & Technology Sector Sees 35% Increase in Private Credit Deals',
    source: 'Private Debt Investor',
    category: 'clients',
    newsCategory: 'sectors',
    summary: 'Technology-focused direct lending has surged, with recurring revenue lending models gaining traction among mid-market SaaS and infrastructure software companies.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    sourceTier: 2,
    author: 'Andy Thomson',
    whyItMatters: 'Software lending premiums have compressed — review portfolio exposure to this sector.',
  },
  {
    id: 'fallback-16',
    title: 'Blackstone Credit Reports $48B in Deployable Capital',
    source: 'Bloomberg',
    category: 'lenders',
    newsCategory: 'competitors',
    summary: 'Blackstone Credit & Insurance disclosed $48 billion in dry powder across its credit strategies, positioning for opportunistic deal activity.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    sourceTier: 1,
    author: 'Dawn Lim',
    whyItMatters: 'Blackstone\'s massive dry powder could intensify pricing competition on large-cap deals.',
  },
  {
    id: 'fallback-17',
    title: 'Equal Capital Increases Focus on Middle-Market Healthcare Lending',
    source: 'Leveraged Commentary & Data',
    category: 'lenders',
    newsCategory: 'watchlist',
    summary: 'Equal Capital has expanded its healthcare lending team with three senior hires and plans to deploy $800M into the sector over the next 12 months.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    sourceTier: 2,
    whyItMatters: 'Direct competitor move in a core lending vertical.',
    relevanceReason: 'Mentions Equal Capital',
  },
  {
    id: 'fallback-18',
    title: 'CFPB Issues Guidance on Private Credit Reporting Obligations',
    source: 'S&P Global',
    category: 'lenders',
    newsCategory: 'regulatory',
    summary: 'New CFPB guidance clarifies that private credit funds with retail borrower exposure must comply with fair lending disclosure requirements.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    sourceTier: 2,
    whyItMatters: 'May impact compliance requirements for any consumer-adjacent lending strategies.',
  },
  {
    id: 'fallback-19',
    title: 'Sponsor-Backed M&A Volume Recovers 40% in Q1, Driving Financing Demand',
    source: 'PitchBook',
    category: 'clients',
    newsCategory: 'market',
    summary: 'PE-backed M&A activity rebounded sharply in Q1, with deal count up 40% YoY. Average leverage multiples have stabilized at 5.2x.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 40).toISOString(),
    sourceTier: 2,
    whyItMatters: 'Recovering M&A activity is the primary driver of new private credit origination.',
  },
  {
    id: 'fallback-20',
    title: 'Golub Capital Prices $2.1B CLO, Largest Private Credit CLO to Date',
    source: 'Wall Street Journal',
    category: 'lenders',
    newsCategory: 'lenders',
    summary: 'Golub Capital priced the largest-ever private credit CLO at $2.1 billion, with AAA tranches at SOFR+155. The deal was 3x oversubscribed.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    sourceTier: 1,
    author: 'Sally Bakewell',
    whyItMatters: 'Tight CLO pricing reflects strong institutional confidence in private credit asset quality.',
  },
];

const CACHE_KEY = 'news-feed-cache-v5';
const CACHE_DURATION = 15 * 60 * 1000;

interface CachedNews {
  news: NewsItem[];
  timestamp: number;
}

export function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const enrichNews = (items: NewsItem[]): NewsItem[] => {
    return items.map(item => ({
      ...item,
      sourceTier: item.sourceTier || getSourceTier(item.source),
    }));
  };

  const fetchNews = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { news: cachedNews, timestamp }: CachedNews = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            setNews(enrichNews(cachedNews));
            setLastFetched(new Date(timestamp));
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error('Error reading cache:', e);
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: lenderData } = await supabase
        .from('master_lenders')
        .select('name')
        .limit(20);

      const lenderNames = lenderData?.map(l => l.name) || [];

      const { data, error: fnError } = await supabase.functions.invoke('fetch-news', {
        body: { lenderNames }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.news && data.news.length > 0) {
        const enriched = enrichNews(data.news);
        setNews(enriched);
        setLastFetched(new Date());
        const cacheData: CachedNews = { news: enriched, timestamp: Date.now() };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      } else {
        setNews(enrichNews(FALLBACK_NEWS));
        setError('Using cached news data');
      }
    } catch (err) {
      console.error('Error fetching news:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch news');
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { news: cachedNews }: CachedNews = JSON.parse(cached);
          setNews(enrichNews(cachedNews));
        } else {
          setNews(enrichNews(FALLBACK_NEWS));
        }
      } catch {
        setNews(enrichNews(FALLBACK_NEWS));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return {
    news,
    isLoading,
    error,
    lastFetched,
    refetch: () => fetchNews(true),
  };
}
