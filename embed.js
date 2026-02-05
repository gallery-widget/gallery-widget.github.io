import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://eooudvssawtdtttrwyfr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sX69Y-P_n8QgAkrcb8gGtQ_FoKhG9mj";
const BUCKET = "album";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ui = {
  grid: document.getElementById("embedGrid"),
};

function getAlbumId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("album");
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
  mainImage.src = supabase.storage.from(BUCKET).getPublicUrl(images[0].path).data.publicUrl;
  mainImage.alt = images[0].caption || "";
  
  const overlay = document.createElement("div");
  overlay.className = "slideshow-overlay";
  
  const title = document.createElement("h1");
  title.className = "slideshow-title";
  title.textContent = album.title || "Gallery";
  
  const caption = document.createElement("p");
  caption.className = "slideshow-caption";
  caption.textContent = images[0].caption || "";
  
  overlay.appendChild(title);
  overlay.appendChild(caption);
  
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
    mainImage.src = supabase.storage.from(BUCKET).getPublicUrl(images[index].path).data.publicUrl;
    mainImage.alt = images[index].caption || "";
    caption.textContent = images[index].caption || "";
    
    dots.querySelectorAll(".dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
    });
  }
  
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
  mainImage.src = supabase.storage.from(BUCKET).getPublicUrl(images[0].path).data.publicUrl;
  mainImage.alt = images[0].caption || "";
  
  const overlay = document.createElement("div");
  overlay.className = "thumbnail-overlay";

  const overlayLeft = document.createElement("div");
  overlayLeft.className = "thumbnail-overlay-left";
  
  const title = document.createElement("h1");
  title.className = "thumbnail-title";
  title.textContent = album.title || "Gallery";
  
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
    { label: "開啟圖片", action: () => openCurrentImage() },
    { label: "另存圖片", action: () => downloadCurrentImage() },
    { label: "複製圖片", action: () => copyCurrentImage() },
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

  function getCurrentImage() {
    return images[currentIndex];
  }

  function openBuilder() {
    window.open("https://ebluvu.github.io/gallery-widget-v1/", "_blank", "noopener");
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

  function openCurrentImage() {
    const image = getCurrentImage();
    const url = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
    window.open(url, "_blank", "noopener");
  }

  function downloadCurrentImage() {
    const image = getCurrentImage();
    const url = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
    
    // 嘗試直接下載，部分環境（如 Notion iframe）可能需要在新視窗中下載
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
          // 嘗試直接點擊下載
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(blobUrl);
        })
        .catch(error => {
          console.error('下載錯誤:', error);
          // Notion iframe 可能無法直接下載，改為新視窗開啟
          window.open(url, "_blank", "noopener");
          alert("若無法下載，請在新視窗中右鍵點擊圖片選擇另存新檔。");
        });
    } catch (error) {
      console.error('下載失敗:', error);
      // 備用：直接在新視窗開啟
      window.open(url, "_blank", "noopener");
    }
  }

  async function copyCurrentImage() {
    const image = getCurrentImage();
    const url = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
    
    // 檢查瀏覽器支援
    if (!navigator.clipboard || !window.ClipboardItem) {
      alert("此瀏覽器不支援複製圖片功能。");
      return;
    }
    
    try {
      // 使用 fetch 獲取圖片
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('無法載入圖片');
      }
      
      const blob = await response.blob();
      
      // 嘗試轉換為 PNG（更廣泛支援）
      let clipboardBlob = blob;
      if (blob.type !== 'image/png') {
        try {
          // 創建 canvas 轉換為 PNG
          const img = await createImageBitmap(blob);
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          clipboardBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        } catch {
          // 如果轉換失敗，使用原始 blob
          clipboardBlob = blob;
        }
      }
      
      // 寫入剪貼簿
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': clipboardBlob
        })
      ]);
      
      // 成功後關閉選單並移除焦點
      closeMenu();
      menuButton.blur();
    } catch (error) {
      console.error('複製錯誤:', error);
      
      // Notion iframe 可能無法複製，嘗試複製 URL 作為備用
      try {
        await navigator.clipboard.writeText(url);
        alert("此環境不支援圖片複製（如 Notion iframe），已複製圖片網址。\n建議用【另存圖片】功能。");
      } catch {
        alert("複製失敗。此環境可能限制了剪貼簿存取。\n建議改用【另存圖片】或【開啟圖片】功能。");
      }
    }
  }

  function toggleMenu() {
    const isOpen = menu.classList.contains("open");
    menu.classList.toggle("open", !isOpen);
    menu.setAttribute("aria-hidden", isOpen ? "true" : "false");
  }

  function closeMenu() {
    // 先移除焦點避免 aria-hidden 警告
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

  document.addEventListener("click", () => {
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
  
  images.forEach((image, i) => {
    const thumb = document.createElement("img");
    thumb.className = i === 0 ? "thumbnail active" : "thumbnail";
    thumb.src = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
    thumb.alt = image.caption || "";
    thumb.addEventListener("click", () => {
      currentIndex = i;
      mainImage.src = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
      mainImage.alt = image.caption || "";
      caption.textContent = image.caption || "";
      thumbBar.querySelectorAll(".thumbnail").forEach((t, j) => {
        t.classList.toggle("active", j === i);
      });
    });
    thumbBar.appendChild(thumb);
  });
  
  // 點擊大圖自動輪替到下一張
  mainImage.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % images.length;
    const nextImage = images[currentIndex];
    mainImage.src = supabase.storage.from(BUCKET).getPublicUrl(nextImage.path).data.publicUrl;
    mainImage.alt = nextImage.caption || "";
    caption.textContent = nextImage.caption || "";
    thumbBar.querySelectorAll(".thumbnail").forEach((t, j) => {
      t.classList.toggle("active", j === currentIndex);
    });
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
