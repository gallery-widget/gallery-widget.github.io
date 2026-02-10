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

// 快速設置圖片 - 直接用低品質快速版
function setPreviewImage(imgEl, path, options = {}) {
  const url = getImageUrl(path, {
    preview: true,
    quality: options.quality || '50',
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

function normalizeExternalLink(value) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function createImageLinkButton() {
  const link = document.createElement("a");
  link.className = "image-link-btn hidden";
  link.setAttribute("aria-label", "開啟自訂連結");
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  link.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.59 13.41a1.99 1.99 0 0 0 2.82 0l3.88-3.88a2 2 0 0 0-2.83-2.83l-1.29 1.3a1 1 0 0 1-1.41-1.42l1.29-1.29a4 4 0 0 1 5.66 5.66l-3.88 3.88a4 4 0 0 1-5.66 0 1 1 0 0 1 1.42-1.42z" />
      <path d="M13.41 10.59a1.99 1.99 0 0 0-2.82 0l-3.88 3.88a2 2 0 1 0 2.83 2.83l1.29-1.3a1 1 0 0 1 1.41 1.42l-1.29 1.29a4 4 0 0 1-5.66-5.66l3.88-3.88a4 4 0 0 1 5.66 0 1 1 0 1 1-1.42 1.42z" />
    </svg>
  `;
  return link;
}

/* ============================================
   共用工廠函數 - 減少主題間重複代碼
   ============================================ */

/**
 * 創建選單系統
 * @param {HTMLElement} container - 使用者互動的容器（用於點擊關閉）
 * @param {string} menuClass - 選單樣式類名（如 "slideshow-menu"）
 * @param {Array<{label, action}>} menuItems - 選單項目
 * @returns {Object} 包含 menu、menuButton、toggle、close 函數
 */
function createMenuSystem(container, menuClass, menuItems) {
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = menuClass.replace("menu", "menu-btn");
  menuButton.setAttribute("aria-label", "開啟選單");
  menuButton.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = menuClass;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");

  const toggleMenu = () => {
    const isOpen = menu.classList.toggle("open");
    menu.setAttribute("aria-hidden", !isOpen);
  };

  const closeMenu = () => {
    if (document.activeElement && menu.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    menu.classList.remove("open");
    menu.setAttribute("aria-hidden", "true");
  };

  // 創建選單項目
  menuItems.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = menuClass.replace("menu", "menu-item");
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      item.action();
      closeMenu();
    });
    menu.appendChild(btn);
  });

  // 設置事件監聽
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

  return { menu, menuButton, toggleMenu, closeMenu };
}

/**
 * 創建幻燈片控制器
 * @param {HTMLElement} imagesScroll - 圖片捲動容器
 * @param {Array} images - 圖片數據
 * @param {Object} ui - UI 元素 { caption, linkButton, indicators, thumbBar?, scrollThumbBarToIndex? }
 * @returns {Object} { goToSlide, currentIndex }
 */
function createCarouselController(imagesScroll, images, ui) {
  let currentIndex = 0;
  let isAnimating = false;

  const goToSlide = (newIndex) => {
    if (isAnimating || newIndex === currentIndex) return;
    isAnimating = true;

    // 計算捲動距離（負值向左移動）
    const translateX = -(newIndex * 100);
    imagesScroll.style.transform = `translateX(${translateX}%)`;

    // 更新字幕和連結按鈕
    ui.caption.textContent = images[newIndex].caption || "";
    setImageLink(ui.linkButton, images[newIndex].custom_link);

    // 更新指示器（dots 或 thumbnails）
    if (ui.indicators && Array.isArray(ui.indicators)) {
      ui.indicators.forEach((indicator, i) => {
        indicator.classList.toggle("active", i === newIndex);
      });
    }

    // 如果有縮圖條，自動捲動到選中位置
    if (ui.thumbBar && ui.scrollThumbBarToIndex) {
      ui.scrollThumbBarToIndex(newIndex);
    }

    // 動畫完成後更新狀態
    setTimeout(() => {
      currentIndex = newIndex;
      isAnimating = false;
    }, 500);
  };

  return { goToSlide, get currentIndex() { return currentIndex; } };
}

/**
 * 設置導航按鈕
 * @param {HTMLElement} prevBtn - 上一張按鈕
 * @param {HTMLElement} nextBtn - 下一張按鈕
 * @param {HTMLElement} imageWrapper - 大圖容器（用於點擊事件）
 * @param {Function} goToSlide - 切換函數
 * @param {number} imageCount - 圖片總數
 * @param {Function} getCurrentIndex - 獲取當前索引
 */
function setupNavigation(prevBtn, nextBtn, imageWrapper, goToSlide, imageCount, getCurrentIndex) {
  prevBtn.addEventListener("click", () => {
    const currentIndex = getCurrentIndex();
    const newIndex = (currentIndex - 1 + imageCount) % imageCount;
    goToSlide(newIndex);
  });

  nextBtn.addEventListener("click", () => {
    const currentIndex = getCurrentIndex();
    const newIndex = (currentIndex + 1) % imageCount;
    goToSlide(newIndex);
  });

  // 點擊大圖自動輪替到下一張
  imageWrapper.addEventListener("click", () => {
    const currentIndex = getCurrentIndex();
    const newIndex = (currentIndex + 1) % imageCount;
    goToSlide(newIndex);
  });
  imageWrapper.style.cursor = "pointer";

  return { prevBtn, nextBtn };
}


function setImageLink(linkEl, value) {
  const href = normalizeExternalLink(value);
  if (!href) {
    linkEl.classList.add("hidden");
    linkEl.removeAttribute("href");
    return;
  }
  linkEl.href = href;
  linkEl.classList.remove("hidden");
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

  // 雙層背景系統：底層是 Notion 主題色（系統深淺色），上層是用戶自訂色
  const userBgColor = album.background_color || "#0c1117";
  
  document.body.style.background = userBgColor;
  document.documentElement.style.background = userBgColor;
  
  // 設定底層 Notion 主題背景（使用相簿設定中的 notion_block_color）
  updateNotionThemeBackground(album.notion_block_color || 'default');
  
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
  
  // 建立滾動容器，包含所有圖片
  const imagesScroll = document.createElement("div");
  imagesScroll.className = "slideshow-images-scroll";
  
  images.forEach((image) => {
    const slide = document.createElement("div");
    slide.className = "slideshow-image-slide";
    
    const img = document.createElement("img");
    setPreviewImage(img, image.path);
    img.alt = image.caption || "";
    
    slide.appendChild(img);
    imagesScroll.appendChild(slide);
  });
  
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

  const linkButton = createImageLinkButton();
  setImageLink(linkButton, images[0].custom_link);
  
  overlayLeft.appendChild(title);
  overlayLeft.appendChild(caption);
  overlayLeft.appendChild(linkButton);

  const overlayRight = document.createElement("div");
  overlayRight.className = "slideshow-overlay-right";

  // 建立導航按鈕
  const prevBtn = document.createElement("button");
  prevBtn.className = "slideshow-btn prev";
  prevBtn.textContent = "‹";
  
  const nextBtn = document.createElement("button");
  nextBtn.className = "slideshow-btn next";
  nextBtn.textContent = "›";
  
  // 建立 dots
  const dots = document.createElement("div");
  dots.className = "slideshow-dots";
  
  images.forEach((image, i) => {
    const dot = document.createElement("span");
    dot.className = i === 0 ? "dot active" : "dot";
    dots.appendChild(dot);
  });
  
  // 建立幻燈片控制器
  const carousel = createCarouselController(imagesScroll, images, {
    caption,
    linkButton,
    indicators: Array.from(dots.querySelectorAll(".dot"))
  });
  
  // 塞 dots 點擊事件
  dots.querySelectorAll(".dot").forEach((dot, i) => {
    dot.addEventListener("click", () => carousel.goToSlide(i));
  });
  
  // 建立菜單系統
  const menuItems = [
    { label: "全螢幕", action: () => toggleFullscreen() },
    { label: "開啟圖片", action: () => openCurrentImage(() => images[carousel.currentIndex]) },
    { label: "另存圖片", action: () => downloadCurrentImage(() => images[carousel.currentIndex]) },
    { label: "複製圖片", action: () => copyCurrentImage(() => images[carousel.currentIndex]) },
    { label: "建立你的相簿", action: () => openBuilder() },
  ];
  
  const { menu, menuButton } = createMenuSystem(container, "slideshow-menu", menuItems);

  overlayRight.appendChild(menuButton);
  overlayRight.appendChild(menu);
  
  overlay.appendChild(overlayLeft);
  overlay.appendChild(overlayRight);
  
  imageWrapper.appendChild(imagesScroll);
  
  // 設置導航
  setupNavigation(prevBtn, nextBtn, imageWrapper, carousel.goToSlide, images.length, () => carousel.currentIndex);

  container.appendChild(overlay);
  container.appendChild(imageWrapper);
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  container.appendChild(dots);
  ui.grid.appendChild(container);
}

function renderThumbnail(album, images) {
  const mainContainer = document.createElement("div");
  mainContainer.className = "thumbnail-main-container";
  
  const imageWrapper = document.createElement("div");
  imageWrapper.className = "thumbnail-image-wrapper";
  
  const imagesScroll = document.createElement("div");
  imagesScroll.className = "thumbnail-images-scroll";
  
  images.forEach((image) => {
    const slide = document.createElement("div");
    slide.className = "thumbnail-image-slide";
    
    const img = document.createElement("img");
    setPreviewImage(img, image.path);
    img.alt = image.caption || "";
    
    slide.appendChild(img);
    imagesScroll.appendChild(slide);
  });
  
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

  const linkButton = createImageLinkButton();
  setImageLink(linkButton, images[0].custom_link);

  overlayLeft.appendChild(title);
  overlayLeft.appendChild(caption);
  overlayLeft.appendChild(linkButton);

  const overlayRight = document.createElement("div");
  overlayRight.className = "thumbnail-overlay-right";

  // 縮略圖容器
  const thumbContainer = document.createElement("div");
  thumbContainer.className = "thumbnail-bar-container";
  
  const thumbBar = document.createElement("div");
  thumbBar.className = "thumbnail-bar";
  
  // 建立縮略圖
  images.forEach((image, i) => {
    const thumb = document.createElement("img");
    thumb.className = i === 0 ? "thumbnail active" : "thumbnail";
    thumb.dataset.index = i;
    thumb.src = getImageUrl(image.path, { preview: true, quality: '20' });
    thumb.alt = image.caption || "";
    thumbBar.appendChild(thumb);
  });
  
  // 輔助函數：平滑捲動縮略圖條到選中位置
  const scrollThumbBarToIndex = (index) => {
    const thumb = thumbBar.querySelector(`[data-index="${index}"]`);
    if (!thumb) return;
    
    const thumbLeft = thumb.offsetLeft;
    const thumbWidth = thumb.offsetWidth;
    const barWidth = thumbBar.clientWidth;
    const targetScroll = thumbLeft + thumbWidth / 2 - barWidth / 2;
    thumbBar.scrollLeft = targetScroll;
  };
  
  // 建立幻燈片控制器
  const thumbnails = Array.from(thumbBar.querySelectorAll(".thumbnail"));
  const carousel = createCarouselController(imagesScroll, images, {
    caption,
    linkButton,
    indicators: thumbnails,
    thumbBar,
    scrollThumbBarToIndex
  });
  
  // 為縮略圖添加點擊事件
  thumbnails.forEach((thumb, i) => {
    thumb.addEventListener("click", () => carousel.goToSlide(i));
  });
  
  // 建立菜單系統
  const menuItems = [
    { label: "全螢幕", action: () => toggleFullscreen() },
    { label: "開啟圖片", action: () => openCurrentImage(() => images[carousel.currentIndex]) },
    { label: "另存圖片", action: () => downloadCurrentImage(() => images[carousel.currentIndex]) },
    { label: "複製圖片", action: () => copyCurrentImage(() => images[carousel.currentIndex]) },
    { label: "建立你的相簿", action: () => openBuilder() },
  ];
  
  const { menu, menuButton } = createMenuSystem(mainContainer, "thumbnail-menu", menuItems);

  overlayRight.appendChild(menuButton);
  overlayRight.appendChild(menu);

  overlay.appendChild(overlayLeft);
  overlay.appendChild(overlayRight);
  
  imageWrapper.appendChild(imagesScroll);
  imageWrapper.appendChild(overlay);
  mainContainer.appendChild(imageWrapper);
  
  // 設定縮略圖條對齐
  const updateThumbBarAlignment = () => {
    const hasScroll = thumbBar.scrollWidth > thumbBar.clientWidth;
    thumbBar.style.justifyContent = hasScroll ? "flex-start" : "center";
  };
  
  // 等待所有縮圖載入完成
  let loadedCount = 0;
  const imageTotal = images.length;
  
  const checkAlignmentWhenReady = () => {
    loadedCount++;
    if (loadedCount === imageTotal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateThumbBarAlignment();
        });
      });
    }
  };
  
  // 為每個縮圖添加載入事件
  thumbnails.forEach((thumb) => {
    if (thumb.complete) {
      checkAlignmentWhenReady();
    } else {
      thumb.addEventListener('load', checkAlignmentWhenReady, { once: true });
      thumb.addEventListener('error', checkAlignmentWhenReady, { once: true });
    }
  });
  
  // 監視視窗寬度變化
  const resizeObserver = new ResizeObserver(() => {
    updateThumbBarAlignment();
  });
  resizeObserver.observe(thumbBar);
  
  // 備用超時檢查
  setTimeout(() => {
    updateThumbBarAlignment();
  }, 1000);
  
  // 設置導航
  const prevBtn = document.createElement("button");
  prevBtn.className = "slideshow-btn prev";
  prevBtn.textContent = "‹";
  
  const nextBtn = document.createElement("button");
  nextBtn.className = "slideshow-btn next";
  nextBtn.textContent = "›";
  
  setupNavigation(prevBtn, nextBtn, imageWrapper, carousel.goToSlide, images.length, () => carousel.currentIndex);
  
  thumbContainer.appendChild(thumbBar);
  
  ui.grid.appendChild(mainContainer);
  ui.grid.appendChild(thumbContainer);
}

// Notion 主題檢測與背景設定
function isFromNotion() {
  // 檢查 referrer 是否來自 Notion
  const referrer = document.referrer.toLowerCase();
  return referrer.includes('notion.so') || referrer.includes('notion.site');
}

// Notion 區塊顏色映射表（深淺模式）
const NOTION_BLOCK_COLORS = {
  default: {
    dark: '#191919',
    light: '#ffffff'
  },
  gray: {
    dark: '#383836',
    light: '#f0efed'
  },
  tea: {
    dark: '#45362d',
    light: '#f5ede9'
  },
  orange: {
    dark: '#53361f',
    light: '#fbebde'
  },
  yellow: {
    dark: '#504425',
    light: '#f9f3dc'
  },
  green: {
    dark: '#263d30',
    light: '#e8f1ec'
  },
  blue: {
    dark: '#233850',
    light: '#e5f2fc'
  },
  purple: {
    dark: '#3c2d47',
    light: '#f3ebf9'
  },
  pink: {
    dark: '#4e2b3c',
    light: '#fae9f1'
  },
  red: {
    dark: '#502c29',
    light: '#fce9e7'
  }
};

/**
 * 檢測背景色
 */
function detectActualBackgroundColor(notionBlockColor = 'default') {
  try {
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const colorObj = NOTION_BLOCK_COLORS[notionBlockColor] || NOTION_BLOCK_COLORS.default;
    const resolvedColor = isDark ? colorObj.dark : colorObj.light;

    console.log('[背景檢測] notionBlockColor:', notionBlockColor);
    console.log('[背景檢測] isDark:', isDark);
    console.log('[背景檢測] resolvedColor:', resolvedColor);

    if (notionBlockColor === 'default' && isDark) {
      // 檢查是否在 Notion 預覽模式
      // 預覽模式下 body 會有 notion-body class
      const bodyClass = document.body.className;
      const isNotionPreviewMode = bodyClass.includes('notion-body');
      console.log('[背景檢測] body.className:', bodyClass);
      console.log('[背景檢測] isNotionPreviewMode:', isNotionPreviewMode);
      if (isNotionPreviewMode) {
        console.log('[背景檢測] ✓ 使用預覽模式深色 #202020');
        return '#202020';
      }
    }

    return resolvedColor;
  } catch (e) {
    return '#ffffff';
  }
}

function updateNotionThemeBackground(notionBlockColor = 'default') {
  const themeLayer = document.querySelector('.notion-theme-bg');
  
  if (!themeLayer) {
    return;
  }
  
  // 只有來自 Notion 時才套用主題檢測
  if (isFromNotion()) {
    // 延遲執行，確保 Notion 預覽模式已完全初始化
    requestAnimationFrame(() => {
      const actualBgColor = detectActualBackgroundColor(notionBlockColor);
      themeLayer.style.background = actualBgColor;
    });
  } else {
    // 非 Notion 環境時，底層設為透明，只顯示用戶自訂背景色
    themeLayer.style.background = 'transparent';
  }
}

// 監聽主題變化（只在 Notion 環境中有效）
if (window.matchMedia && isFromNotion()) {
  window.matchMedia('(prefers-color-scheme: dark)').addListener(() => {
    // 需要重新取得相簿設定中的 notion_block_color
    const albumId = getAlbumId();
    if (albumId) {
      supabase
        .from('albums')
        .select('notion_block_color')
        .eq('id', albumId)
        .single()
        .then(({ data }) => {
          updateNotionThemeBackground(data?.notion_block_color || 'default');
        });
    }
  });
}

const albumId = getAlbumId();
if (!albumId) {
  ui.grid.textContent = "Missing album id.";
} else {
  loadAlbum(albumId);
}
