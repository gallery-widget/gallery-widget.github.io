// Cloudflare Worker 程式碼
// 這個 Worker 負責處理圖片上傳到 R2
// 部署到 Cloudflare Workers: https://dash.cloudflare.com/workers

export default {
  async fetch(request, env) {
    // 動態 CORS 標頭 - 支援本地開發和生產環境
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://gallery-widget.github.io',   // 生產環境
      'http://127.0.0.1:5500',              // VS Code Live Server
      'http://localhost:5500',              // 本地開發
      'http://127.0.0.1:5501',              // 其他本地端口
      'http://localhost:5501',
    ];
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://gallery-widget.github.io',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 處理 OPTIONS 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // POST: 上傳圖片
      if (request.method === 'POST') {
        // 檢查 R2 Bucket 綁定
        if (!env.ALBUM_BUCKET) {
          return new Response(
            JSON.stringify({ 
              error: 'R2 Bucket 未綁定',
              hint: '請在 Worker 設定中綁定 R2 Bucket（變數名稱：ALBUM_BUCKET）'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const filename = formData.get('filename');
        const contentType = formData.get('contentType') || 'image/jpeg';

        if (!file || !filename) {
          return new Response(
            JSON.stringify({ error: '缺少檔案或檔名' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 上傳到 R2
        await env.ALBUM_BUCKET.put(filename, file, {
          httpMetadata: {
            contentType: contentType,
          },
        });

        return new Response(
          JSON.stringify({ 
            success: true, 
            filename: filename,
            message: '上傳成功' 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // DELETE: 刪除圖片
      if (request.method === 'DELETE') {
        const { filename } = await request.json();

        if (!filename) {
          return new Response(
            JSON.stringify({ error: '缺少檔名' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await env.ALBUM_BUCKET.delete(filename);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: '刪除成功' 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // GET: 轉換圖片或檢查服務狀態
      if (request.method === 'GET') {
        const url = new URL(request.url);
        
        // 處理圖片轉換請求：/transform?key=...&quality=...&format=...
        if (url.pathname === '/transform' || url.pathname.endsWith('/transform')) {
          const objectKey = url.searchParams.get('key');
          const quality = url.searchParams.get('quality') || '50';
          const format = url.searchParams.get('format') || 'webp';
          
          if (!objectKey) {
            return new Response(
              JSON.stringify({ error: '缺少 key 參數' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (!env.ALBUM_BUCKET) {
            return new Response(
              JSON.stringify({ error: 'R2 Bucket 未綁定' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          try {
            // 從 R2 讀取圖片
            const object = await env.ALBUM_BUCKET.get(objectKey);
            
            if (!object) {
              return new Response(
                JSON.stringify({ error: '圖片不存在' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            // 構造一個可以被 cf.image 處理的 URL
            // 使用 R2 public domain URL
            const publicUrl = `https://pub-ff61965a0e3743ddaf36732782e03991.r2.dev/${objectKey}`;
            const imageRequestWithCF = new Request(publicUrl, {
              cf: {
                image: {
                  fit: 'scale-down',
                  quality: parseInt(quality),
                  format: format,
                }
              }
            });
            
            const imageResponse = await fetch(imageRequestWithCF);
            
            // 構建新的響應頭
            const newFilename = objectKey.split('/').pop().replace(/\.[^.]+$/, `.${format}`);
            const responseHeaders = {
              ...corsHeaders,
              'Content-Type': imageResponse.headers.get('Content-Type') || `image/${format}`,
              'Cache-Control': 'public, max-age=31536000',
              'Content-Disposition': `inline; filename="${newFilename}"`,
            };
            
            return new Response(imageResponse.body, {
              status: 200,
              headers: responseHeaders
            });
          } catch (error) {
            console.error('Image transformation error:', error);
            // 如果轉換失敗，返回原始圖片
            try {
              const object = await env.ALBUM_BUCKET.get(objectKey);
              if (!object) {
                return new Response(
                  JSON.stringify({ error: '圖片不存在' }),
                  { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
              
              const buffer = await object.arrayBuffer();
              const ext = objectKey.split('.').pop()?.toLowerCase();
              let contentType = 'image/jpeg';
              if (ext === 'png') contentType = 'image/png';
              else if (ext === 'webp') contentType = 'image/webp';
              
              return new Response(buffer, {
                status: 200,
                headers: {
                  ...corsHeaders,
                  'Content-Type': contentType,
                  'Cache-Control': 'public, max-age=31536000',
                  'Content-Disposition': `inline; filename="${objectKey.split('/').pop()}"`,
                }
              });
            } catch (fallbackError) {
              return new Response(
                JSON.stringify({ error: '讀取圖片失敗：' + fallbackError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }
        
        // 處理文件獲取請求（用於下載/複製）：/file?key=...
        if (url.pathname === '/file' || url.pathname.endsWith('/file')) {
          const objectKey = url.searchParams.get('key');
          
          if (!objectKey) {
            return new Response(
              JSON.stringify({ error: '缺少 key 參數' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (!env.ALBUM_BUCKET) {
            return new Response(
              JSON.stringify({ error: 'R2 Bucket 未綁定' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          try {
            // 從 R2 讀取文件
            const object = await env.ALBUM_BUCKET.get(objectKey);
            
            if (!object) {
              return new Response(
                JSON.stringify({ error: '文件不存在' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            // 讀取文件數據
            const buffer = await object.arrayBuffer();
            
            // 根據文件類型設置正確的 Content-Type
            let contentType = 'application/octet-stream';
            const ext = objectKey.split('.').pop()?.toLowerCase();
            if (ext === 'png') contentType = 'image/png';
            else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
            else if (ext === 'gif') contentType = 'image/gif';
            else if (ext === 'webp') contentType = 'image/webp';
            
            const responseHeaders = {
              ...corsHeaders,
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000',
              'Content-Disposition': `attachment; filename="${objectKey.split('/').pop()}"`,
              'Content-Length': buffer.byteLength.toString(),
            };
            
            return new Response(buffer, {
              status: 200,
              headers: responseHeaders
            });
          } catch (error) {
            return new Response(
              JSON.stringify({ error: '讀取文件失敗：' + error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        
        // 檢查服務狀態
        return new Response(
          JSON.stringify({ 
            status: 'ok',
            service: 'Gallery Widget R2 Upload Service',
            features: ['upload', 'delete', 'transform']
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      });

    } catch (error) {
      // 詳細錯誤日誌
      console.error('Worker 錯誤:', error);
      return new Response(
        JSON.stringify({ 
          error: error.message,
          stack: error.stack,
          type: error.name 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  },
};
