import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CompanyInfo {
  companyName?: string;
  description?: string;
  industries?: string[];
  location?: string;
  yearFounded?: string;
  headcount?: string;
  linkedinUrl?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured. Please connect Firecrawl in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping company URL:', formattedUrl);

    // Scrape the website with extract format for structured data extraction
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        // Firecrawl requires the 'extract' format when providing an extract option.
        formats: ['markdown', 'extract'],
        extract: {
          prompt: `Extract company information from this website. Return a JSON object with these fields:
- companyName: The company's name
- description: A brief company overview/description (2-3 sentences max)
- industry: The primary industry (one of: Technology, Healthcare, Finance, Manufacturing, Retail, Real Estate, Energy, Transportation, Media, Other)
- location: The company's headquarters location (city, state or country)
- yearFounded: When the company was founded (just the year, e.g., "2015")
- headcount: Approximate number of employees (just a number, e.g., "150")
- linkedinUrl: Company's LinkedIn page URL if found

Only include fields you can confidently extract. Skip fields where information is not clearly available.`,
        },
        onlyMainContent: true,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error('Firecrawl API error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || `Scrape failed with status ${scrapeResponse.status}` }),
        { status: scrapeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape response:', JSON.stringify(scrapeData, null, 2));

    // Extract company info from the extract response
    const extractData = scrapeData.data?.extract || scrapeData.extract || {};
    const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

    const companyInfo: CompanyInfo = {};

    // Map extracted data
    if (extractData.companyName) {
      companyInfo.companyName = extractData.companyName;
    } else if (metadata.title) {
      // Fallback to page title, clean it up
      const title = metadata.title.replace(/\s*[-|–—]\s*.+$/, '').trim();
      if (title && title.length < 100) {
        companyInfo.companyName = title;
      }
    }

    if (extractData.description) {
      companyInfo.description = extractData.description;
    } else if (metadata.description) {
      companyInfo.description = metadata.description;
    }

    if (extractData.industry) {
      // Map to our industry options
      const industryMap: Record<string, string> = {
        'tech': 'Technology',
        'software': 'Technology',
        'saas': 'Technology',
        'healthcare': 'Healthcare',
        'health': 'Healthcare',
        'medical': 'Healthcare',
        'finance': 'Finance',
        'fintech': 'Finance',
        'banking': 'Finance',
        'manufacturing': 'Manufacturing',
        'retail': 'Retail',
        'ecommerce': 'Retail',
        'e-commerce': 'Retail',
        'real estate': 'Real Estate',
        'realestate': 'Real Estate',
        'property': 'Real Estate',
        'energy': 'Energy',
        'oil': 'Energy',
        'gas': 'Energy',
        'renewable': 'Energy',
        'transportation': 'Transportation',
        'logistics': 'Transportation',
        'shipping': 'Transportation',
        'media': 'Media',
        'entertainment': 'Media',
        'advertising': 'Media',
      };

      const lowerIndustry = extractData.industry.toLowerCase();
      const mappedIndustry = industryMap[lowerIndustry] || 
        Object.entries(industryMap).find(([key]) => lowerIndustry.includes(key))?.[1] ||
        extractData.industry;
      
      companyInfo.industries = [mappedIndustry];
    }

    if (extractData.location) {
      companyInfo.location = extractData.location;
    }

    if (extractData.yearFounded) {
      const year = String(extractData.yearFounded).match(/\d{4}/)?.[0];
      if (year) {
        companyInfo.yearFounded = year;
      }
    }

    if (extractData.headcount) {
      const count = String(extractData.headcount).replace(/[^\d]/g, '');
      if (count) {
        companyInfo.headcount = count;
      }
    }

    if (extractData.linkedinUrl) {
      companyInfo.linkedinUrl = extractData.linkedinUrl;
    }

    console.log('Extracted company info:', companyInfo);

    return new Response(
      JSON.stringify({ success: true, data: companyInfo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping company:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape company website';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
