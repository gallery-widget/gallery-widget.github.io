// 預覽窗口拖拉調整尺寸功能
const container = document.getElementById('previewContainer');
const handle = document.getElementById('resizeHandle');

let isResizing = false;
let lastX = 0;
let lastY = 0;

// 設置預設大小
function setDefaultSize() {
  // 移除內聯的 resize 樣式，讓它使用預設寬度
  container.style.width = '';
  container.style.height = '420px'; // 預設高度
}

// 獲取容器的最大寬度（父容器的寬度扣除padding）
function getMaxWidth() {
  const parent = container.parentElement;
  if (!parent) return Infinity;
  
  // 獲取父容器的寬度（包括padding）
  const parentWidth = parent.offsetWidth;
  return parentWidth;
}

// 初始化時設置預設大小
setDefaultSize();

// 滑鼠按下時開始調整
handle.addEventListener('mousedown', (e) => {
  isResizing = true;
  lastX = e.clientX;
  lastY = e.clientY;
  
  // 如果還沒有設置寬度，先設置當前寬度
  if (!container.style.width) {
    container.style.width = container.offsetWidth + 'px';
  }
  
  // 防止文字被選中
  e.preventDefault();
  
  // 添加視覺反饋
  handle.style.opacity = '1';
  container.style.opacity = '0.95';
});

// 滑鼠移動時更新尺寸
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const deltaX = e.clientX - lastX;
  const deltaY = e.clientY - lastY;
  
  const newWidth = container.offsetWidth + deltaX;
  const newHeight = container.offsetHeight + deltaY;
  
  const maxWidth = getMaxWidth();
  
  // 設定最小和最大尺寸
  if (newWidth >= 200 && newWidth <= maxWidth) {
    container.style.width = newWidth + 'px';
  }
  if (newHeight >= 200) {
    container.style.height = newHeight + 'px';
  }
  
  lastX = e.clientX;
  lastY = e.clientY;
});

// 滑鼠釋放時停止調整
document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    handle.style.opacity = '0.5';
    container.style.opacity = '1';
  }
});

// 離開窗口時停止調整
document.addEventListener('mouseleave', () => {
  if (isResizing) {
    isResizing = false;
    handle.style.opacity = '0.5';
    container.style.opacity = '1';
  }
});
