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
    const body = await req.json();
    const { albumKey, method, imageUrl } = body;
    
    // Route 1: Extract images from Albumizr page
    if (albumKey && method === 'key') {
      return handleExtractImages(albumKey, corsHeaders);
    }
    
    // Route 2: Download image
    if (imageUrl) {
      return await handleDownloadImage(imageUrl, corsHeaders);
    }
    
    throw new Error('Missing required parameters (albumKey/method or imageUrl)');
    
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

function handleExtractImages(albumKey: string, corsHeaders: any) {
  return (async () => {
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
    
    // Extract imageList from JavaScript variable
    // Pattern: var imageList = [...];
    const imageListRegex = /var\s+imageList\s*=\s*(\[.*?\]);/s;
    const match = imageListRegex.exec(html);
    
    if (!match || !match[1]) {
      console.error('Could not find imageList variable in HTML');
      throw new Error('未找到圖片列表 (imageList 變數)');
    }
    
    const jsonString = match[1];
    console.log(`Found imageList JSON, length: ${jsonString.length}`);
    
    // Parse JSON
    let imageListData: Array<any>;
    try {
      imageListData = JSON.parse(jsonString);
    } catch (e) {
      console.error('Failed to parse imageList JSON:', e);
      throw new Error('解析圖片列表失敗');
    }
    
    console.log(`Parsed ${imageListData.length} images from imageList`);
    
    // Convert to our format
    const images: Array<{ url: string; caption?: string }> = [];
    
    for (const item of imageListData) {
      let url = item.url;
      const caption = item.caption || '';
      
      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (!url.startsWith('http')) {
        url = 'https://albumizr.com' + url;
      }
      
      images.push({
        url: url,
        caption: caption,
      });
      
      console.log(`Image: url=${url}, caption=${caption}`);
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
  })();
}

async function handleDownloadImage(imageUrl: string, corsHeaders: any) {
  console.log(`Downloading image: ${imageUrl}`);
  
  // Fetch image from Albumizr
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://albumizr.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  
  console.log(`Downloaded image, size: ${blob.size}, type: ${blob.type}`);

  // Return the image blob with proper headers
  return new Response(blob, {
    headers: {
      ...corsHeaders,
      'Content-Type': blob.type,
      'Content-Length': blob.size,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
