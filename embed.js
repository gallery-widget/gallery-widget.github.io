import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://eooudvssawtdtttrwyfr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sX69Y-P_n8QgAkrcb8gGtQ_FoKhG9mj";
const BUCKET = "album";

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
    // 設置最大寬度，質量為85（在質量和大小間取得平衡）
    urlObj.searchParams.set('width', options.width || '1600');
    urlObj.searchParams.set('quality', options.quality || '85');
    urlObj.searchParams.set('resize', 'contain');
    if (options.format) {
      urlObj.searchParams.set('format', options.format);
    }
    return urlObj.toString();
  }
  
  // 原始URL用於下載、複製、開啟操作
  return url;
}

// 快速設置圖片 - 直接用低品質快速版
function setPreviewImage(imgEl, path, options = {}) {
  const url = getImageUrl(path, {
    preview: true,
    width: options.width || '800',
    quality: '20',
    format: 'webp',
  });
  
  imgEl.src = url;
}

const ui = {
  grid: document.getElementById("embedGrid"),
};

function getAlbumId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("album");
}

function isOwner() {
  const params = new URLSearchParams(window.location.search);
  return params.get("owner") === "1";
}

// 通用工具函數
function openBuilder() {
  window.open("https://ebluvu.github.io/gallery-widget/", "_blank", "noopener");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      alert("此瀏覽器不支援全螢幕。");
    });
    return;
  }
  document.exitFullscreen().catch(() => {
    alert("無法退出全螢幕。");
  });
}

function openCurrentImage(getCurrentImageFn) {
  const image = getCurrentImageFn();
  const url = getImageUrl(image.path); // 使用原始URL
  window.open(url, "_blank", "noopener");
}

function downloadCurrentImage(getCurrentImageFn) {
  const image = getCurrentImageFn();
  const url = getImageUrl(image.path); // 使用原始URL
  
  try {
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('下載失敗');
        }
        return response.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = image.path.split("/").pop() || "image.jpg";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(error => {
        console.error('下載錯誤:', error);
        window.open(url, "_blank", "noopener");
        alert("若無法下載，請在新視窗中右鍵點擊圖片選擇另存新檔。");
      });
  } catch (error) {
    console.error('下載失敗:', error);
    window.open(url, "_blank", "noopener");
  }
}

async function copyCurrentImage(getCurrentImageFn) {
  const image = getCurrentImageFn();
  const url = getImageUrl(image.path); // 使用原始URL
  
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert("此瀏覽器不支援複製圖片功能。");
    return;
  }
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('無法載入圖片');
    }
    
    const blob = await response.blob();
    
    let clipboardBlob = blob;
    if (blob.type !== 'image/png') {
      try {
        const img = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        clipboardBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      } catch (convertError) {
        console.warn('轉換 PNG 失敗，使用原格式:', convertError);
      }
    }
    
    const clipboardItem = new ClipboardItem({ [clipboardBlob.type]: clipboardBlob });
    await navigator.clipboard.write([clipboardItem]);
    alert("圖片已複製到剪貼簿！");
  } catch (error) {
    console.error('複製失敗:', error);
    if (error.name === 'NotAllowedError') {
      alert("此環境不支援複製圖片（如 Notion 嵌入）。請改用「開啟圖片」後手動複製。");
    } else {
      try {
        await navigator.clipboard.writeText(url);
        alert("此環境不支援圖片複製（如 Notion iframe），已複製圖片網址。\n建議用【另存圖片】功能。");
      } catch {
        alert("複製失敗。此環境可能限制了剪貼簿存取。\n建議改用【另存圖片】或【開啟圖片】功能。");
      }
    }
  }
}

async function loadAlbum(albumId) {
  const { data: album, error } = await supabase
    .from("albums")
    .select("*")
    .eq("id", albumId)
    .single();

  if (error || !album) {
    ui.grid.textContent = "Album not found.";
    return;
  }


  const bgColor = album.background_color || "#0c1117";
  document.body.style.background = bgColor;
  document.documentElement.style.background = bgColor;
  ui.grid.className = `embed-grid ${album.theme || "slideshow"}`;

  const { data: images, error: imageError } = await supabase
    .from("images")
    .select("*")
    .eq("album_id", albumId)
    .order("sort_order", { ascending: true });

  if (imageError) {
    ui.grid.textContent = imageError.message;
    return;
  }

  if (!images.length) {
    ui.grid.textContent = "No images";
    return;
  }

  const theme = album.theme || "slideshow";
  
  ui.grid.innerHTML = "";
  
  if (theme === "slideshow") {
    renderSlideshow(album, images);
  } else if (theme === "thumbnail") {
    renderThumbnail(album, images);
  }
}

function renderSlideshow(album, images) {
  const container = document.createElement("div");
  container.className = "slideshow-container";
  
  const imageWrapper = document.createElement("div");
  imageWrapper.className = "slideshow-image-wrapper";
  
  const mainImage = document.createElement("img");
  mainImage.className = "slideshow-main";
  setPreviewImage(mainImage, images[0].path);
  mainImage.alt = images[0].caption || "";
  
  const overlay = document.createElement("div");
  overlay.className = "slideshow-overlay";
  
  const overlayLeft = document.createElement("div");
  overlayLeft.className = "slideshow-overlay-left";
  
  const title = document.createElement("h1");
  title.className = "slideshow-title";
  title.textContent = isOwner() ? album.title || "" : "";
  
  const caption = document.createElement("p");
  caption.className = "slideshow-caption";
  caption.textContent = images[0].caption || "";
  
  overlayLeft.appendChild(title);
  overlayLeft.appendChild(caption);

  const overlayRight = document.createElement("div");
  overlayRight.className = "slideshow-overlay-right";

  const menuButton = document.createElement("button");
  menuButton.className = "slideshow-menu-btn";
  menuButton.type = "button";
  menuButton.setAttribute("aria-label", "開啟選單");
  menuButton.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = "slideshow-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");

  const menuItems = [
    { label: "全螢幕", action: () => toggleFullscreen() },
    { label: "開啟圖片", action: () => openCurrentImage(() => images[currentIndex]) },
    { label: "另存圖片", action: () => downloadCurrentImage(() => images[currentIndex]) },
    { label: "複製圖片", action: () => copyCurrentImage(() => images[currentIndex]) },
    { label: "建立你的相簿", action: () => openBuilder() },
  ];

  menuItems.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slideshow-menu-item";
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      item.action();
      closeMenu();
    });
    menu.appendChild(btn);
  });

  overlayRight.appendChild(menuButton);
  overlayRight.appendChild(menu);
  
  overlay.appendChild(overlayLeft);
  overlay.appendChild(overlayRight);
  
  imageWrapper.appendChild(mainImage);
  imageWrapper.appendChild(overlay);
  
  const prevBtn = document.createElement("button");
  prevBtn.className = "slideshow-btn prev";
  prevBtn.textContent = "‹";
  
  const nextBtn = document.createElement("button");
  nextBtn.className = "slideshow-btn next";
  nextBtn.textContent = "›";
  
  const dots = document.createElement("div");
  dots.className = "slideshow-dots";
  
  let currentIndex = 0;
  
  images.forEach((image, i) => {
    const dot = document.createElement("span");
    dot.className = i === 0 ? "dot active" : "dot";
    dot.addEventListener("click", () => goToSlide(i));
    dots.appendChild(dot);
  });
  
  function goToSlide(index) {
    currentIndex = index;
    setPreviewImage(mainImage, images[index].path);
    mainImage.alt = images[index].caption || "";
    caption.textContent = images[index].caption || "";
    
    dots.querySelectorAll(".dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
    });
  }

  function toggleMenu() {
    const isOpen = menu.classList.toggle("open");
    menu.setAttribute("aria-hidden", !isOpen);
  }

  function closeMenu() {
    if (document.activeElement && menu.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
  }

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  container.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });

  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
  
  prevBtn.addEventListener("click", () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    goToSlide(currentIndex);
  });
  
  nextBtn.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    goToSlide(currentIndex);
  });

  // 點擊大圖自動輪替到下一張
  mainImage.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    goToSlide(currentIndex);
  });
  mainImage.style.cursor = "pointer";

  container.appendChild(imageWrapper);
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  container.appendChild(dots);
  ui.grid.appendChild(container);
}

function renderThumbnail(album, images) {
  // 大图容器
  const mainContainer = document.createElement("div");
  mainContainer.className = "thumbnail-main-container";
  
  const imageWrapper = document.createElement("div");
  imageWrapper.className = "thumbnail-image-wrapper";
  
  const mainImage = document.createElement("img");
  mainImage.className = "thumbnail-main";
  setPreviewImage(mainImage, images[0].path);
  mainImage.alt = images[0].caption || "";
  
  const overlay = document.createElement("div");
  overlay.className = "thumbnail-overlay";

  const overlayLeft = document.createElement("div");
  overlayLeft.className = "thumbnail-overlay-left";
  
  const title = document.createElement("h1");
  title.className = "thumbnail-title";
  title.textContent = isOwner() ? album.title || "" : "";
  
  const caption = document.createElement("p");
  caption.className = "thumbnail-caption";
  caption.textContent = images[0].caption || "";

  overlayLeft.appendChild(title);
  overlayLeft.appendChild(caption);

  const overlayRight = document.createElement("div");
  overlayRight.className = "thumbnail-overlay-right";

  const menuButton = document.createElement("button");
  menuButton.className = "thumbnail-menu-btn";
  menuButton.type = "button";
  menuButton.setAttribute("aria-label", "開啟選單");
  menuButton.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = "thumbnail-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");

  const menuItems = [
    { label: "全螢幕", action: () => toggleFullscreen() },
    { label: "開啟圖片", action: () => openCurrentImage(() => images[currentIndex]) },
    { label: "另存圖片", action: () => downloadCurrentImage(() => images[currentIndex]) },
    { label: "複製圖片", action: () => copyCurrentImage(() => images[currentIndex]) },
    { label: "建立你的相簿", action: () => openBuilder() },
  ];

  menuItems.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumbnail-menu-item";
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      item.action();
      closeMenu();
    });
    menu.appendChild(btn);
  });

  overlayRight.appendChild(menuButton);
  overlayRight.appendChild(menu);

  overlay.appendChild(overlayLeft);
  overlay.appendChild(overlayRight);
  
  imageWrapper.appendChild(mainImage);
  imageWrapper.appendChild(overlay);
  mainContainer.appendChild(imageWrapper);
  
  // 缩略图容器
  const thumbContainer = document.createElement("div");
  thumbContainer.className = "thumbnail-bar-container";
  
  const thumbBar = document.createElement("div");
  thumbBar.className = "thumbnail-bar";
  
  let currentIndex = 0;

  function toggleMenu() {
    const isOpen = menu.classList.contains("open");
    menu.classList.toggle("open", !isOpen);
    menu.setAttribute("aria-hidden", isOpen ? "true" : "false");
  }

  function closeMenu() {
    if (document.activeElement && menu.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
  }

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  mainContainer.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });

  mainContainer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
  
  // 辅助函数：平滑滚动缩略图条到选中位置（不触发页面滚动）
  const scrollThumbBarToIndex = (index) => {
    const thumb = thumbBar.querySelector(`[data-index="${index}"]`);
    if (!thumb) return;
    
    const thumbLeft = thumb.offsetLeft;
    const thumbWidth = thumb.offsetWidth;
    const barWidth = thumbBar.clientWidth;
    
    // 计算要滚动到的位置，使缩图在中央
    const targetScroll = thumbLeft + thumbWidth / 2 - barWidth / 2;
    
    // 直接设置 scrollLeft，CSS 的 scroll-behavior: smooth 会自动平滑过渡
    thumbBar.scrollLeft = targetScroll;
  };
  
  images.forEach((image, i) => {
    const thumb = document.createElement("img");
    thumb.className = i === 0 ? "thumbnail active" : "thumbnail";
    thumb.dataset.index = i;
    thumb.src = getImageUrl(image.path, { preview: true, width: '300' });
    thumb.alt = image.caption || "";
    thumb.addEventListener("click", () => {
      currentIndex = i;
      setPreviewImage(mainImage, image.path);
      mainImage.alt = image.caption || "";
      caption.textContent = image.caption || "";
      thumbBar.querySelectorAll(".thumbnail").forEach((t, j) => {
        t.classList.toggle("active", j === i);
      });
      // 自动滚动缩略图条到选中位置
      scrollThumbBarToIndex(i);
    });
    thumbBar.appendChild(thumb);
  });
  
  // 等待所有縮圖加載完成後再檢查對齐
  // 這樣可以確保 scrollWidth 和 clientWidth 都有正確的值
  let loadedCount = 0;
  const imageTotal = images.length;
  
  const checkAlignmentWhenReady = () => {
    loadedCount++;
    if (loadedCount === imageTotal) {
      // 所有圖片加載完成，使用 requestAnimationFrame 確保最終佈局已計算
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateThumbBarAlignment();
        });
      });
    }
  };
  
  // 為每個縮圖添加 load 和 error 事件監聽器
  thumbBar.querySelectorAll('.thumbnail').forEach((thumb) => {
    if (thumb.complete) {
      // 圖片已從緩存加載或已失敗
      checkAlignmentWhenReady();
    } else {
      thumb.addEventListener('load', checkAlignmentWhenReady, { once: true });
      thumb.addEventListener('error', checkAlignmentWhenReady, { once: true });
    }
  });
  
  // 檢測是否有滾動條，動態改變對齐方式
  // 使用 requestAnimationFrame 確保 DOM 已完全渲染
  const updateThumbBarAlignment = () => {
    const hasScroll = thumbBar.scrollWidth > thumbBar.clientWidth;
    thumbBar.style.justifyContent = hasScroll ? "flex-start" : "center";
  };
  
  // 使用 ResizeObserver 監視寬度變化（當窗口縮放時跟著改變）
  const resizeObserver = new ResizeObserver(() => {
    updateThumbBarAlignment();
  });
  resizeObserver.observe(thumbBar);
  
  // 備用超時檢查，確保即使圖片加載事件未觸發也能設定對齐
  setTimeout(() => {
    updateThumbBarAlignment();
  }, 1000);
  
  // 點擊大圖自動輪替到下一張
  mainImage.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    const nextImage = images[currentIndex];
    setPreviewImage(mainImage, nextImage.path);
    mainImage.alt = nextImage.caption || "";
    caption.textContent = nextImage.caption || "";
    thumbBar.querySelectorAll(".thumbnail").forEach((t, j) => {
      t.classList.toggle("active", j === currentIndex);
    });
    // 自動滾動縮圖條到當前位置
    scrollThumbBarToIndex(currentIndex);
  });
  mainImage.style.cursor = "pointer";
  
  thumbContainer.appendChild(thumbBar);
  
  ui.grid.appendChild(mainContainer);
  ui.grid.appendChild(thumbContainer);
}

const albumId = getAlbumId();
if (!albumId) {
  ui.grid.textContent = "Missing album id.";
} else {
  loadAlbum(albumId);
}
