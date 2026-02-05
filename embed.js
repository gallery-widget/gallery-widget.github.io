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
  
  const title = document.createElement("h1");
  title.className = "thumbnail-title";
  title.textContent = album.title || "Gallery";
  
  const caption = document.createElement("p");
  caption.className = "thumbnail-caption";
  caption.textContent = images[0].caption || "";
  
  overlay.appendChild(title);
  overlay.appendChild(caption);
  
  imageWrapper.appendChild(mainImage);
  imageWrapper.appendChild(overlay);
  mainContainer.appendChild(imageWrapper);
  
  // 缩略图容器
  const thumbContainer = document.createElement("div");
  thumbContainer.className = "thumbnail-bar-container";
  
  const thumbBar = document.createElement("div");
  thumbBar.className = "thumbnail-bar";
  
  images.forEach((image, i) => {
    const thumb = document.createElement("img");
    thumb.className = i === 0 ? "thumbnail active" : "thumbnail";
    thumb.src = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
    thumb.alt = image.caption || "";
    thumb.addEventListener("click", () => {
      mainImage.src = supabase.storage.from(BUCKET).getPublicUrl(image.path).data.publicUrl;
      mainImage.alt = image.caption || "";
      caption.textContent = image.caption || "";
      thumbBar.querySelectorAll(".thumbnail").forEach((t, j) => {
        t.classList.toggle("active", j === i);
      });
    });
    thumbBar.appendChild(thumb);
  });
  
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
