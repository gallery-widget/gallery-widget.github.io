# 圖庫小工具 - Gallery Widget
可嵌入的圖庫小工具<br>
本網站為 AI 輔助開發，僅作為分享用途<br>
本網站不會竊取或儲存個人隱私資訊，圖片存儲於 Supabase<br>

## 功能說明
- 使用 Supabase 驗證 + 資料庫 + 儲存的前端圖庫管理工具
- 支援匿名建立相簿 + 可嵌入的公開頁面
- Magic Link 登入後可編輯管理你的相簿
- 拖曳排序圖片、即時預覽、兩種展示主題

## 資料表結構
### albums
- id uuid primary key
- owner_id uuid (nullable, references auth.users)
- title text
- theme text (slideshow | thumbnail)
- background_color text (支援 rgba)
- add_new_first boolean default false
- sort_order integer (nullable, 用於拖曳排序)
- created_at timestamp default now()

### images
- id uuid primary key
- album_id uuid references albums(id)
- path text
- caption text
- sort_order int
- width int
- height int
- created_at timestamp default now()

## RLS 權限設定
- 公開可讀取 albums/images
- 公開可建立 albums/images (owner_id 為 null)
- 已驗證用戶可讀取自己的 albums
- 已驗證用戶可更新/刪除自己的 albums/images
- 匿名和登入用戶都可刪除相片
- 只有登入用戶可刪除相簿

## 檔案說明
- index.html: 管理介面
- embed.html: 公開展示頁面 (使用 ?album=<id>)
- app.js / embed.js: Supabase 邏輯
- styles.css: 共用樣式

## 主題模式
- slideshow: 幻燈片模式
- thumbnail: 縮略圖模式
