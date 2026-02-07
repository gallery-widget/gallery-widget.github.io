import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://eooudvssawtdtttrwyfr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sX69Y-P_n8QgAkrcb8gGtQ_FoKhG9mj";
const BUCKET = "album";
const MAX_IMAGE_SIZE = 1600;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 圖片URL輔助函數：為預覽生成優化版本，為下載/開啟保留原圖
function encodeStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function getImageUrl(path, options = {}) {
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  
  // 如果是預覽模式，添加 transform 參數來優化載入速度
  if (options.preview) {
    // 使用 render/image 端點可確保轉換被套用
    const renderUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}/${encodeStoragePath(path)}`;
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
    .select("id, title, created_at")
    .eq("owner_id", state.user.id)
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
    card.dataset.albumId = album.id;
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
    createCard.addEventListener("click", () => ui.fileInput.click());

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

async function createAlbum(title) {
  // 如果没有提供标题，自动生成
  if (!title) {
    // 匿名用户使用固定名称
    if (!state.user) {
      title = "我的相簿";
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

  const payload = {
    id: newId(),
    title,
    owner_id: state.user ? state.user.id : null,
    theme: "slideshow",
    background_color: ui.bgColor.value.trim() || "#101828",
    add_new_first: false,
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

  state.album = data;
  ui.themeSelect.value = data.theme || "slideshow";
  ui.bgColor.value = data.background_color || "#101828";
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

async function deleteImage(image) {
  const { error: deleteRowError } = await supabase
    .from("images")
    .delete()
    .eq("id", image.id);

  if (deleteRowError) {
    setStatus(deleteRowError.message, 'error');
    return;
  }

  await supabase.storage.from(BUCKET).remove([image.path]);
  await loadImages();
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
    const paths = images.map(img => img.path);
    // 刪除所有相簿內的文件（包括直接在相簿文件夾下的所有文件）
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    
    if (storageError) {
      console.warn("刪除存儲文件時出錯:", storageError);
      // 不中斷流程，繼續刪除相簿記錄
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

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType });

    if (uploadError) {
      setStatus(uploadError.message, 'error');
      return;
    }

    const sortOrder = addFirst ? minOrder - (i + 1) : baseOrder + (i + 1);
    const { error: insertError } = await supabase
      .from("images")
      .insert({
        id: newId(),
        album_id: state.album.id,
        path,
        caption: "",
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
  // 只有登入用戶才刷新相簿列表（匿名用戶不需要相簿管理功能）
  if (state.user) {
    await loadAlbums();
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
ui.addNewSelect.addEventListener("change", updateSettings);
ui.embedCode.addEventListener("click", () => ui.embedCode.select());
ui.shareLink.addEventListener("click", () => ui.shareLink.select());

// ESC 鍵關閉 modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !ui.loginModal.classList.contains("hidden")) {
    ui.loginModal.classList.add("hidden");
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  const newUserId = session?.user?.id || null;
  const oldUserId = state.user?.id || null;
  
  // 只有在用户真正变化时才重新加载（避免页面刷新时重复加载）
  if (newUserId !== oldUserId) {
    state.user = session?.user || null;
    renderAuth();
    loadAlbums();
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
function extractAlbumizrKey(url) {
  try {
    const urlObj = new URL(url);
    const key = urlObj.searchParams.get('key');
    return key;
  } catch (e) {
    // 嘗試直接匹配 key 參數
    const match = url.match(/[?&]key=([^&]+)/);
    return match ? match[1] : null;
  }
}

// CORS 代理列表（按優先順序）
const CORS_PROXIES = [
  { name: 'AllOrigins', url: (targetUrl) => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}` },
  { name: 'ThingProxy', url: (targetUrl) => `https://thingproxy.freeboard.io/fetch/${targetUrl}` },
  { name: 'CorsProxy', url: (targetUrl) => `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` },
];

// 使用 Supabase Edge Function 提取 Albumizr 圖片（推薦方法，無 CORS 問題）
async function fetchAlbumizrImagesViaEdgeFunction(albumUrl) {
  const key = extractAlbumizrKey(albumUrl);
  if (!key) {
    throw new Error('無法從 URL 中提取相簿 key');
  }

  addMigrationLog(`正在從 albumizr 提取相簿 [${key}] 的圖片 (使用伺服器端)...`, 'info');

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token || SUPABASE_ANON_KEY;

    console.log('調用 Edge Function，參數：', { albumKey: key, method: 'key' });

    // 使用原生 fetch API 直接調用，以便捕捉所有狀態碼和響應內容
    const functionUrl = `${SUPABASE_URL}/functions/v1/migrate-albumizr`;
    
    const fetchResponse = await fetch(functionUrl, {
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

    console.log('Fetch Response Status:', fetchResponse.status, fetchResponse.statusText);
    
    const responseText = await fetchResponse.text();
    console.log('Fetch Response Body:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('無法解析 JSON 回應:', e);
      throw new Error(`Edge Function 返回非 JSON 內容 (${fetchResponse.status}): ${responseText}`);
    }

    // 檢查狀態碼
    if (!fetchResponse.ok) {
      const errorMsg = data.error || `HTTP ${fetchResponse.status}: ${responseText}`;
      console.error('Edge Function HTTP 錯誤：', errorMsg);
      throw new Error(`Edge Function HTTP 錯誤: ${errorMsg}`);
    }

    // 檢查自訂的 success 標志
    if (!data.success) {
      const errorMsg = data.error || '提取失敗（未知原因）';
      console.error('遷移失敗：', errorMsg);
      throw new Error(`遷移失敗: ${errorMsg}`);
    }

    if (!data.images || data.images.length === 0) {
      const errorMsg = data.error || '未找到任何圖片';
      console.warn('無圖片：', errorMsg);
      throw new Error(`無圖片: ${errorMsg}`);
    }

    addMigrationLog(`✓ 成功提取 ${data.images.length} 張圖片及說明文字 (伺服器端)`, 'success');
    return data.images;

  } catch (error) {
    console.error('fetchAlbumizrImagesViaEdgeFunction 捕捉到錯誤：', error);
    addMigrationLog(`✗ 遷移失敗: ${error.message}`, 'error');
    throw error;
  }
}

// 從 albumizr 獲取圖片列表（包含 URL 和說明文字）- 使用 CORS 代理（備用方法）
async function fetchAlbumizrImages(albumUrl) {
  const key = extractAlbumizrKey(albumUrl);
  if (!key) {
    throw new Error('無法從 URL 中提取相簿 key');
  }

  addMigrationLog(`正在從 albumizr 提取相簿 [${key}] 的圖片...`, 'info');

  const targetUrl = `https://albumizr.com/skins/bandana/index.php?key=${key}`;
  
  // 嘗試多個 CORS 代理
  let lastError = null;
  for (const proxy of CORS_PROXIES) {
    try {
      addMigrationLog(`嘗試使用 ${proxy.name} 代理...`, 'info');
      const proxyUrl = proxy.url(targetUrl);
      
      const response = await fetch(proxyUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP 錯誤: ${response.status}`);
      }

      const html = await response.text();
    
      // 解析 HTML 來提取圖片資訊
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Albumizr 使用 <div class="th" data-url="..." data-caption="..."> 結構
      const thumbDivs = doc.querySelectorAll('div.th[data-url]');
      
      const images = [];
      thumbDivs.forEach(div => {
        let imageUrl = div.getAttribute('data-url');
        const caption = div.getAttribute('data-caption') || '';
        
        if (imageUrl) {
          // 處理相對路徑（以 // 開頭）
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          } else if (!imageUrl.startsWith('http')) {
            imageUrl = 'https://albumizr.com' + imageUrl;
          }
          
          images.push({
            url: imageUrl,
            caption: caption
          });
        }
      });
      
      if (images.length === 0) {
        throw new Error('未在相簿中找到任何圖片');
      }

      addMigrationLog(`✓ 成功提取 ${images.length} 張圖片及說明文字 (使用 ${proxy.name})`, 'success');
      return images;
      
    } catch (error) {
      lastError = error;
      addMigrationLog(`${proxy.name} 失敗: ${error.message}`, 'warning');
      // 繼續嘗試下一個代理
    }
  }
  
  // 所有代理都失敗了
  addMigrationLog(`✗ 所有代理都失敗了`, 'error');
  throw lastError || new Error('無法提取圖片');
}

// 從 URL 下載圖片並轉換為 Blob - 使用 Edge Function
async function downloadImage(imageUrl) {
  try {
    // 使用 Edge Function 從伺服器端下載圖片，繞過 CORS 問題
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
      throw new Error(`HTTP 錯誤: ${response.status}`);
    }

    const blob = await response.blob();
    
    // 確保是圖片類型
    if (!blob.type.startsWith('image/')) {
      throw new Error('下載的內容不是圖片');
    }

    return blob;
    
  } catch (error) {
    console.error('Edge Function 下載失敗:', error);
    // 如果 Edge Function 失敗，嘗試備用方法（CORS 代理）
    let lastError = null;
    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = proxy.url(imageUrl);
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`HTTP 錯誤: ${response.status}`);
        }

        const blob = await response.blob();
        
        // 確保是圖片類型
        if (!blob.type.startsWith('image/')) {
          throw new Error('下載的內容不是圖片');
        }

        return blob;
        
      } catch (error) {
        lastError = error;
        // 靜默失敗，嘗試下一個代理
        continue;
      }
    }
    
    // 所有方法都失敗了
    throw new Error(`下載失敗: ${lastError?.message || '所有代理都失敗'}`);
  }
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
        addMigrationLog(`[${imageIndex}/${images.length}] 下載圖片...`, 'info');
        const blob = await downloadImage(image.url);

        // 創建 File 對象
        const fileName = image.url.split('/').pop() || `image-${imageIndex}.jpg`;
        const file = new File([blob], fileName, { type: blob.type });

        // 上傳圖片
        const { blob: processedBlob, width, height, extension } = await prepareImage(file);
        const path = `${album.id}/${newId()}.${extension}`;
        const contentType = extension === "png" ? "image/png" : "image/jpeg";

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, processedBlob, { contentType });

        if (uploadError) {
          throw uploadError;
        }

        // 添加到資料庫，包含圖片說明文字
        const sortOrder = i + 1;
        const { error: insertError } = await supabase
          .from("images")
          .insert({
            id: newId(),
            album_id: album.id,
            path,
            caption: image.caption, // 使用從 albumizr 提取的說明文字
            sort_order: sortOrder,
            width,
            height,
          });

        if (insertError) {
          throw insertError;
        }

        successCount++;
        const captionInfo = image.caption ? ` (說明: ${image.caption})` : '';
        addMigrationLog(`✓ [${imageIndex}/${images.length}] 圖片上傳成功${captionInfo}`, 'success');
        
        // 更新進度
        updateMigrationProgress(albumIndex - 1 + (imageIndex / images.length), totalAlbums);
      } catch (error) {
        failCount++;
        addMigrationLog(`✗ [${imageIndex}/${images.length}] 圖片上傳失敗: ${error.message}`, 'error');
      }
    }

    // 恢復之前選中的相簿
    state.album = previousAlbum;

    // 4. 完成
    addMigrationLog(
      `✓ 相簿遷移完成！成功: ${successCount}, 失敗: ${failCount}`,
      successCount > 0 ? 'success' : 'warning'
    );

    // 重新載入相簿列表
    await loadAlbums();
    
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
  addMigrationLog(
    `\n🎉 所有遷移完成！\n總計成功: ${totalSuccess} 張圖片\n總計失敗: ${totalFailed} 張圖片`,
    totalFailed === 0 ? 'success' : 'warning'
  );

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
    ui.bgColor.value = color.toRGBA().toString();
    updateSettings();
  });
  
  await refreshAuth();
  await loadAlbums();
})();
