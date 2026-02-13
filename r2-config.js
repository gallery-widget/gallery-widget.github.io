// Cloudflare R2 設定檔
// 請在 Cloudflare Dashboard 設定完成後填入以下資訊

export const R2_CONFIG = {
  // 是否啟用 R2（設為 true 則使用 R2，false 則使用 Supabase Storage）
  enabled: true, // 設定完成後改為 true
  
  // R2 公開網域
  publicDomain: 'https://pub-ff61965a0e3743ddaf36732782e03991.r2.dev',
  
  // R2 API 端點
  accountId: '0ac0731416f23cf3d08177148882601b',
  
  // R2 存取憑證（使用 Cloudflare Workers 處理上傳）
  workerUrl: 'https://gallery-upload-worker.emily070124.workers.dev',
};

// 檢查 R2 配置是否完整
export function validateR2Config() {
  if (!R2_CONFIG.enabled) {
    return { valid: false, message: 'R2 未啟用' };
  }
  
  if (!R2_CONFIG.publicDomain) {
    return { valid: false, message: '缺少 R2 公開網域' };
  }
  
  if (!R2_CONFIG.workerUrl) {
    return { valid: false, message: '缺少 Worker URL' };
  }
  
  return { valid: true };
}
