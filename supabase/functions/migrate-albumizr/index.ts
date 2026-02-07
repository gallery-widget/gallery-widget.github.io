// Albumizr Migration Edge Function
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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

    // Construct Albumizr URL
    const albumUrl = `https://albumizr.com/${albumKey}`;
    
    console.log(`Fetching Albumizr album: ${albumUrl}`);

    // Fetch the Albumizr page with proper headers
    const response = await fetch(albumUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Albumizr page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    
    // Parse HTML
    const document = new DOMParser().parseFromString(html, 'text/html');
    
    if (!document) {
      throw new Error('Failed to parse HTML');
    }

    // Extract images from Albumizr structure
    const thumbnails = document.querySelectorAll('.th');
    const images: Array<{ url: string; caption?: string }> = [];

    thumbnails.forEach((thumb: any) => {
      const dataUrl = thumb.getAttribute('data-url');
      const dataCaption = thumb.getAttribute('data-caption') || '';
      
      if (dataUrl) {
        images.push({
          url: dataUrl,
          caption: dataCaption,
        });
      }
    });

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
        error: error.message,
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
