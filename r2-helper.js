// Cloudflare R2 上傳輔助函數
import { R2_CONFIG, validateR2Config } from './r2-config.js';

/**
 * 壓縮並上傳圖片到 Cloudflare R2
 * @param {Blob} blob - 圖片 Blob
 * @param {string} filename - 檔案名稱（包含路徑，例如：album_id/image_id.jpg）
 * @param {string} contentType - MIME 類型
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadToR2(blob, filename, contentType) {
  const validation = validateR2Config();
  if (!validation.valid) {
    return { success: false, error: validation.message };
  }

  try {
    // 建立 FormData
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('filename', filename);
    formData.append('contentType', contentType);

    // 上傳到 Cloudflare Worker
    const response = await fetch(R2_CONFIG.workerUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `R2 上傳失敗: ${errorText}` };
    }

    const result = await response.json();
    
    // 組合完整的公開 URL
    const publicUrl = `${R2_CONFIG.publicDomain}/${filename}`;
    
    return { success: true, url: publicUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 從 R2 刪除圖片
 * @param {string} filename - 要刪除的檔案名稱
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFromR2(filename) {
  const validation = validateR2Config();
  if (!validation.valid) {
    return { success: false, error: validation.message };
  }

  try {
    const response = await fetch(R2_CONFIG.workerUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `R2 刪除失敗: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 檢查 URL 是否為 R2 圖片
 * @param {string} pathOrUrl - 路徑或 URL
 * @returns {boolean}
 */
export function isR2Url(pathOrUrl) {
  if (!pathOrUrl) return false;
  return pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
}

/**
 * 從 R2 URL 提取檔案名稱
 * @param {string} url - R2 完整 URL
 * @returns {string} 檔案名稱
 */
export function extractFilenameFromR2Url(url) {
  try {
    const urlObj = new URL(url);
    // 移除開頭的 /
    return urlObj.pathname.substring(1);
  } catch {
    return url;
  }
}
