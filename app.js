import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { R2_CONFIG } from './r2-config.js';
import { uploadToR2, deleteFromR2, isR2Url, extractFilenameFromR2Url } from './r2-helper.js';

// 處理舊網址重定向並清理舊會話：優先於 Supabase 初始化執行
(function() {
  const currentHostname = window.location.hostname;
  const isFromOldDomain = currentHostname === 'ebluvu.github.io';
  
  if (isFromOldDomain) {
    // 複製 query parameters，跳轉前清理舊會話
    const urlParams = new URLSearchParams(window.location.search);
    const newUrl = new URL('https://gallery-widget.github.io/');
    
    // 保留其他參數
    const paramsToPreserve = ['album', 'owner', 'ref'];
    paramsToPreserve.forEach(param => {
      const value = urlParams.get(param);
      if (value) newUrl.searchParams.set(param, value);
    });
    
    // 清理舊域名的 Supabase 會話（在跳轉前）
    const lsKeys = Object.keys(localStorage);
    for (const key of lsKeys) {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        try {
          localStorage.removeItem(key);
          console.log('已移除舊域名 localStorage:', key);
        } catch (e) {}
      }
    }
    
    // 重定向
    window.location.replace(newUrl.toString());
    throw new Error('Redirecting to new domain');
  }
})();

const SUPABASE_URL = "https://eooudvssawtdtttrwyfr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sX69Y-P_n8QgAkrcb8gGtQ_FoKhG9mj";
const BUCKET = "album";
const MAX_IMAGE_SIZE = 1600;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// 清理舊域名來源的會話數據，防止跨域污染
(function cleanupOldDomainSessions() {
  // 檢查 localStorage 中是否有舊域名的 Supabase 會話數據
  const lsKeys = Object.keys(localStorage);
  for (const key of lsKeys) {
    // 移除可能來自舊域名的 Supabase session keys
    if (key.startsWith('sb-') || key.includes('supabase') || key.includes('ebluvu')) {
      try {
        const value = localStorage.getItem(key);
        // 如果值包含 ebluvu 標記，這可能是舊域名的數據
        if (value && value.includes('ebluvu')) {
          localStorage.removeItem(key);
          console.log('已移除舊域名 localStorage:', key);
        }
      } catch (e) {
        console.warn('清理 localStorage 時出錯:', e);
      }
    }
  }
})();

// 圖片URL輔助函數：為預覽生成優化版本，為下載/開啟保留原圖
function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function getImageUrl(pathOrUrl, options = {}) {
  // 如果是 R2 的完整 URL，可選擇性地轉換為 WebP 格式（只在顯示層面）
  if (isR2Url(pathOrUrl)) {
    if (options.preview) {
      // 使用 ImageKit CDN 進行 WebP 轉換和優化
      const quality = options.quality || '50';
      // 從 R2 URL 提取相對路徑（移除 domain）
      const relativePath = pathOrUrl.replace(R2_CONFIG.publicDomain, '').replace(/^\//, '');
      // ImageKit URL 格式：https://ik.imagekit.io/ebluvu/[相對路徑]?tr=q-[quality],f-webp
      const imagekitUrl = `${R2_CONFIG.imagekitUrl}/${relativePath}?tr=q-${quality},f-webp`;
      return imagekitUrl;
    }
    // 原始閱讀時返回完整 URL（保留原始格式）
    return pathOrUrl;
  }
  
  // 否則使用 Supabase Storage
  const url = supabase.storage.from(BUCKET).getPublicUrl(pathOrUrl).data.publicUrl;
  
  // 如果是預覽模式，添加 transform 參數來優化載入速度
  if (options.preview) {
    // 使用 render/image 端點可確保轉換被套用
    const renderUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}/${encodeStoragePath(pathOrUrl)}`;
    const urlObj = new URL(renderUrl);
    // 只設置品質參數，不限制寬度，保持原始縱橫比
    urlObj.searchParams.set('quality', options.quality || '50');
    urlObj.searchParams.set('resize', 'contain');
    // 添加版本號強制刷新快取
    urlObj.searchParams.set('v', '1');
    if (options.format) {
      urlObj.searchParams.set('format', options.format);
    }
    return urlObj.toString();
  }
  
  // 原始URL用於下載、複製、開啟操作
  return url;
}

const state = {
  user: null,
  album: null,
  images: [],
};

let pickr = null;
let loadAlbumsRun = 0;
let draggedAlbumElement = null;

// 設定記憶功能 - 從 localStorage 讀取上次的設定
function getLastSettings() {
  try {
    const saved = localStorage.getItem('galleryWidgetSettings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('無法讀取儲存的設定:', e);
  }
  return {
    theme: 'slideshow',
    background_color: '#101828',
    notion_block_color: 'default',
    add_new_first: false
  };
}

// 儲存設定到 localStorage
function saveLastSettings(settings) {
  try {
    localStorage.setItem('galleryWidgetSettings', JSON.stringify(settings));
  } catch (e) {
    console.warn('無法儲存設定:', e);
  }
}

// 等待 Pickr 库加载完成
async function waitForPickr(timeout = 5000) {
  const start = Date.now();
  while (typeof Pickr === 'undefined') {
    if (Date.now() - start > timeout) {
      console.error('Pickr 库加载失败');
      return false;
    }
    await new Promise(r => setTimeout(r, 10));
  }
  return true;
}

const ui = {
  emailInput: document.getElementById("emailInput"),
  signInForm: document.getElementById("signInForm"),
  signInBtn: document.getElementById("signInBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  userBadge: document.getElementById("userBadge"),
  albumList: document.getElementById("albumList"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  embedCode: document.getElementById("embedCode"),
  shareLink: document.getElementById("shareLink"),
  embedPreview: document.getElementById("embedPreview"),
  themeSelect: document.getElementById("themeSelect"),
  bgColor: document.getElementById("bgColor"),
  notionBlockColorSelect: document.getElementById("notionBlockColorSelect"),
  addNewSelect: document.getElementById("addNewSelect"),
  imageList: document.getElementById("imageList"),
  loginModal: document.getElementById("loginModal"),
  openLoginModalBtn: document.getElementById("openLoginModalBtn"),
  closeModalBtn: document.getElementById("closeModalBtn"),
  googleSignInBtn: document.getElementById("googleSignInBtn"),
  toastContainer: document.getElementById("toastContainer"),
  // Migration UI elements
  albumizrUrls: document.getElementById("albumizrUrls"),
  startMigrationBtn: document.getElementById("startMigrationBtn"),
  clearMigrationBtn: document.getElementById("clearMigrationBtn"),
  migrationStatus: document.getElementById("migrationStatus"),
  migrationProgressBar: document.getElementById("migrationProgressBar"),
  migrationLog: document.getElementById("migrationLog"),
};

// Toast 通知系統
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // 圖標映射
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">✕</button>
  `;
  
  const closeBtn = toast.querySelector('.toast-close');
  
  function removeToast() {
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 300);
  }
  
  closeBtn.addEventListener('click', removeToast);
  
  ui.toastContainer.appendChild(toast);
  
  // 自動移除
  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
  
  return toast;
}

function setStatus(message, type = 'info') {
  if (!message) return;
  showToast(message, type);
}

function logUpload(message) {
  showToast(message, 'success', 3000);
}

function newId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes]
    .map((b, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? "-" : "") + b.toString(16).padStart(2, "0"))
    .join("");
}

function getAnonymousAlbumId() {
  return state.album?.id || localStorage.getItem('anonymousAlbumId');
}





function currentEmbedUrl() {
  if (!state.album) {
    return "";
  }
  const url = new URL("embed.html", window.location.href);
  url.searchParams.set("album", state.album.id);
  if (state.user) {
    url.searchParams.set("owner", "1");
  }
  return url.toString();
}

async function refreshAuth() {
  const { data: sessionData } = await supabase.auth.getSession();
  state.user = sessionData.session?.user || null;
  renderAuth();
}

function renderAuth() {
  if (state.user) {
    ui.signInForm.classList.add("hidden");
    ui.signOutBtn.classList.remove("hidden");
    ui.userBadge.textContent = state.user.email || "已登入";
    document.getElementById("albumSection").classList.remove("hidden");
  } else {
    ui.signInForm.classList.remove("hidden");
    ui.signOutBtn.classList.add("hidden");
    ui.userBadge.textContent = "未登入";
    document.getElementById("albumSection").classList.add("hidden");
  }
}

// 轉移匿名相簿到登入用戶
async function transferAnonymousAlbums(userId) {
  try {
    const anonymousAlbumId = localStorage.getItem('anonymousAlbumId');
    
    if (!anonymousAlbumId) {
      return;
    }
    
    // 先檢查相簿是否真的存在且是匿名相簿
    const { data: album, error: fetchError } = await supabase
      .from('albums')
      .select('id, owner_id')
      .eq('id', anonymousAlbumId)
      .is('owner_id', null)
      .single();
    
    // 如果相簿不存在或已經有 owner，靜默清除記錄
    if (fetchError || !album) {
      localStorage.removeItem('anonymousAlbumId');
      return;
    }
    
    showToast('正在轉移匿名相簿...', 'info', 2000);
    
    // 更新相簿的 owner_id
    const { error } = await supabase
      .from('albums')
      .update({ owner_id: userId })
      .eq('id', anonymousAlbumId)
      .is('owner_id', null);
    
    if (error) {
      console.error('轉移匿名相簿失敗:', error);
      showToast('轉移相簿時發生錯誤', 'error');
      // 清除記錄避免重複嘗試
      localStorage.removeItem('anonymousAlbumId');
    } else {
      showToast('成功保留相簿！', 'success');
      // 清除記錄
      localStorage.removeItem('anonymousAlbumId');
      
      // 清空當前相簿狀態，因為匿名相簿已經轉移，需要重新選擇
      state.album = null;
      state.images = [];
      ui.imageList.innerHTML = "";
    }
  } catch (e) {
    console.error('處理匿名相簿轉移時發生錯誤:', e);
    // 清除記錄避免重複嘗試
    localStorage.removeItem('anonymousAlbumId');
  }
}

async function loadAlbums() {
  const runId = ++loadAlbumsRun;
  ui.albumList.innerHTML = "";
  if (!state.user) {
    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = "登入後會顯示相簿列表。";
    ui.albumList.appendChild(info);
    return;
  }

  const { data: albums, error } = await supabase
    .from("albums")
    .select("id, title, created_at, sort_order")
    .eq("owner_id", state.user.id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (runId !== loadAlbumsRun) {
    return;
  }

  if (error) {
    setStatus(error.message, 'error');
    return;
  }

  if (!albums.length) {
    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = "尚無相簿。上傳圖片會自動建立新相簿。";
    ui.albumList.appendChild(info);
  }



  for (const album of albums) {
    // 获取该相册的前5张图片
    const { data: images } = await supabase
      .from("images")
      .select("path")
      .eq("album_id", album.id)
      .order("sort_order", { ascending: true })
      .limit(5);

    const card = document.createElement("div");
    card.className = "album-card";
    card.draggable = true;
    card.dataset.albumId = album.id;
    card.dataset.index = albums.indexOf(album);
    if (state.album && state.album.id === album.id) {
      card.classList.add("selected");
    }

    // 封面预览
    const preview = document.createElement("div");
    preview.className = `album-card-preview count-${Math.min(images?.length || 0, 5)}`;
    
    if (images && images.length > 0) {
      images.slice(0, 5).forEach((img) => {
        const imgEl = document.createElement("img");
        imgEl.src = getImageUrl(img.path, { preview: true, quality: '30' });
        preview.appendChild(imgEl);
      });
    } else {
      preview.style.background = "rgba(255,255,255,0.05)";
    }

    // 可编辑标题
    const input = document.createElement("input");
    input.className = "field";
    input.value = album.title || "";
    input.placeholder = "相簿名稱";
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", async () => {
      const newTitle = input.value.trim();
      const { error } = await supabase
        .from("albums")
        .update({ title: newTitle })
        .eq("id", album.id);
      if (error) {
        setStatus(error.message, 'error');
      } else if (state.album && state.album.id === album.id) {
        state.album.title = newTitle;
        updateEmbed();
      }
    });



    // 删除按钮
    const actions = document.createElement("div");
    actions.className = "album-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn ghost";
    deleteBtn.textContent = "✕";
    deleteBtn.style.fontSize = "18px";
    deleteBtn.style.width = "32px";
    deleteBtn.style.height = "32px";
    deleteBtn.style.padding = "0";
    deleteBtn.style.display = "flex";
    deleteBtn.style.alignItems = "center";
    deleteBtn.style.justifyContent = "center";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm(`確定要刪除相簿「${album.title || '未命名'}」嗎？這會刪除所有圖片。`)) {
        await deleteAlbum(album.id);
      }
    });
    actions.appendChild(deleteBtn);

    // 拖曳事件
    card.addEventListener("dragstart", handleAlbumDragStart);
    card.addEventListener("dragover", handleAlbumDragOver);
    card.addEventListener("dragenter", handleAlbumDragEnter);
    card.addEventListener("dragleave", handleAlbumDragLeave);
    card.addEventListener("drop", handleAlbumDrop);
    card.addEventListener("dragend", handleAlbumDragEnd);

    // 点击卡片选中相册
    card.addEventListener("click", () => {
      loadAlbum(album.id);
    });

    card.appendChild(preview);
    card.appendChild(input);
    card.appendChild(actions);
    ui.albumList.appendChild(card);
  }



  // 只在有相簿時才顯示建立相簿按鈕
  if (albums.length > 0) {
    const createCard = document.createElement("button");
    createCard.type = "button";
    createCard.className = "album-card album-card-create";
    createCard.addEventListener("click", () => {
      // 清除當前選中的相簿，這樣uploadImages會自動創建新相簿
      state.album = null;
      state.images = [];
      ui.imageList.innerHTML = "";
      updateEmbed();
      
      // 移除所有相簿的選中狀態
      document.querySelectorAll(".album-card").forEach(card => {
        card.classList.remove("selected");
      });
      
      // 觸發文件選擇
      ui.fileInput.click();
    });

    const createContent = document.createElement("div");
    createContent.className = "album-card-create-content";

    const createPlus = document.createElement("span");
    createPlus.className = "album-card-create-plus";
    createPlus.textContent = "+";

    const createText = document.createElement("span");
    createText.className = "album-card-create-text";
    createText.textContent = "建立相簿";

    createContent.appendChild(createPlus);
    createContent.appendChild(createText);
    createCard.appendChild(createContent);
    ui.albumList.appendChild(createCard);
  }
}

// 只更新特定相簿卡片的預覽圖像，而不重新渲染整個列表
async function updateAlbumCardPreview(albumId) {
  // 找到對應的相簿卡片
  const albumCard = ui.albumList.querySelector(`[data-album-id="${albumId}"]`);
  if (!albumCard) {
    return;
  }

  // 獲取該相簿的前5張圖片
  const { data: images } = await supabase
    .from("images")
    .select("path")
    .eq("album_id", albumId)
    .order("sort_order", { ascending: true })
    .limit(5);

  // 更新預覽容器
  const preview = albumCard.querySelector(".album-card-preview");
  if (preview) {
    preview.innerHTML = "";
    preview.className = `album-card-preview count-${Math.min(images?.length || 0, 5)}`;
    
    if (images && images.length > 0) {
      images.slice(0, 5).forEach((img) => {
        const imgEl = document.createElement("img");
        imgEl.src = getImageUrl(img.path, { preview: true, quality: '30' });
        preview.appendChild(imgEl);
      });
    } else {
      preview.style.background = "rgba(255,255,255,0.05)";
    }
  }
}

async function createAlbum(title) {
  // 從 localStorage 讀取上次的設定
  const lastSettings = getLastSettings();
  
  // 如果没有提供标题，自动生成
  if (!title) {
    // 匿名用户使用空名称
    if (!state.user) {
      title = "";
    } else {
      const { data: albums } = await supabase
        .from("albums")
        .select("title")
        .eq("owner_id", state.user.id)
        .like("title", "相簿-%");
      
      let maxNum = 0;
      if (albums) {
        albums.forEach(album => {
          const match = album.title.match(/^相簿-(\d+)$/);
          if (match) {
            maxNum = Math.max(maxNum, parseInt(match[1]));
          }
        });
      }
      title = `相簿-${maxNum + 1}`;
    }
  }

  // 獲取當前最大的 sort_order
  let maxSortOrder = 0;
  if (state.user) {
    const { data: existingAlbums } = await supabase
      .from("albums")
      .select("sort_order")
      .eq("owner_id", state.user.id)
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);
    
    if (existingAlbums && existingAlbums.length > 0 && existingAlbums[0].sort_order != null) {
      maxSortOrder = existingAlbums[0].sort_order;
    }
  }

  const payload = {
    id: newId(),
    title,
    owner_id: state.user ? state.user.id : null,
    theme: lastSettings.theme || "slideshow",
    background_color: lastSettings.background_color || "#101828",
    notion_block_color: lastSettings.notion_block_color || "default",
    add_new_first: lastSettings.add_new_first || false,
    sort_order: maxSortOrder + 1,
  };

  const { data, error } = await supabase
    .from("albums")
    .insert(payload)
    .select()
    .single();

  if (error) {
    setStatus(error.message, 'error');
    return null;
  }

  // 如果是匿名用戶創建的相簿，記錄當前相簿 ID 到 localStorage 以便登入時轉移
  if (!state.user && data) {
    try {
      localStorage.setItem('anonymousAlbumId', data.id);
    } catch (e) {
      console.warn('無法記錄匿名相簿:', e);
    }
  }

  state.album = data;
  ui.themeSelect.value = data.theme || "slideshow";
  ui.bgColor.value = data.background_color || "#101828";
  if (pickr) {
    pickr.setColor(data.background_color || "#101828");
  }
  ui.notionBlockColorSelect.value = data.notion_block_color || "default";
  ui.addNewSelect.value = data.add_new_first ? "first" : "last";
  await loadImages();
  updateEmbed();
  return data;
}

async function loadAlbum(albumId) {
  const { data, error } = await supabase
    .from("albums")
    .select("*")
    .eq("id", albumId)
    .single();

  if (error) {
    setStatus(error.message, 'error');
    return;
  }

  state.album = data;
  ui.themeSelect.value = data.theme || "slideshow";
  ui.bgColor.value = data.background_color || "#101828";
  if (pickr) {
    pickr.setColor(data.background_color || "#101828");
  }
  ui.notionBlockColorSelect.value = data.notion_block_color || "default";
  ui.addNewSelect.value = data.add_new_first ? "first" : "last";
  await loadImages();
  updateEmbed();
  
  // 手動更新選中狀態（避免重繪整個列表）
  document.querySelectorAll(".album-card").forEach(card => {
    if (card.dataset.albumId === albumId) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
}

async function loadImages() {
  ui.imageList.innerHTML = "";
  if (!state.album) {
    return;
  }

  const { data, error } = await supabase
    .from("images")
    .select("*")
    .eq("album_id", state.album.id)
    .order("sort_order", { ascending: true });

  if (error) {
    setStatus(error.message, 'error');
    return;
  }

  state.images = data;
  renderImages();
}

function renderImages() {
  ui.imageList.innerHTML = "";

  if (!state.images.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "尚無圖片。";
    ui.imageList.appendChild(empty);
    return;
  }

  state.images.forEach((image, index) => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.draggable = true;
    card.dataset.imageId = image.id;
    card.dataset.index = index;

    const img = document.createElement("img");
    img.src = getImageUrl(image.path, { preview: true, quality: '30' });

    const input = document.createElement("input");
    input.className = "field";
    input.value = image.caption || "";
    input.placeholder = "圖片說明";
    input.addEventListener("change", () => updateCaption(image.id, input.value));

    const linkInput = document.createElement("input");
    linkInput.className = "field image-link-input";
    linkInput.type = "url";
    linkInput.value = image.custom_link || "";
    linkInput.placeholder = "自訂連結";
    linkInput.addEventListener("change", () => updateImageLink(image.id, linkInput));

    const actions = document.createElement("div");
    // 匿名和登入用戶都可以刪除相片
    if (state.album) {
      const remove = document.createElement("button");
      remove.className = "btn ghost";
      remove.textContent = "✕";
      remove.style.fontSize = "18px";
      remove.style.width = "32px";
      remove.style.height = "32px";
      remove.style.padding = "0";
      remove.style.display = "flex";
      remove.style.alignItems = "center";
      remove.style.justifyContent = "center";
      remove.addEventListener("click", () => deleteImage(image));
      actions.appendChild(remove);
    }

    // 拖拽事件
    card.addEventListener("dragstart", handleDragStart);
    card.addEventListener("dragover", handleDragOver);
    card.addEventListener("dragenter", handleDragEnter);
    card.addEventListener("dragleave", handleDragLeave);
    card.addEventListener("drop", handleDrop);
    card.addEventListener("dragend", handleDragEnd);

    card.appendChild(img);
    card.appendChild(input);
    card.appendChild(linkInput);
    card.appendChild(actions);
    ui.imageList.appendChild(card);
  });
}

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = e.currentTarget;
  e.currentTarget.style.opacity = "0.4";
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
}

function handleDragEnter(e) {
  if (e.currentTarget !== draggedElement) {
    e.currentTarget.style.borderTop = "3px solid var(--accent)";
  }
}

function handleDragLeave(e) {
  e.currentTarget.style.borderTop = "";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  return false;
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (draggedElement !== e.currentTarget) {
    const fromIndex = parseInt(draggedElement.dataset.index);
    const toIndex = parseInt(e.currentTarget.dataset.index);
    
    // 重新排序state.images数组
    const [movedItem] = state.images.splice(fromIndex, 1);
    state.images.splice(toIndex, 0, movedItem);
    
    // 更新数据库
    (async () => {
      await updateImageOrder();
      updateEmbed();
    })();
    
    // 重新渲染
    renderImages();
  }

  e.currentTarget.style.borderTop = "";
  return false;
}

function handleDragEnd(e) {
  e.currentTarget.style.opacity = "";
  e.currentTarget.style.borderTop = "";
  
  // 清除所有拖拽样式
  document.querySelectorAll(".image-card").forEach(card => {
    card.style.borderTop = "";
  });
}

async function updateImageOrder() {
  const updates = state.images.map((image, index) => ({
    id: image.id,
    sort_order: index,
  }));

  for (const update of updates) {
    await supabase
      .from("images")
      .update({ sort_order: update.sort_order })
      .eq("id", update.id);
  }
}

// 相簿拖曳處理函數
function handleAlbumDragStart(e) {
  draggedAlbumElement = e.currentTarget;
  e.currentTarget.style.opacity = "0.4";
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
}

function handleAlbumDragEnter(e) {
  if (e.currentTarget !== draggedAlbumElement && e.currentTarget.classList.contains('album-card')) {
    e.currentTarget.style.borderTop = "3px solid var(--accent)";
  }
}

function handleAlbumDragLeave(e) {
  if (e.currentTarget.classList.contains('album-card')) {
    e.currentTarget.style.borderTop = "";
  }
}

function handleAlbumDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  return false;
}

async function handleAlbumDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (draggedAlbumElement !== e.currentTarget && e.currentTarget.classList.contains('album-card')) {
    const fromId = draggedAlbumElement.dataset.albumId;
    const toId = e.currentTarget.dataset.albumId;
    
    // 獲取當前所有相簿
    const { data: albums, error } = await supabase
      .from("albums")
      .select("id, sort_order")
      .eq("owner_id", state.user.id)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error || !albums) {
      setStatus('無法更新相簿順序', 'error');
      return false;
    }

    // 找到拖曳的相簿索引
    const fromIndex = albums.findIndex(a => a.id === fromId);
    const toIndex = albums.findIndex(a => a.id === toId);

    if (fromIndex !== -1 && toIndex !== -1) {
      // 重新排序
      const [movedAlbum] = albums.splice(fromIndex, 1);
      albums.splice(toIndex, 0, movedAlbum);

      // 更新資料庫中的 sort_order
      await updateAlbumOrder(albums);
      
      // 手動更新 DOM 而不是重新載入整個列表
      const allCards = Array.from(ui.albumList.querySelectorAll('.album-card:not(.album-card-create)'));
      const fromCard = allCards[fromIndex];
      const toCard = allCards[toIndex];
      
      if (fromCard && toCard) {
        // 移除拖曳的卡片
        fromCard.remove();
        
        // 在目標位置插入
        if (fromIndex < toIndex) {
          // 向下拖曳：插入到目標之後
          toCard.parentNode.insertBefore(fromCard, toCard.nextSibling);
        } else {
          // 向上拖曳：插入到目標之前
          toCard.parentNode.insertBefore(fromCard, toCard);
        }
        
        // 更新所有卡片的 data-index
        const updatedCards = Array.from(ui.albumList.querySelectorAll('.album-card:not(.album-card-create)'));
        updatedCards.forEach((card, idx) => {
          card.dataset.index = idx;
        });
      }
    }
  }

  e.currentTarget.style.borderTop = "";
  return false;
}

function handleAlbumDragEnd(e) {
  e.currentTarget.style.opacity = "";
  e.currentTarget.style.borderTop = "";
  
  // 清除所有拖曳樣式
  document.querySelectorAll(".album-card").forEach(card => {
    card.style.borderTop = "";
  });
}

async function updateAlbumOrder(albums) {
  const updates = albums.map((album, index) => ({
    id: album.id,
    sort_order: index,
  }));

  for (const update of updates) {
    await supabase
      .from("albums")
      .update({ sort_order: update.sort_order })
      .eq("id", update.id);
  }
}

async function updateCaption(imageId, caption) {
  const { error } = await supabase
    .from("images")
    .update({ caption })
    .eq("id", imageId);

  if (error) {
    setStatus(error.message, 'error');
    return;
  }
  
  // 同步更新 state.images 以防止拖拽时丢失
  const image = state.images.find(img => img.id === imageId);
  if (image) {
    image.caption = caption;
  }
  
  // 更新预览面板
  updateEmbed();
}

function normalizeExternalLink(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function isValidExternalLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const hostname = url.hostname;
    if (!hostname || !hostname.includes(".")) {
      return false;
    }
    if (hostname.startsWith(".") || hostname.endsWith(".")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function updateImageLink(imageId, inputEl) {
  const rawValue = inputEl.value;
  const image = state.images.find(img => img.id === imageId);
  const normalized = normalizeExternalLink(rawValue);

  if (normalized && !isValidExternalLink(normalized)) {
    setStatus("請填入有效連結。", 'warning');
    inputEl.value = image?.custom_link || "";
    return;
  }

  const payload = { custom_link: normalized || null };
  const { error } = await supabase
    .from("images")
    .update(payload)
    .eq("id", imageId);

  if (error) {
    setStatus(error.message, 'error');
    return;
  }

  if (image) {
    image.custom_link = payload.custom_link;
  }

  inputEl.value = payload.custom_link || "";

  updateEmbed();
}

async function deleteImage(image) {
  const { error: deleteRowError } = await supabase
    .from("images")
    .delete()
    .eq("id", image.id);

  if (deleteRowError) {
    setStatus(deleteRowError.message, 'error');
    return;
  }

  // 根據路徑類型決定刪除方式
  if (isR2Url(image.path)) {
    // 從 R2 刪除
    const filename = extractFilenameFromR2Url(image.path);
    const result = await deleteFromR2(filename);
    if (!result.success) {
      console.warn('R2 刪除失敗:', result.error);
      // 繼續執行，因為資料庫記錄已刪除
    }
  } else {
    // 從 Supabase Storage 刪除
    await supabase.storage.from(BUCKET).remove([image.path]);
  }
  
  await loadImages();
  // 刪除圖片後更新相簿卡片預覽
  if (state.album) {
    await updateAlbumCardPreview(state.album.id);
  }
  if (state.album && state.images.length === 0) {
    const deletedAlbumId = state.album.id;
    state.album = null;
    state.images = [];
    ui.imageList.innerHTML = "";
    updateEmbed();
    if (state.user) {
      await deleteAlbum(deletedAlbumId);
    } else {
      await deleteAnonymousAlbumRecord(deletedAlbumId);
    }
    return;
  }



  updateEmbed();
}

async function deleteAnonymousAlbumRecord(albumId) {
  const { error } = await supabase
    .from("albums")
    .delete()
    .eq("id", albumId)
    .is("owner_id", null);

  if (error) {
    console.warn("匿名刪除相簿記錄失敗:", error);
  }
}

async function deleteAlbum(albumId) {
  // 只有認證用戶才能刪除相簿及其存儲文件
  if (!state.user) {
    setStatus("只有登入用戶才能刪除相簿。", 'warning');
    return;
  }

  // 先獲取所有圖片路徑
  const { data: images } = await supabase
    .from("images")
    .select("path")
    .eq("album_id", albumId);

  // 刪除所有圖片記錄
  const { error: deleteImagesError } = await supabase
    .from("images")
    .delete()
    .eq("album_id", albumId);

  if (deleteImagesError) {
    setStatus(deleteImagesError.message, 'error');
    return;
  }

  // 刪除儲存的圖片文件及相簿文件夾
  if (images && images.length > 0) {
    // 分類圖片：R2 和 Supabase Storage
    const r2Images = images.filter(img => isR2Url(img.path));
    const supabaseImages = images.filter(img => !isR2Url(img.path));
    
    // 刪除 R2 圖片
    if (r2Images.length > 0) {
      for (const img of r2Images) {
        const filename = extractFilenameFromR2Url(img.path);
        const result = await deleteFromR2(filename);
        if (!result.success) {
          console.warn('R2 刪除失敗:', filename, result.error);
        }
      }
    }
    
    // 刪除 Supabase Storage 圖片
    if (supabaseImages.length > 0) {
      const paths = supabaseImages.map(img => img.path);
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove(paths);
      
      if (storageError) {
        console.warn("刪除存儲文件時出錯:", storageError);
        // 不中斷流程，繼續刪除相簿記錄
      }
    }
  }

  // 刪除相簿
  const { error: deleteAlbumError } = await supabase
    .from("albums")
    .delete()
    .eq("id", albumId);

  if (deleteAlbumError) {
    setStatus(deleteAlbumError.message, 'error');
    return;
  }

  // 如果刪除的是當前相簿，清空狀態
  if (state.album && state.album.id === albumId) {
    state.album = null;
    state.images = [];
    ui.imageList.innerHTML = "";
    updateEmbed();
  }

  setStatus("相簿已刪除。", 'success');
  await loadAlbums();
}

async function updateSettings() {
  if (!state.album) {
    return;
  }

  const payload = {
    theme: ui.themeSelect.value,
    background_color: ui.bgColor.value.trim() || "#101828",
    notion_block_color: ui.notionBlockColorSelect.value,
    add_new_first: ui.addNewSelect.value === "first",
  };

  const { error } = await supabase
    .from("albums")
    .update(payload)
    .eq("id", state.album.id);

  if (error) {
    setStatus(error.message, 'error');
    return;
  }

  state.album = { ...state.album, ...payload };
  
  // 儲存設定到 localStorage 以便下次使用
  saveLastSettings(payload);
  
  updateEmbed();
}

function updateEmbed() {
  const url = currentEmbedUrl();
  if (!url) {
    ui.embedCode.value = "";
    ui.shareLink.value = "";
    ui.embedPreview.src = "";
    return;
  }

  ui.shareLink.value = url;
  ui.embedCode.value = `<iframe src="${url}" width="700" height="420" frameborder="0" allowfullscreen></iframe>`;
  
  // 重置預覽容器為預設大小
  const previewContainer = document.getElementById('previewContainer');
  if (previewContainer) {
    previewContainer.style.width = '';
    previewContainer.style.height = '420px';
  }
  
  // 添加版本號強制刷新預覽快取
  const previewUrl = new URL(url);
  previewUrl.searchParams.set('_cache', '1');
  ui.embedPreview.src = previewUrl.toString();
}

async function prepareImage(file) {
  const image = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_IMAGE_SIZE / Math.max(image.width, image.height));
  const targetWidth = Math.round(image.width * ratio);
  const targetHeight = Math.round(image.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  // 判斷是否保留原始格式
  const isOriginalPNG = file.type === "image/png";
  const outputFormat = isOriginalPNG ? "image/png" : "image/jpeg";
  const outputQuality = isOriginalPNG ? 0.92 : 0.85;
  const fileExtension = isOriginalPNG ? "png" : "jpg";

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve({ blob, width: targetWidth, height: targetHeight, extension: fileExtension });
      },
      outputFormat,
      outputQuality
    );
  });
}

async function uploadImages(files) {
  // 如果没有选中相册，自动创建一个
  const isNewAlbum = !state.album;
  if (!state.album) {
    setStatus("自動建立新相簿...", 'info');
    const album = await createAlbum();
    if (!album) {
      return;
    }
  }

  const baseOrder = state.images.length
    ? state.images[state.images.length - 1].sort_order
    : 0;
  const addFirst = state.album.add_new_first;
  const minOrder = state.images.length ? state.images[0].sort_order : 0;

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!file.type.startsWith("image/")) {
      showToast(`略過 ${file.name}`, 'warning', 2000);
      continue;
    }

    setStatus(`處理中 ${file.name}...`, 'info');
    const { blob, width, height, extension } = await prepareImage(file);

    const path = `${state.album.id}/${newId()}.${extension}`;
    const contentType = extension === "png" ? "image/png" : "image/jpeg";

    let imagePath; // 儲存路徑或 URL
    
    // 根據 R2_CONFIG.enabled 決定上傳目標
    if (R2_CONFIG.enabled) {
      // 上傳到 Cloudflare R2
      const result = await uploadToR2(blob, path, contentType);
      
      if (!result.success) {
        setStatus(result.error, 'error');
        return;
      }
      
      imagePath = result.url; // R2 返回完整的 URL
    } else {
      // 上傳到 Supabase Storage（原有邏輯）
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType });

      if (uploadError) {
        setStatus(uploadError.message, 'error');
        return;
      }
      
      imagePath = path; // Supabase 儲存相對路徑
    }

    const sortOrder = addFirst ? minOrder - (i + 1) : baseOrder + (i + 1);
    const { error: insertError } = await supabase
      .from("images")
      .insert({
        id: newId(),
        album_id: state.album.id,
        path: imagePath, // 使用 imagePath（R2 URL 或 Supabase 路徑）
        caption: "",
        custom_link: null,
        sort_order: sortOrder,
        width,
        height,
      });

    if (insertError) {
      setStatus(insertError.message, 'error');
      return;
    }

    logUpload(`已上傳 ${file.name}`);
  }

  await loadImages();
  // 只有登入用戶才更新相簿卡片（匿名用戶不需要相簿管理功能）
  if (state.user && state.album) {
    // 如果是新建的相簿，重新載入相簿列表以顯示新相簿
    if (isNewAlbum) {
      await loadAlbums();
    } else {
      // 否則只更新該相簿的預覽圖
      await updateAlbumCardPreview(state.album.id);
    }
  }
  updateEmbed();
  setStatus("上傳完成。", 'success');
}

ui.signInBtn.addEventListener("click", async () => {
  const email = ui.emailInput.value.trim();
  if (!email) {
    setStatus("請輸入您的電子郵件", 'warning');
    return;
  }
  
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split('#')[0].split('?')[0],
    },
  });
  
  if (error) {
    setStatus(error.message, 'error');
  } else {
    setStatus("請查收電子郵件中的登入連結！", 'success');
    ui.emailInput.value = "";
    // 關閉 modal
    ui.loginModal.classList.add("hidden");
  }
});

// 開啟登入 modal
ui.openLoginModalBtn.addEventListener("click", () => {
  ui.loginModal.classList.remove("hidden");
  // 自動聚焦到電子郵件輸入欄位
  setTimeout(() => ui.emailInput.focus(), 100);
});

// 關閉登入 modal
ui.closeModalBtn.addEventListener("click", () => {
  ui.loginModal.classList.add("hidden");
});

// 點擊 overlay 關閉 modal
ui.loginModal.querySelector(".modal-overlay").addEventListener("click", () => {
  ui.loginModal.classList.add("hidden");
});

// Google 登入
ui.googleSignInBtn.addEventListener("click", async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href.split('#')[0].split('?')[0],
    },
  });
  
  if (error) {
    setStatus(error.message, 'error');
  }
});

ui.signOutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  state.album = null;
  state.images = [];
  await refreshAuth();
  await loadAlbums();
  await loadImages();
  updateEmbed();
});

ui.fileInput.addEventListener("change", (event) => uploadImages([...event.target.files]));

// 拖拽上傳功能
ui.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ui.dropzone.style.background = "rgba(249, 115, 22, 0.2)";
  ui.dropzone.style.borderColor = "var(--accent)";
});

ui.dropzone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ui.dropzone.style.background = "";
  ui.dropzone.style.borderColor = "";
});

ui.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ui.dropzone.style.background = "";
  ui.dropzone.style.borderColor = "";
  
  const files = [...e.dataTransfer.files].filter(file => file.type.startsWith("image/"));
  if (files.length > 0) {
    uploadImages(files);
  }
});

// 阻止整個頁面的拖拽默認行為（防止拖拽圖片時打開新標籤頁）
document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
});

ui.themeSelect.addEventListener("change", updateSettings);
ui.notionBlockColorSelect.addEventListener("change", updateSettings);
ui.addNewSelect.addEventListener("change", updateSettings);
ui.embedCode.addEventListener("click", () => ui.embedCode.select());
ui.shareLink.addEventListener("click", () => ui.shareLink.select());

// ESC 鍵關閉 modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !ui.loginModal.classList.contains("hidden")) {
    ui.loginModal.classList.add("hidden");
  }
});

supabase.auth.onAuthStateChange(async (event, session) => {
  const newUserId = session?.user?.id || null;
  const oldUserId = state.user?.id || null;
  
  // 只有在用户真正变化时才重新加载（避免页面刷新时重复加载）
  // INITIAL_SESSION 事件在頁面載入時觸發，此時已經在初始化中處理過了
  if (newUserId !== oldUserId && event !== 'INITIAL_SESSION') {
    state.user = session?.user || null;
    
    // 如果用戶剛登入，檢查是否有匿名相簿需要轉移
    if (newUserId && !oldUserId) {
      await transferAnonymousAlbums(newUserId);
    }
    
    renderAuth();
    await loadAlbums();
    updateEmbed();
  }
});

// ===========================
// Albumizr 遷移功能
// ===========================

function addMigrationLog(message, type = 'info') {
  const logItem = document.createElement('div');
  logItem.className = `migration-log-item ${type}`;
  
  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠'
  };
  
  logItem.innerHTML = `
    <div class="migration-log-icon">${icons[type]}</div>
    <div class="migration-log-text">${message}</div>
  `;
  
  ui.migrationLog.appendChild(logItem);
  ui.migrationLog.scrollTop = ui.migrationLog.scrollHeight;
}

function updateMigrationProgress(current, total) {
  const percentage = Math.round((current / total) * 100);
  ui.migrationProgressBar.style.width = `${percentage}%`;
}

// 從 albumizr URL 提取相簿 key
// 支援兩種格式：
// 1. https://albumizr.com/a/0Gnc (短網址)
// 2. https://albumizr.com/skins/bandana/index.php?key=0Gnc (完整網址)
function extractAlbumizrKey(url) {
  try {
    const urlObj = new URL(url);
    
    // 檢查是否為短網址格式 /a/{key}
    const pathMatch = urlObj.pathname.match(/\/a\/([^/]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }
    
    // 檢查是否為完整網址格式的 key 參數
    const key = urlObj.searchParams.get('key');
    if (key) {
      return key;
    }
    
    return null;
  } catch (e) {
    // 嘗試直接匹配 key 參數或短網址路徑
    const pathMatch = url.match(/\/a\/([^/]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }
    
    const keyMatch = url.match(/[?&]key=([^&]+)/);
    return keyMatch ? keyMatch[1] : null;
  }
}

// 使用 Supabase Edge Function 提取 Albumizr 圖片
async function fetchAlbumizrImagesViaEdgeFunction(albumUrl) {
  const key = extractAlbumizrKey(albumUrl);
  if (!key) {
    throw new Error('無法從 URL 中提取相簿 key');
  }

  addMigrationLog(`正在從 Albumizr 提取相簿 [${key}]...`, 'info');

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token || SUPABASE_ANON_KEY;

  const functionUrl = `${SUPABASE_URL}/functions/v1/migrate-albumizr`;
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      albumKey: key,
      method: 'key'
    })
  });

  if (!response.ok) {
    throw new Error(`提取失敗: HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.success || !data.images || data.images.length === 0) {
    throw new Error(data.error || '未找到任何圖片');
  }

  addMigrationLog(`✓ 成功提取 ${data.images.length} 張圖片`, 'success');
  return data.images;
}

// 從 URL 下載圖片並轉換為 Blob
async function downloadImage(imageUrl) {
  const functionUrl = `${SUPABASE_URL}/functions/v1/migrate-albumizr`;
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      imageUrl: imageUrl
    })
  });

  if (!response.ok) {
    throw new Error(`下載失敗: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  
  if (!blob.type.startsWith('image/')) {
    throw new Error('下載的內容不是圖片');
  }

  return blob;
}

// 遷移單個相簿
async function migrateAlbumizrAlbum(albumUrl, albumIndex, totalAlbums) {
  try {
    const key = extractAlbumizrKey(albumUrl);
    const albumTitle = `Albumizr 遷移 - ${key}`;
    
    addMigrationLog(`[${albumIndex}/${totalAlbums}] 開始遷移相簿: ${albumTitle}`, 'info');

    // 1. 提取圖片列表（只使用 Edge Function）
    const images = await fetchAlbumizrImagesViaEdgeFunction(albumUrl);

    // 2. 創建新相簿
    addMigrationLog(`正在創建相簿...`, 'info');
    const album = await createAlbum(albumTitle);
    if (!album) {
      throw new Error('創建相簿失敗');
    }

    // 臨時選中這個相簿以便上傳
    const previousAlbum = state.album;
    state.album = album;

    // 3. 下載並上傳每張圖片
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageIndex = i + 1;
      
      try {
        const blob = await downloadImage(image.url);
        const fileName = image.url.split('/').pop() || `image-${imageIndex}.jpg`;
        const file = new File([blob], fileName, { type: blob.type });

        const { blob: processedBlob, width, height, extension } = await prepareImage(file);

        const path = `${album.id}/${newId()}.${extension}`;
        const contentType = extension === "png" ? "image/png" : "image/jpeg";

        let imagePath = path; // 用來儲存最終要保存到數據庫的路徑
        let uploadError = null;
        
        // 優先使用 R2，否則使用 Supabase Storage
        if (R2_CONFIG.enabled) {
          const result = await uploadToR2(processedBlob, path, contentType);
          if (!result.success) {
            uploadError = new Error(result.error);
          } else {
            imagePath = result.url; // 使用 R2 返回的完整 URL
          }
        } else {
          const response = await supabase.storage
            .from(BUCKET)
            .upload(path, processedBlob, { contentType });
          uploadError = response.error;
        }

        if (uploadError) throw uploadError;

        const sortOrder = i + 1;
        const { error: insertError } = await supabase
          .from("images")
          .insert({
            id: newId(),
            album_id: album.id,
            path: imagePath, // 保存正確的路徑（R2 URL 或 Supabase 路徑）
            caption: image.caption,
            custom_link: null,
            sort_order: sortOrder,
            width,
            height,
          });

        if (insertError) throw insertError;

        successCount++;
        const captionInfo = image.caption ? ` "${image.caption}"` : '';
        addMigrationLog(`✓ [${imageIndex}/${images.length}]${captionInfo}`, 'success');
        updateMigrationProgress(albumIndex - 1 + (imageIndex / images.length), totalAlbums);
      } catch (error) {
        failCount++;
        addMigrationLog(`✗ [${imageIndex}/${images.length}] ${error.message}`, 'error');
      }
    }

    // 4. 完成並同步更新 UI
    addMigrationLog(
      `✓ 相簿遷移完成！成功: ${successCount}/${images.length} 張圖片`,
      'success'
    );

    // 重新載入相簿列表
    await loadAlbums();
    
    // 選中新創建的相簿，同步更新所有 UI
    state.album = album;
    await loadImages();
    updateEmbed();
    
    // 恢復之前選中的相簿
    state.album = previousAlbum;
    
    return { success: successCount, failed: failCount };
  } catch (error) {
    addMigrationLog(`✗ 相簿遷移失敗: ${error.message}`, 'error');
    throw error;
  }
}

// 開始遷移
async function startMigration() {
  const urls = ui.albumizrUrls.value
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  if (urls.length === 0) {
    showToast('請輸入至少一個 Albumizr 連結', 'warning');
    return;
  }

  // 檢查是否為匿名用戶且輸入了多個連結
  if (!state.user && urls.length > 1) {
    showToast('匿名用戶一次只能轉換一個相簿，請登入以批次轉換', 'warning');
    return;
  }

  // 禁用按鈕
  ui.startMigrationBtn.disabled = true;
  ui.startMigrationBtn.innerHTML = '<span>遷移中...</span>';
  ui.clearMigrationBtn.disabled = true;
  ui.albumizrUrls.disabled = true;

  // 顯示狀態區域
  ui.migrationStatus.classList.remove('hidden');
  ui.migrationLog.innerHTML = '';
  ui.migrationProgressBar.style.width = '0%';

  addMigrationLog(`開始遷移 ${urls.length} 個相簿...`, 'info');

  let totalSuccess = 0;
  let totalFailed = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const result = await migrateAlbumizrAlbum(url, i + 1, urls.length);
      totalSuccess += result.success;
      totalFailed += result.failed;
    } catch (error) {
      addMigrationLog(`相簿 ${i + 1} 遷移失敗: ${error.message}`, 'error');
    }
    
    updateMigrationProgress(i + 1, urls.length);
  }

  // 完成
  const finalMessage = totalFailed === 0 
    ? `🎉 所有遷移完成！成功上傳 ${totalSuccess} 張圖片`
    : `遷移完成！成功: ${totalSuccess} 張，失敗: ${totalFailed} 張`;
  
  addMigrationLog(finalMessage, totalFailed === 0 ? 'success' : 'warning');

  showToast('遷移完成！', 'success');

  // 重新啟用按鈕
  ui.startMigrationBtn.disabled = false;
  ui.startMigrationBtn.innerHTML = '<span>開始遷移</span>';
  ui.clearMigrationBtn.disabled = false;
  ui.albumizrUrls.disabled = false;
}

// 清除遷移表單
function clearMigration() {
  ui.albumizrUrls.value = '';
  ui.migrationStatus.classList.add('hidden');
  ui.migrationLog.innerHTML = '';
  ui.migrationProgressBar.style.width = '0%';
}

// 綁定事件監聽器
ui.startMigrationBtn.addEventListener('click', startMigration);
ui.clearMigrationBtn.addEventListener('click', clearMigration);

// ===========================
// 初始化
// ===========================

(async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setStatus("缺少 Supabase 設定。", 'error');
    return;
  }
  
  // 等待 Pickr 库加载完成
  await waitForPickr();
  
  // Initialize Pickr color picker
  pickr = new Pickr({
    el: "#bgColorPickr",
    theme: "nano",
    default: "#101828",
    components: {
      preview: true,
      opacity: true,
      hue: true,
      interaction: {
        hex: true,
        rgba: true,
        hsla: false,
        hsva: false,
        cmyk: false,
        input: true,
        clear: true,
        save: true,
      },
    },
  });
  
  pickr.on("save", (color) => {
    const colorString = color.toHEXA().toString();
    ui.bgColor.value = colorString;
    updateSettings();
  });
  
  // 載入上次的設定到 UI
  const lastSettings = getLastSettings();
  ui.themeSelect.value = lastSettings.theme;
  ui.bgColor.value = lastSettings.background_color;
  pickr.setColor(lastSettings.background_color);
  ui.notionBlockColorSelect.value = lastSettings.notion_block_color;
  ui.addNewSelect.value = lastSettings.add_new_first ? "first" : "last";
  
  // 先等待 refreshAuth 完成後再 loadAlbums，確保 state.user 已被正確設定
  await refreshAuth();
  await loadAlbums();
})();
