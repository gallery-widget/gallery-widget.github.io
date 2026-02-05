import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://eooudvssawtdtttrwyfr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sX69Y-P_n8QgAkrcb8gGtQ_FoKhG9mj";
const BUCKET = "album";
const MAX_IMAGE_SIZE = 1600;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  uploadLog: document.getElementById("uploadLog"),
  embedCode: document.getElementById("embedCode"),
  shareLink: document.getElementById("shareLink"),
  embedPreview: document.getElementById("embedPreview"),
  themeSelect: document.getElementById("themeSelect"),
  bgColor: document.getElementById("bgColor"),
  addNewSelect: document.getElementById("addNewSelect"),
  imageList: document.getElementById("imageList"),
  status: document.getElementById("status"),
};

function setStatus(message) {
  ui.status.textContent = message || "";
}

function logUpload(message) {
  const p = document.createElement("p");
  p.textContent = message;
  ui.uploadLog.prepend(p);
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
  } else {
    ui.signInForm.classList.remove("hidden");
    ui.signOutBtn.classList.add("hidden");
    ui.userBadge.textContent = "未登入";
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
    setStatus(error.message);
    return;
  }

  if (!albums.length) {
    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = "尚無相簿。上傳圖片會自動建立新相簿。";
    ui.albumList.appendChild(info);
    return;
  }

  for (const album of albums) {
    // 获取该相册的前4张图片
    const { data: images } = await supabase
      .from("images")
      .select("path")
      .eq("album_id", album.id)
      .order("sort_order", { ascending: true })
      .limit(4);

    const card = document.createElement("div");
    card.className = "album-card";
    card.dataset.albumId = album.id;
    if (state.album && state.album.id === album.id) {
      card.classList.add("selected");
    }

    // 封面预览
    const preview = document.createElement("div");
    preview.className = `album-card-preview count-${Math.min(images?.length || 0, 4)}`;
    
    if (images && images.length > 0) {
      images.slice(0, 4).forEach((img) => {
        const imgEl = document.createElement("img");
        imgEl.src = supabase.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl;
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
        setStatus(error.message);
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
}

async function createAlbum(title) {
  // 如果没有提供标题，自动生成
  if (!title) {
    const { data: albums } = await supabase
      .from("albums")
      .select("title")
      .eq("owner_id", state.user ? state.user.id : null)
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
    setStatus(error.message);
    return null;
  }

  state.album = data;
  ui.themeSelect.value = data.theme || "slideshow";
  ui.bgColor.value = data.background_color || "#101828";
  ui.addNewSelect.value = data.add_new_first ? "first" : "last";
  await loadImages();
  updateEmbed();
  await loadAlbums();
  return data;
}

async function loadAlbum(albumId) {
  const { data, error } = await supabase
    .from("albums")
    .select("*")
    .eq("id", albumId)
    .single();

  if (error) {
    setStatus(error.message);
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
    setStatus(error.message);
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
    img.src = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;

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
    setStatus(error.message);
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
    setStatus(deleteRowError.message);
    return;
  }

  await supabase.storage.from(BUCKET).remove([image.path]);
  await loadImages();
  updateEmbed();
}

async function deleteAlbum(albumId) {
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
    setStatus(deleteImagesError.message);
    return;
  }

  // 刪除儲存的圖片文件
  if (images && images.length > 0) {
    const paths = images.map(img => img.path);
    await supabase.storage.from(BUCKET).remove(paths);
  }

  // 刪除相簿
  const { error: deleteAlbumError } = await supabase
    .from("albums")
    .delete()
    .eq("id", albumId);

  if (deleteAlbumError) {
    setStatus(deleteAlbumError.message);
    return;
  }

  // 如果刪除的是當前相簿，清空狀態
  if (state.album && state.album.id === albumId) {
    state.album = null;
    state.images = [];
    ui.imageList.innerHTML = "";
    updateEmbed();
  }

  setStatus("相簿已刪除。");
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
    setStatus(error.message);
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
  // 添加时间戳强制刷新预览缓存
  const previewUrl = new URL(url);
  previewUrl.searchParams.set('_t', Date.now());
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
    setStatus("自動建立新相簿...");
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
      logUpload(`略過 ${file.name}`);
      continue;
    }

    setStatus(`處理中 ${file.name}...`);
    const { blob, width, height, extension } = await prepareImage(file);
    const path = `${state.album.id}/${newId()}.${extension}`;
    const contentType = extension === "png" ? "image/png" : "image/jpeg";

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType });

    if (uploadError) {
      setStatus(uploadError.message);
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
      setStatus(insertError.message);
      return;
    }

    logUpload(`已上傳 ${file.name}`);
  }

  await loadImages();
  updateEmbed();
  setStatus("上傳完成。");
}

ui.signInBtn.addEventListener("click", async () => {
  const email = ui.emailInput.value.trim();
  if (!email) {
    setStatus("請輸入您的電子郵件");
    return;
  }
  
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split('#')[0].split('?')[0],
    },
  });
  
  if (error) {
    setStatus(error.message);
  } else {
    setStatus("請查收電子郵件中的登入連結！");
    ui.emailInput.value = "";
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

supabase.auth.onAuthStateChange((event, session) => {
  const newUserId = session?.user?.id || null;
  const oldUserId = state.user?.id || null;
  
  // 只有在用户真正变化时才重新加载（避免页面刷新时重复加载）
  if (newUserId !== oldUserId) {
    state.user = session?.user || null;
    renderAuth();
    loadAlbums();
  }
});

(async function init() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    setStatus("缺少 Supabase 設定。");
    return;
  }
  
  // 等待 Pickr 库加载完成
  await waitForPickr();
  
  // Initialize Pickr color picker
  pickr = new Pickr({
    el: "#bgColorPickr",
    theme: "classic",
    default: "#101828",
    components: {
      preview: true,
      opacity: true,
      hue: true,
      interaction: {
        hex: true,
        rgba: true,
        hsla: true,
        hsva: true,
        cmyk: true,
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
