// Albumizr Migration Edge Function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { albumKey, method } = await req.json();
    
    if (!albumKey) {
      throw new Error('Missing albumKey parameter');
    }

    // Construct Albumizr URL with correct format
    const albumUrl = `https://albumizr.com/skins/bandana/index.php?key=${albumKey}`;
    
    console.log(`Fetching Albumizr album: ${albumUrl}`);

    // Fetch the Albumizr page with proper headers
    const response = await fetch(albumUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://albumizr.com/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Albumizr page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    console.log(`Fetched HTML, length: ${html.length}`);
    
    // Extract images using regex
    const images: Array<{ url: string; caption?: string }> = [];
    
    // Pattern: <div data-url="URL" data-caption="CAPTION" class="th" ...>
    // Match all divs with data-url attribute
    const divRegex = /<div[^>]*data-url="([^"]+)"[^>]*data-caption="([^"]*)"[^>]*class="th"/gi;
    let match;
    
    while ((match = divRegex.exec(html)) !== null) {
      const url = match[1];
      const caption = match[2] || '';
      
      images.push({
        url: url,
        caption: caption,
      });
      
      console.log(`Found image: url=${url}, caption=${caption}`);
    }

    console.log(`Extracted ${images.length} images from ${albumUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        images,
        albumKey,
        count: images.length,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error in migrate-albumizr function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
})
