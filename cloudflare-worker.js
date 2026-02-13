// Cloudflare Worker 程式碼
// 這個 Worker 負責處理圖片上傳到 R2
// 部署到 Cloudflare Workers: https://dash.cloudflare.com/workers

export default {
  async fetch(request, env) {
    // 動態 CORS 標頭 - 支援本地開發和生產環境
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://ebluvu.github.io',           // 生產環境
      'http://127.0.0.1:5500',              // VS Code Live Server
      'http://localhost:5500',              // 本地開發
      'http://127.0.0.1:5501',              // 其他本地端口
      'http://localhost:5501',
    ];
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://ebluvu.github.io',
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

      // GET: 檢查服務狀態
      if (request.method === 'GET') {
        return new Response(
          JSON.stringify({ 
            status: 'ok',
            service: 'Gallery Widget R2 Upload Service' 
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
